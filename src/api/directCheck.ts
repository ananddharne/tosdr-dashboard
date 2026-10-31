// Direct check: for services ToS;DR does not rate yet, fetch the service's
// OWN terms/privacy pages and extract findings ONLY from verbatim quotes.
//
// Rules enforced here (never relax them):
//  - Findings are exact sentences copied from the fetched pages, never
//    paraphrases and never model-generated claims. If a sentence is long it
//    is kept whole; over-long sentences are skipped, not summarized.
//  - A topic with no matching sentence is reported as "not stated".
//  - No grade is ever invented. Results are always labelled
//    "Unrated · direct check" in the UI.
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

export function normalizeSiteUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Enter the service website address.');
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  return `${url.protocol}//${url.host}`;
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

async function fetchPageText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'ToSDR-Dashboard-DirectCheck/0.1' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return stripHtmlToText(await res.text());
  } finally {
    clearTimeout(timer);
  }
}

const TIMEOUT_MS = 15000;

/**
 * Fetch a service's own policy pages and extract verbatim-quote findings.
 * Returns findings grouped by topic plus the topics with no evidence.
 */
export async function runDirectCheck(name: string, siteUrlInput: string): Promise<DirectCheckResult> {
  const siteUrl = normalizeSiteUrl(siteUrlInput);
  const candidateUrls = [siteUrl, ...POLICY_PATHS.map((p) => `${siteUrl}${p}`)];

  const settled = await Promise.allSettled(
    candidateUrls.map(async (url) => ({ url, text: await fetchPageText(url) })),
  );

  const fetchedUrls: string[] = [];
  const failedUrls: string[] = [];
  const sentences: { sentence: string; sourceUrl: string }[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value.text.length > 200) {
      fetchedUrls.push(result.value.url);
      for (const sentence of splitSentences(result.value.text)) {
        sentences.push({ sentence, sourceUrl: result.value.url });
      }
    } else {
      failedUrls.push(
        result.status === 'fulfilled' ? result.value.url : candidateUrls[settled.indexOf(result)],
      );
    }
  }

  if (fetchedUrls.length === 0) {
    throw new Error(
      `Could not fetch any policy page from ${siteUrl}. The site may block automated fetching.`,
    );
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
    fetchedUrls,
    failedUrls,
    findings,
    notStatedTopics,
  };
}
