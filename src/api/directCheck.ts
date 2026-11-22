import { Platform } from 'react-native';
import { backendUrl, isBackendConfigured } from '../services/backend';

// Direct check: for services ToS;DR does not rate yet, fetch the service's
// OWN terms/privacy pages and extract findings ONLY from verbatim quotes.
//
// Rules enforced here (never relax them):
//  - Findings are exact sentences copied from the fetched pages, never
//    paraphrases and never model-generated claims. If a sentence is long it
//    is kept whole; over-long sentences are skipped, not summarized.
//  - A topic with no matching sentence is reported as "not stated".
//  - The model never assigns a grade. When the server has a model key it
//    returns an ESTIMATED grade (server/src/caseRating.ts): the model only
//    proposes ToS;DR cases plus quotes, quotes not found on the page are
//    dropped, and the letter comes from ToS;DR's own formula. The UI always
//    labels it "Estimated · not reviewed by ToS;DR". Without a rating the
//    result is labelled "Unrated · direct check".
//  - Only pages on the site the user supplied are fetched, and only the
//    well-known policy paths below are tried.
//
// Note: React Native's fetch is not subject to browser CORS rules, so
// fetching third-party policy pages from the app works where a plain web
// page would be blocked. If a site blocks automated fetching, the check
// reports which URLs failed instead of guessing.

export interface DirectCheckFinding {
  topic: string;
  quote: string;
  sourceUrl: string;
}

export interface DirectCheckResult {
  id: string;
  name: string;
  siteUrl: string;
  fetchedAt: string; // ISO timestamp
  fetchedUrls: string[];
  failedUrls: string[];
  findings: DirectCheckFinding[];
  notStatedTopics: string[];
  iconUrl?: string; // icon the homepage declares; absent on older saved checks
  // Estimated ToS;DR-style grade (server/src/caseRating.ts): model-matched
  // ToS;DR cases, each backed by a quote verified against the page text,
  // graded with ToS;DR's own formula. Absent when the server has no model
  // key, when rating failed (see ratingError), or on older saved checks.
  rating?: DirectCheckRating;
  ratingError?: 'not-configured' | 'failed';
}

export interface DirectCheckRatedPoint {
  caseId: number;
  caseTitle: string;
  classification: string; // good | neutral | bad | blocker
  quote: string;
  sourceUrl: string;
}

export interface DirectCheckRating {
  grade: string; // A–E or N/A
  points: DirectCheckRatedPoint[];
  counts: { good: number; bad: number; blocker: number; neutral: number };
  model: string;
  textTruncated: boolean;
  incomplete?: boolean; // some case batches failed (e.g. model quota), so cases may be missing
}

interface TopicRule {
  topic: string;
  keywords: string[];
}

export const DIRECT_CHECK_TOPICS: TopicRule[] = [
  {
    topic: 'AI training',
    keywords: ['train', 'training', 'machine learning', 'ai model', 'artificial intelligence'],
  },
  {
    topic: 'Automated decisions',
    keywords: ['automated decision', 'profiling', 'solely automated'],
  },
  {
    topic: 'Data sharing',
    keywords: ['share', 'shared', 'third part', 'sell', 'advertis'],
  },
  {
    topic: 'Data retention',
    keywords: ['retain', 'retention', 'stored for', 'delete after', 'deletion'],
  },
  {
    topic: 'Account deletion',
    keywords: ['delete your account', 'close your account', 'terminate your account'],
  },
];

const POLICY_PATHS = [
  '/privacy',
  '/privacy-policy',
  '/terms',
  '/terms-of-service',
  '/legal/privacy',
  '/legal/terms',
];

const MAX_SENTENCE_CHARS = 600;

