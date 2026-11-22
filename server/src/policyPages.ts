// Policy page reader for the direct check.
//
// The app asks this server for a site's privacy/terms page TEXT; the app
// then extracts verbatim quotes itself (src/api/directCheck.ts), so the
// quoting rules live in one place.
//
// Why a server: browsers block cross-site reads (CORS), so the web build
// cannot fetch most companies' pages itself. And many sites (Angular, React,
// Next client routes) send the same JavaScript shell for every URL and draw
// the policy in the browser, so plain fetching sees no policy text at all.
//
// Strategy:
//   1. Plain-fetch the homepage. Collect privacy/terms links from its HTML
//      plus a few well-known paths.
//   2. Plain-fetch those. A page whose text matches the homepage is a
//      JavaScript shell, not a policy page.
//   3. If no real policy page was found, render with headless Chrome
//      (playwright-core driving the installed Chrome): render the homepage,
//      collect the policy links from the live DOM, render those, read text.
//
// SAFETY: only public http(s) hosts are fetched. Literal private, loopback
// and link-local addresses are refused so the server can't be pointed at
// its own network. (DNS names that resolve to private addresses are not
// checked; put this behind auth before exposing it publicly.)

const TIMEOUT_MS = 15000;
const MAX_PAGES = 4;
const MIN_TEXT = 400;
const UA = 'Mozilla/5.0 (compatible; ToSDR-Dashboard-DirectCheck/0.2)';

const WELL_KNOWN_PATHS = ['/privacy', '/privacy-policy', '/terms', '/terms-of-service', '/legal/privacy', '/legal/terms'];
const POLICY_LINK_RE = /privacy|terms|legal|datenschutz|conditions|cookie/i;

export interface PolicyPage {
  url: string;
  text: string;
}

export interface PolicyPagesResult {
  siteUrl: string;
  pages: PolicyPage[];
  failedUrls: string[];
  rendered: boolean;
  homepageHtml?: string;
  reason?: 'blocked' | 'no-policy-found' | 'js-only-no-browser';
}

export function normalizeSite(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Only http and https sites can be checked.');
  }
  if (isPrivateHost(url.hostname)) {
    throw new Error('That address is on a private network and cannot be checked.');
  }
  return `${url.protocol}//${url.host}`;
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
    return true;
  }
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) {
    return true;
  }
  return h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80');
}

function sameSite(url: string, siteUrl: string): boolean {
  try {
    const a = new URL(url).hostname.replace(/^www\./, '');
    const b = new URL(siteUrl).hostname.replace(/^www\./, '');
    return a === b || a.endsWith(`.${b}`);
  } catch {
    return false;
  }
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|p|div|li|h\d|tr|section|article)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function policyLinksFromHtml(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1];
    const label = htmlToText(m[2]);
    if (!POLICY_LINK_RE.test(href) && !POLICY_LINK_RE.test(label)) {
      continue;
    }
    try {
      out.push(new URL(href, baseUrl).toString());
    } catch {
      // ignore malformed hrefs
    }
  }
  return out;
}

async function plainFetch(url: string): Promise<{ html: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': UA },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    if (!sameSite(res.url, url) && isPrivateHost(new URL(res.url).hostname)) {
      throw new Error('Redirected to a private address.');
    }
    return { html: await res.text(), finalUrl: res.url };
  } finally {
    clearTimeout(timer);
  }
}

/** Normalised text used to spot pages that are really the same shell. */
function fingerprint(text: string): string {
  return text.replace(/\s+/g, ' ').slice(0, 3000);
}

