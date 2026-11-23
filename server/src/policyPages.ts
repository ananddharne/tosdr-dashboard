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
const MIN_TEXT = 400; // wait-for-render threshold
// A real privacy policy or terms page is longer than this; shorter pages are
// usually a JavaScript shell (menu + footer only) or a stub.
const MIN_POLICY_CHARS = 2500;
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
  // Why each failed URL failed ("HTTP 403", "timeout"…), for diagnosis.
  failures: { url: string; error: string }[];
  // Set when the live site refused us and the pages came from the
  // Wayback Machine instead: the newest snapshot's date (ISO).
  archivedAt?: string;
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

interface LinkRef {
  url: string;
  label: string;
}

function policyLinksFromHtml(html: string, baseUrl: string): LinkRef[] {
  const out: LinkRef[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1];
    const label = htmlToText(m[2]);
    if (!POLICY_LINK_RE.test(href) && !POLICY_LINK_RE.test(label)) {
      continue;
    }
    try {
      out.push({ url: new URL(href, baseUrl).toString(), label });
    } catch {
      // ignore malformed hrefs
    }
  }
  return out;
}

// --- Choosing which pages to read ------------------------------------------
//
// Many links mention "privacy", "terms" or "legal" without being the policy:
// blog posts, warranty PDFs, transparency reports, comparison pages. Rank
// candidates so the real privacy policy and terms come first.

type PageKind = 'privacy' | 'terms' | 'cookies' | 'other';

interface Candidate extends LinkRef {
  kind: PageKind;
  score: number;
}

const NOT_POLICY_RE =
  /blog|news|press|transparency|warrant|\.pdf($|\?)|compare|careers|jobs|\/support|\/help|faq|community|guideline|accessib|trademark|brand|sitemap|dmca|copyright|law-?enforcement|developer|api-terms|partner|seller|merchant|advertis/i;