// React Native's URL class throws on .host/.protocol ("not implemented"),
// so site URLs are parsed with plain string handling instead.
const ORIGIN_RE = /^(https?):\/\/([^/?#\s]+)/i;

export function normalizeSiteUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Enter the service website address.');
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const match = ORIGIN_RE.exec(withScheme);
  if (!match || !/^[a-z0-9.-]+(:\d+)?$/i.test(match[2]) || !match[2].includes('.')) {
    throw new Error('Enter a website address like example.com.');
  }
  return `${match[1].toLowerCase()}://${match[2].toLowerCase()}`;
}

/** Resolve an href found on a page at pageUrl into an absolute https URL. */
function resolveHref(href: string, pageUrl: string): string | undefined {
  const clean = href.trim().replace(/&amp;/g, '&');
  if (clean === '' || /^(data|javascript):/i.test(clean)) {
    return undefined;
  }
  if (/^https?:\/\//i.test(clean)) {
    return clean;
  }
  const origin = ORIGIN_RE.exec(pageUrl);
  if (!origin) {
    return undefined;
  }
  if (clean.startsWith('//')) {
    return `${origin[1]}:${clean}`;
  }
  if (clean.startsWith('/')) {
    return `${origin[1]}://${origin[2]}${clean}`;
  }
  // A bare origin ("https://site.com") has no path: its directory is "/".
  const path = pageUrl.replace(/[?#].*$/, '').slice(origin[0].length) || '/';
  const dir = `${origin[0]}${path.replace(/[^/]*$/, '')}`;
  return `${dir.endsWith('/') ? dir : `${dir}/`}${clean}`;
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

/**
 * Pick the best icon a homepage declares in its <link> tags. Prefers
 * apple-touch-icon (large PNG), then the largest PNG/SVG icon, then any
 * icon. Falls back to /favicon.ico; ServiceLogo shows a letter tile if
 * that fails to load.
 */
export function extractIconUrl(html: string, pageUrl: string): string {
  let best: { url: string; score: number } | undefined;
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (attr(tag, 'rel') ?? '').toLowerCase();
    const href = attr(tag, 'href');
    if (!href || !/\bicon\b/.test(rel) || rel.includes('mask-icon')) {
      continue;
    }
    const url = resolveHref(href, pageUrl);
    if (!url) {
      continue;
    }
    const size = Number((attr(tag, 'sizes') ?? '').split(/x/i)[0]) || 0;
    let score = rel.includes('apple-touch-icon') ? 3000 : 1000;
    if (/\.(png|svg)(\?|$)/i.test(url)) {
      score += 500;
    }
    score += Math.min(size, 512);
    if (!best || score > best.score) {
      best = { url, score };
    }
  }
  return best?.url ?? `${ORIGIN_RE.exec(pageUrl)?.[0] ?? pageUrl}/favicon.ico`;
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|p|div|li|h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 40 && s.length <= MAX_SENTENCE_CHARS);
}

// --- Getting the policy text ---------------------------------------------
//
// Preferred: our own server (server/src/policyPages.ts). It is not subject
// to browser CORS rules, follows the site's real privacy/terms links, and
// renders JavaScript-only sites in headless Chrome. Used whenever
// EXPO_PUBLIC_CHAT_API_URL points at it.
// Fallback (no server, native app only): fetch the pages from the phone.
// This cannot read sites that draw their policies with JavaScript.

const TIMEOUT_MS = 15000;
const SERVER_TIMEOUT_MS = 180000; // page rendering + model rating
const MIN_POLICY_TEXT = 400;

interface PolicyPage {
  url: string;
  text: string;
}

interface PolicyPages {
  pages: PolicyPage[];
  rating?: DirectCheckRating;
  ratingError?: 'not-configured' | 'failed';
  failedUrls: string[];
  homepageHtml?: string;
}

export class DirectCheckError extends Error {}

async function fetchPage(url: string): Promise<{ html: string; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'ToSDR-Dashboard-DirectCheck/0.2' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const html = await res.text();
    return { html, text: stripHtmlToText(html) };
  } finally {
    clearTimeout(timer);
  }
}

function hostOf(url: string): string {
  return (ORIGIN_RE.exec(url)?.[2] ?? '').toLowerCase().replace(/^www\./, '');
}

/** Privacy/terms links found in a page's HTML, on the same site. */
function policyLinks(html: string, siteUrl: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (!/privacy|terms|legal/i.test(m[1]) && !/privacy|terms|legal/i.test(stripHtmlToText(m[2]))) {
      continue;
    }
    const url = resolveHref(m[1], siteUrl);
    if (url && hostOf(url).endsWith(hostOf(siteUrl))) {
      out.push(url);
    }
  }
  return out;
}

const shellPrint = (text: string) => text.replace(/\s+/g, ' ').slice(0, 3000);

async function pagesFromServer(siteUrl: string, serviceName: string): Promise<PolicyPages> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SERVER_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${backendUrl()}/direct-check/pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteUrl, serviceName }),
      signal: controller.signal,
    });
  } catch {
    throw new DirectCheckError(
      'Couldn\'t reach the app\'s server. If nobody has used it for a while it may be waking up, which takes about a minute. Try again shortly.',
    );
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    pages?: PolicyPage[];
    failedUrls?: string[];
    homepageHtml?: string;
    reason?: string;
    rating?: DirectCheckRating;
    ratingError?: 'not-configured' | 'failed';
  };
  if (!res.ok) {
    throw new DirectCheckError(data.error ?? `The app server couldn't check this site (error ${res.status}).`);
  }
  const host = hostOf(siteUrl);
  if (!data.pages || data.pages.length === 0) {
    throw new DirectCheckError(
      data.reason === 'blocked'
        ? `${host} refused our request. Some sites block automated readers; open its privacy policy in your browser instead.`
        : data.reason === 'js-only-no-browser'
          ? `${host} draws its pages with JavaScript, and the app server has no Chrome to render them. Install Google Chrome on the server machine and try again.`
          : `We couldn't find a privacy policy or terms page on ${host}. Check the website address, or open its policy in your browser.`,
    );
  }
  return {
    pages: data.pages,
    failedUrls: data.failedUrls ?? [],
    homepageHtml: data.homepageHtml,
    rating: data.rating,
    ratingError: data.ratingError,
  };
}