function dedupe(urls: string[]): string[] {
  const seen = new Set<string>();
  return urls.filter((u) => {
    const key = u.replace(/\/$/, '').replace(/^https?:\/\/www\./, 'https://');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export async function readPolicyPages(siteInput: string): Promise<PolicyPagesResult> {
  const siteUrl = normalizeSite(siteInput);
  const failedUrls: string[] = [];

  // 1. Homepage, plain.
  let homeHtml = '';
  let homeText = '';
  try {
    const home = await plainFetch(siteUrl);
    homeHtml = home.html;
    homeText = htmlToText(home.html);
  } catch {
    failedUrls.push(siteUrl);
  }

  // 2. Candidate policy pages, plain.
  const discovered = homeHtml ? policyLinksFromHtml(homeHtml, siteUrl).filter((u) => sameSite(u, siteUrl)) : [];
  const candidates = dedupe([...discovered, ...WELL_KNOWN_PATHS.map((p) => `${siteUrl}${p}`)]).slice(0, 10);
  const homePrint = fingerprint(homeText);
  const pages: PolicyPage[] = [];
  const seenPrints = new Set<string>([homePrint]);
  await Promise.all(
    candidates.map(async (url) => {
      try {
        const { html } = await plainFetch(url);
        const text = htmlToText(html);
        const print = fingerprint(text);
        if (text.length < MIN_TEXT || seenPrints.has(print)) {
          return; // a JS shell or a copy of another page, not a policy page
        }
        seenPrints.add(print);
        pages.push({ url, text });
      } catch {
        failedUrls.push(url);
      }
    }),
  );

  if (pages.length > 0) {
    return { siteUrl, pages: pages.slice(0, MAX_PAGES), failedUrls, rendered: false, homepageHtml: homeHtml || undefined };
  }

  // 3. Nothing real found: render with headless Chrome.
  const rendered = await renderPolicyPages(siteUrl);
  if (rendered === null) {
    return {
      siteUrl,
      pages: [],
      failedUrls,
      rendered: false,
      homepageHtml: homeHtml || undefined,
      reason: homeHtml ? 'js-only-no-browser' : 'blocked',
    };
  }
  return {
    siteUrl,
    pages: rendered.pages,
    failedUrls: [...failedUrls, ...rendered.failedUrls],
    rendered: true,
    homepageHtml: homeHtml || rendered.homepageHtml,
    reason: rendered.pages.length === 0 ? 'no-policy-found' : undefined,
  };
}

// --- Headless rendering ----------------------------------------------------

type Browser = import('playwright-core').Browser;

let browserPromise: Promise<Browser | null> | null = null;

/** Launch the installed Chrome once and reuse it. null when unavailable. */
async function getBrowser(): Promise<Browser | null> {
  const existing = browserPromise ? await browserPromise : null;
  if (existing && !existing.isConnected()) {
    browserPromise = null; // Chrome crashed or was closed: relaunch below
  }
  if (!browserPromise) {
    browserPromise = (async () => {
      try {
        const { chromium } = await import('playwright-core');
        const channel = process.env.DIRECT_CHECK_CHROME_CHANNEL ?? 'chrome';
        const executablePath = process.env.DIRECT_CHECK_CHROME_PATH;
        // 'bundled' = Playwright's own Chromium (the Docker image ships it);
        // otherwise a locally installed browser channel such as 'chrome'.
        const browser = await chromium.launch(
          executablePath ? { executablePath } : channel === 'bundled' ? {} : { channel },
        );
        browser.on('disconnected', () => {
          browserPromise = null;
        });
        return browser;
      } catch (err) {
        console.error(
          'Headless Chrome unavailable; JavaScript-only sites cannot be read.',
          err instanceof Error ? err.message.split('\n')[0] : err,
        );
        browserPromise = null;
        return null;
      }
    })();
  }
  return browserPromise;
}

/**
 * Load a page and wait until it shows real text. Not 'networkidle': sites
 * with analytics beacons never go idle, so that wait always times out.
 */
async function loadRendered(page: import('playwright-core').Page, url: string) {
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page
    .waitForFunction((min) => (document.body?.innerText ?? '').trim().length > min, MIN_TEXT, { timeout: 8000 })
    .catch(() => undefined);
  await page.waitForTimeout(500); // let late sections finish drawing
  return res;
}

async function renderPolicyPages(
  siteUrl: string,
): Promise<{ pages: PolicyPage[]; failedUrls: string[]; homepageHtml?: string } | null> {
  const browser = await getBrowser();
  if (!browser) {
    return null;
  }
  const context = await browser.newContext({ userAgent: UA, javaScriptEnabled: true });
  // Skip images, media and fonts: we only need text.
  await context.route('**/*', (route) => {
    const kind = route.request().resourceType();
    return kind === 'image' || kind === 'media' || kind === 'font' ? route.abort() : route.continue();
  });
  const page = await context.newPage();
  const failedUrls: string[] = [];
  const pages: PolicyPage[] = [];
  try {
    let homepageHtml: string | undefined;
    let links: string[] = [];
    try {
      await loadRendered(page, siteUrl);
      homepageHtml = await page.content();
      links = await page.$$eval(
        'a[href]',
        (as, pattern) => {
          const re = new RegExp(pattern, 'i');
          return as
            .filter((a) => re.test(a.getAttribute('href') ?? '') || re.test(a.textContent ?? ''))
            .map((a) => (a as HTMLAnchorElement).href);
        },
        POLICY_LINK_RE.source,
      );
    } catch {
      failedUrls.push(siteUrl);
    }

    const candidates = dedupe([
      ...links.filter((u) => sameSite(u, siteUrl)),
      ...WELL_KNOWN_PATHS.slice(0, 4).map((p) => `${siteUrl}${p}`),
    ]).slice(0, 6);

    const seen = new Set<string>();
    for (const url of candidates) {
      if (pages.length >= MAX_PAGES) {
        break;
      }
      try {
        const res = await loadRendered(page, url);
        if (res && !res.ok()) {
          failedUrls.push(url);
          continue;
        }
        const text = (await page.evaluate(() => document.body?.innerText ?? '')).trim();
        const print = fingerprint(text);
        const looksLikePolicy = /privacy|personal (data|information)|terms|agreement/i.test(text.slice(0, 4000));
        if (text.length < MIN_TEXT || seen.has(print) || !looksLikePolicy) {
          continue;
        }
        seen.add(print);
        pages.push({ url: page.url(), text });
      } catch {
        failedUrls.push(url);
      }
    }
    return { pages, failedUrls, homepageHtml };
  } finally {
    await context.close();
  }
}