export function classifyLink(link: LinkRef): Candidate | null {
  const url = link.url.toLowerCase();
  const hay = `${url} ${link.label.toLowerCase()}`;
  let kind: PageKind;
  let score: number;
  if (/privacy|datenschutz/.test(hay) && !/choices|do not sell|opt[- ]?out/.test(hay)) {
    kind = 'privacy';
    score = /privacy[-_ ]?(policy|notice|statement)|datenschutz/.test(hay) ? 15 : 10;
  } else if (/terms|conditions|user[-_ ]?agreement/.test(hay)) {
    kind = 'terms';
    score = /terms[-_ ]?(of[-_ ]?)?(service|use)|user[-_ ]?agreement/.test(hay) ? 12 : 8;
  } else if (/cookie/.test(hay)) {
    kind = 'cookies';
    score = 4;
  } else if (/legal/.test(hay)) {
    kind = 'other';
    score = 2;
  } else {
    return null;
  }
  if (NOT_POLICY_RE.test(url)) {
    score -= 20;
  }
  // Deep paths are often regional or product-specific sub-notices.
  const depth = (url.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '').match(/\//g) ?? []).length;
  score -= Math.max(0, depth - 3);
  return { ...link, kind, score };
}

function rankCandidates(links: LinkRef[], siteUrl: string): Candidate[] {
  const best = new Map<string, Candidate>();
  for (const link of links) {
    if (!sameSite(link.url, siteUrl)) {
      continue;
    }
    const c = classifyLink(link);
    if (!c) {
      continue;
    }
    const key = c.url.replace(/[?#].*$/, '').replace(/\/$/, '').replace(/^https?:\/\/www\./, 'https://');
    const prev = best.get(key);
    if (!prev || c.score > prev.score) {
      best.set(key, c);
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

function looksLikePolicy(text: string): boolean {
  return (
    text.length >= MIN_POLICY_CHARS &&
    /privacy|personal (data|information)|terms|agreement|cookies/i.test(text.slice(0, 6000))
  );
}

interface FoundPage extends PolicyPage {
  kind: PageKind;
  score: number;
}

/** Best privacy page, best terms page, then the next best of anything else. */
function choosePages(found: FoundPage[]): PolicyPage[] {
  const sorted = [...found].sort((a, b) => b.score - a.score);
  const chosen: FoundPage[] = [];
  for (const kind of ['privacy', 'terms'] as const) {
    const page = sorted.find((p) => p.kind === kind);
    if (page) {
      chosen.push(page);
    }
  }
  for (const page of sorted) {
    if (chosen.length >= MAX_PAGES) {
      break;
    }
    if (!chosen.includes(page) && page.score > 0) {
      chosen.push(page);
    }
  }
  return chosen.map(({ url, text }) => ({ url, text }));
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

function errorText(err: unknown): string {
  if (err instanceof Error) {
    return err.name === 'AbortError' ? 'timeout' : err.message.slice(0, 120);
  }
  return 'failed';
}

export async function readPolicyPages(siteInput: string): Promise<PolicyPagesResult> {
  const siteUrl = normalizeSite(siteInput);
  const failures: { url: string; error: string }[] = [];
  const fail = (url: string, err: unknown) => failures.push({ url, error: errorText(err) });

  // 1. Homepage, plain.
  let homeHtml = '';
  let homeText = '';
  try {
    const home = await plainFetch(siteUrl);
    homeHtml = home.html;
    homeText = htmlToText(home.html);
  } catch (err) {
    fail(siteUrl, err);
  }

  // 2. Candidate policy pages, ranked, fetched plain.
  const discovered = homeHtml ? policyLinksFromHtml(homeHtml, siteUrl) : [];
  const wellKnown = WELL_KNOWN_PATHS.map((p) => ({ url: `${siteUrl}${p}`, label: '' }));
  const candidates = rankCandidates([...discovered, ...wellKnown], siteUrl).slice(0, 10);
  const found: FoundPage[] = [];
  const seenPrints = new Set<string>([fingerprint(homeText)]);
  await Promise.all(
    candidates.map(async (c) => {
      try {
        const { html } = await plainFetch(c.url);
        const text = htmlToText(html);
        const print = fingerprint(text);
        if (!looksLikePolicy(text) || seenPrints.has(print)) {
          return; // a JS shell, a stub, or a copy of another page
        }
        seenPrints.add(print);
        found.push({ url: c.url, text, kind: c.kind, score: c.score });
      } catch (err) {
        fail(c.url, err);
      }
    }),
  );

  const done = (
    pages: PolicyPage[],
    extra: Partial<PolicyPagesResult> & { rendered: boolean },
  ): PolicyPagesResult => {
    if (failures.length > 0) {
      console.warn(`Unreadable on ${siteUrl}: ${failures.map((f) => `${f.url} (${f.error})`).join(', ')}`);
    }
    return {
      siteUrl,
      pages,
      failedUrls: [...new Set(failures.map((f) => f.url))],
      failures,
      homepageHtml: homeHtml || undefined,
      ...extra,
    };
  };

  // Done if plain fetching found the privacy policy itself.
  if (found.some((p) => p.kind === 'privacy')) {
    return done(choosePages(found), { rendered: false });
  }

  // 3. No privacy policy yet (JavaScript-drawn pages): render with headless
  // Chrome, keeping whatever plain fetching did find.
  const rendered = await renderPolicyPages(siteUrl);
  const merged = [...found];
  if (rendered) {
    failures.push(...rendered.failures);
    for (const page of rendered.pages) {
      if (!merged.some((p) => fingerprint(p.text) === fingerprint(page.text))) {
        merged.push(page);
      }
    }
  }
  const pages = choosePages(merged);
  if (pages.length > 0) {
    return done(pages, { rendered: rendered !== null, homepageHtml: homeHtml || rendered?.homepageHtml });
  }

  // 4. Nothing readable. If the site refused us outright (even its homepage
  // failed), read the Wayback Machine's latest copies instead. Quotes then
  // come, word for word, from that snapshot, and the result says so.
  const refused = homeHtml === '';
  if (refused) {
    const archived = await readArchivedPolicyPages(siteUrl).catch(() => null);
    if (archived && archived.pages.length > 0) {
      return done(archived.pages, {
        rendered: false,
        archivedAt: archived.archivedAt,
        homepageHtml: archived.homepageHtml,
      });
    }
  }
  return done([], {
    rendered: rendered !== null,
    reason: refused ? 'blocked' : rendered === null ? 'js-only-no-browser' : 'no-policy-found',
  });
}

// --- Wayback Machine fallback -----------------------------------------------
//
// For sites that refuse requests from our server (many block cloud-provider
// addresses). archive.org's availability API names the newest snapshot of a
// URL; the `id_` form of a snapshot URL serves the page exactly as captured,
// without the archive's toolbar and with the original links.

const ARCHIVE_TIMEOUT_MS = 25000;

interface Snapshot {
  rawUrl: string; // the captured page itself (id_)
  viewUrl: string; // the normal archive page, for people to open
  takenAt: string; // ISO timestamp
}

async function findSnapshot(url: string): Promise<Snapshot | null> {
  const api = `https://archive.org/wayback/available?url=${encodeURIComponent(url.replace(/^https?:\/\//, ''))}`;
  const res = await fetch(api, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(ARCHIVE_TIMEOUT_MS) });
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as {
    archived_snapshots?: { closest?: { available?: boolean; url?: string; timestamp?: string; status?: string } };
  };
  const snap = data.archived_snapshots?.closest;
  if (!snap?.available || !snap.url || !snap.timestamp || (snap.status && snap.status !== '200')) {
    return null;
  }
  const viewUrl = snap.url.replace(/^http:/, 'https:');
  const t = snap.timestamp;
  return {
    rawUrl: viewUrl.replace(`/web/${t}/`, `/web/${t}id_/`),
    viewUrl,
    takenAt: `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(8, 10)}:${t.slice(10, 12)}:${t.slice(12, 14)}Z`,
  };
}

async function fetchSnapshot(url: string): Promise<{ html: string; snap: Snapshot } | null> {
  const snap = await findSnapshot(url);
  if (!snap) {
    return null;
  }
  const res = await fetch(snap.rawUrl, {
    headers: { Accept: 'text/html', 'User-Agent': UA },
    redirect: 'follow',
    signal: AbortSignal.timeout(ARCHIVE_TIMEOUT_MS),
  });
  if (!res.ok) {
    return null;
  }
  return { html: await res.text(), snap };
}

export async function readArchivedPolicyPages(
  siteUrl: string,
): Promise<{ pages: PolicyPage[]; archivedAt?: string; homepageHtml?: string }> {
  const home = await fetchSnapshot(siteUrl).catch(() => null);
  const discovered = home ? policyLinksFromHtml(home.html, siteUrl) : [];
  const wellKnown = WELL_KNOWN_PATHS.map((p) => ({ url: `${siteUrl}${p}`, label: '' }));
  const candidates = rankCandidates([...discovered, ...wellKnown], siteUrl).slice(0, 6);
  const found: (FoundPage & { takenAt: string })[] = [];
  const seen = new Set<string>([fingerprint(home ? htmlToText(home.html) : '')]);
  await Promise.all(
    candidates.map(async (c) => {
      const got = await fetchSnapshot(c.url).catch(() => null);
      if (!got) {
        return;
      }
      const text = htmlToText(got.html);
      const print = fingerprint(text);
      if (!looksLikePolicy(text) || seen.has(print)) {
        return;
      }
      seen.add(print);
      found.push({ url: got.snap.viewUrl, text, kind: c.kind, score: c.score, takenAt: got.snap.takenAt });
    }),
  );
  const pages = choosePages(found);
  const used = found.filter((f) => pages.some((p) => p.url === f.url)).map((f) => f.takenAt);
  return {
    pages,
    archivedAt: used.sort().pop(),
    homepageHtml: home?.html,
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
): Promise<{ pages: FoundPage[]; failures: { url: string; error: string }[]; homepageHtml?: string } | null> {
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
  const failures: { url: string; error: string }[] = [];
  const pages: FoundPage[] = [];
  try {
    let homepageHtml: string | undefined;
    let links: LinkRef[] = [];
    try {
      await loadRendered(page, siteUrl);
      homepageHtml = await page.content();
      links = await page.$$eval(
        'a[href]',
        (as, pattern) => {
          const re = new RegExp(pattern, 'i');
          return as
            .filter((a) => re.test(a.getAttribute('href') ?? '') || re.test(a.textContent ?? ''))
            .map((a) => ({ url: (a as HTMLAnchorElement).href, label: (a.textContent ?? '').trim() }));
        },
        POLICY_LINK_RE.source,
      );
    } catch (err) {
      failures.push({ url: siteUrl, error: `rendered: ${errorText(err)}` });
    }

    const candidates = rankCandidates(
      [...links, ...WELL_KNOWN_PATHS.slice(0, 4).map((p) => ({ url: `${siteUrl}${p}`, label: '' }))],
      siteUrl,
    ).slice(0, 6);

    const seen = new Set<string>();
    for (const { url, kind, score } of candidates) {
      if (pages.length >= MAX_PAGES) {
        break;
      }
      try {
        const res = await loadRendered(page, url);
        if (res && !res.ok()) {
          failures.push({ url, error: `rendered: HTTP ${res.status()}` });
          continue;
        }
        const text = (await page.evaluate(() => document.body?.innerText ?? '')).trim();
        const print = fingerprint(text);
        if (!looksLikePolicy(text) || seen.has(print)) {
          continue;
        }
        seen.add(print);
        pages.push({ url: page.url(), text, kind, score });
      } catch (err) {
        failures.push({ url, error: `rendered: ${errorText(err)}` });
      }
    }
    return { pages, failures, homepageHtml };
  } finally {
    await context.close();
  }
}