async function pagesFromDevice(siteUrl: string): Promise<PolicyPages> {
  const host = hostOf(siteUrl);
  if (Platform.OS === 'web') {
    throw new DirectCheckError(
      `Checking ${host} needs the app's server, and this copy of the app isn't connected to one yet. Ask whoever shared the app to finish setting it up.`,
    );
  }
  let homeHtml = '';
  let homeText = '';
  try {
    const home = await fetchPage(siteUrl);
    homeHtml = home.html;
    homeText = home.text;
  } catch {
    // Keep going: the policy paths may still answer.
  }
  const candidates = [...new Set([...policyLinks(homeHtml, siteUrl), ...POLICY_PATHS.map((p) => `${siteUrl}${p}`)])].slice(0, 10);
  const seen = new Set<string>([shellPrint(homeText)]);
  const pages: PolicyPage[] = [];
  const failedUrls: string[] = [];
  let shells = 0;
  await Promise.all(
    candidates.map(async (url) => {
      try {
        const { text } = await fetchPage(url);
        const print = shellPrint(text);
        if (text.length < MIN_POLICY_TEXT || seen.has(print)) {
          shells += 1; // the same JavaScript shell as the homepage, not a policy
          return;
        }
        seen.add(print);
        pages.push({ url, text });
      } catch {
        failedUrls.push(url);
      }
    }),
  );
  if (pages.length === 0) {
    throw new DirectCheckError(
      shells > 0
        ? `${host} draws its pages with JavaScript, so the text isn't there when the phone fetches it. Start the app server, which can render these pages, and try again.`
        : homeHtml === ''
          ? `${host} didn't respond or blocked our request. Check the address, or open its privacy policy in your browser.`
          : `We couldn't find a privacy policy or terms page on ${host}. Check the website address, or open its policy in your browser.`,
    );
  }
  return { pages: pages.slice(0, 4), failedUrls, homepageHtml: homeHtml || undefined };
}

/**
 * Read a service's own policy pages and extract verbatim-quote findings.
 * Returns findings grouped by topic plus the topics with no evidence.
 */
export async function runDirectCheck(name: string, siteUrlInput: string): Promise<DirectCheckResult> {
  const siteUrl = normalizeSiteUrl(siteUrlInput);
  const { pages, failedUrls, homepageHtml, rating, ratingError } = isBackendConfigured()
    ? await pagesFromServer(siteUrl, name.trim())
    : await pagesFromDevice(siteUrl);

  const iconUrl = homepageHtml ? extractIconUrl(homepageHtml, siteUrl) : `${siteUrl}/favicon.ico`;

  const sentences: { sentence: string; sourceUrl: string }[] = [];
  for (const page of pages) {
    for (const sentence of splitSentences(page.text)) {
      sentences.push({ sentence, sourceUrl: page.url });
    }
  }

  const findings: DirectCheckFinding[] = [];
  const notStatedTopics: string[] = [];
  const seenQuotes = new Set<string>();
  for (const rule of DIRECT_CHECK_TOPICS) {
    const matches = sentences.filter(({ sentence }) => {
      const lower = sentence.toLowerCase();
      return rule.keywords.some((kw) => lower.includes(kw));
    });
    if (matches.length === 0) {
      notStatedTopics.push(rule.topic);
      continue;
    }
    for (const match of matches.slice(0, 3)) {
      if (seenQuotes.has(match.sentence)) {
        continue;
      }
      seenQuotes.add(match.sentence);
      findings.push({ topic: rule.topic, quote: match.sentence, sourceUrl: match.sourceUrl });
    }
  }

  return {
    id: `direct-${Date.now()}`,
    name: name.trim(),
    siteUrl,
    fetchedAt: new Date().toISOString(),
    fetchedUrls: pages.map((p) => p.url),
    failedUrls,
    findings,
    notStatedTopics,
    iconUrl,
    rating,
    ratingError,
  };
}
