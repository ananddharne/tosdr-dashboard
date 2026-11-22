// Estimated ToS;DR-style rating for services ToS;DR hasn't reviewed.
//
// How it mirrors ToS;DR:
//   1. Cases: the same case catalog ToS;DR curators use
//      (GET https://api.tosdr.org/case/v2, ~270 cases, each good / neutral /
//      bad / blocker). Cached in memory for a day.
//   2. Points: the model reads the service's own policy text and proposes
//      (case, quote) pairs. Every quote is checked against the page text and
//      dropped unless it appears there (whitespace, curly quotes and letter
//      case are normalized; nothing else). Unknown case ids are dropped.
//   3. Grade: ToS;DR's own formula, copied from edit.tosdr.org
//      app/models/service.rb (calculate_grade): each case counts once, case
//      weight is ignored, neutral cases don't count.
//
// What differs from ToS;DR: their points are approved by human curators;
// these are matched by a model. Results are always labelled "estimated".

import { callModel, type ModelProvider } from './modelApi';
import type { PolicyPage } from './policyPages';

const TOSDR_API = 'https://api.tosdr.org';
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_POLICY_CHARS = 60_000; // sent to the model across all pages
const MIN_QUOTE = 20;
// The catalog is split into batches, one model call each: with all ~270
// cases in one call the model skims and matches only a handful.
const CASES_PER_BATCH = 45;
const PARALLEL_CALLS = 3;
const MAX_QUOTE = 600;

export interface TosdrCaseLite {
  id: number;
  title: string;
  description: string;
  classification: string;
}

export interface RatedPoint {
  caseId: number;
  caseTitle: string;
  classification: string;
  quote: string;
  sourceUrl: string;
}

export interface CaseCounts {
  good: number;
  bad: number;
  blocker: number;
  neutral: number;
}

export interface EstimatedRating {
  grade: string; // A–E or N/A
  points: RatedPoint[];
  counts: CaseCounts;
  model: string;
  textTruncated: boolean;
  rejectedQuotes: number; // proposed by the model but not found on the page
  incomplete: boolean; // some case batches failed, so cases may be missing
}

// --- Case catalog -----------------------------------------------------------

let catalog: { cases: TosdrCaseLite[]; fetchedAt: number } | null = null;

async function fetchCasePage(page: number): Promise<{ cases: TosdrCaseLite[]; lastPage: number }> {
  const res = await fetch(`${TOSDR_API}/case/v2?page=${page}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) {
    throw new Error(`ToS;DR case catalog ${res.status}`);
  }
  const data = (await res.json()) as {
    parameters?: { cases?: TosdrCaseLite[]; _page?: { end?: number } };
  };
  const cases = (data.parameters?.cases ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    description: (c.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 240),
    classification: c.classification,
  }));
  return { cases, lastPage: data.parameters?._page?.end ?? page };
}

export async function getCaseCatalog(): Promise<TosdrCaseLite[]> {
  if (catalog && Date.now() - catalog.fetchedAt < CATALOG_TTL_MS) {
    return catalog.cases;
  }
  try {
    const first = await fetchCasePage(1);
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, first.lastPage - 1) }, (_, i) => fetchCasePage(i + 2)),
    );
    const cases = [first, ...rest].flatMap((p) => p.cases).filter((c) => typeof c.id === 'number' && c.title);
    catalog = { cases, fetchedAt: Date.now() };
    return cases;
  } catch (err) {
    if (catalog) {
      return catalog.cases; // stale beats nothing
    }
    throw err;
  }
}

// --- ToS;DR grade formula ---------------------------------------------------

export function countCases(points: { caseId: number; classification: string }[]): CaseCounts {
  const counts: CaseCounts = { good: 0, bad: 0, blocker: 0, neutral: 0 };
  const seen = new Set<number>();
  for (const p of points) {
    if (seen.has(p.caseId)) {
      continue;
    }
    seen.add(p.caseId);
    const k = p.classification.toLowerCase();
    if (k === 'good' || k === 'bad' || k === 'blocker' || k === 'neutral') {
      counts[k] += 1;
    }
  }
  return counts;
}

/** Verbatim port of calculate_grade in edit.tosdr.org app/models/service.rb. */
export function tosdrGrade(counts: CaseCounts): string {
  const balance = counts.good - counts.bad - counts.blocker * 3;
  if (counts.blocker + counts.bad + counts.good === 0) {
    return 'N/A';
  }
  if (balance <= -10 || counts.blocker > counts.good) {
    return 'E';
  }
  if (counts.blocker >= 3 || counts.bad > counts.good) {
    return 'D';
  }
  if (balance < 5) {
    return 'C';
  }
  if (counts.bad > 0) {
    return 'B';
  }
  return 'A';
}

// --- Quote verification -----------------------------------------------------

function normalize(s: string): string {
  return s
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

interface IndexedPage {
  url: string;
  norm: string;
  lower: string;
}

/** The exact page text matching the quote, or null if it isn't on any page. */
export function verifyQuote(quote: string, pages: IndexedPage[]): { text: string; url: string } | null {
  const q = normalize(quote).replace(/^["']|["']$/g, '').replace(/(\.\.\.|…)$/, '').trim();
  if (q.length < MIN_QUOTE || q.length > MAX_QUOTE) {
    return null;
  }
  const ql = q.toLowerCase();
  for (const page of pages) {
    const at = page.lower.indexOf(ql);
    if (at !== -1) {
      return { text: page.norm.slice(at, at + q.length), url: page.url };
    }
  }
  return null;
}

// --- Model call -------------------------------------------------------------

const SYSTEM = [
  'You are a ToS;DR curator. You read a service\'s privacy policy and terms and identify which ToS;DR cases apply.',
  'Rules:',
  '- Only use case ids from the CASES list.',
  '- Go through EVERY case in the list one by one and check the policy text for it. Be thorough: a typical policy matches many cases, including bad ones (tracking, sharing, data retention, liability, changing terms, arbitration, etc.).',
  '- A case applies only if the policy text clearly states it. Do not infer from the kind of company, and do not use outside knowledge.',
  '- For each case, copy ONE short supporting quote EXACTLY as it appears in the policy text: same words, same order, no edits, no ellipses. One sentence or less.',
  '- Each case id at most once. Skip cases the text does not cover.',
  '- Reply with ONLY a JSON array, no prose: [{"case_id": 123, "quote": "exact text"}]',
].join('\n');

function buildPolicyText(pages: PolicyPage[]): { text: string; truncated: boolean } {
  const perPage = Math.floor(MAX_POLICY_CHARS / Math.max(1, pages.length));
  let truncated = false;
  const parts = pages.map((p) => {
    const t = normalize(p.text);
    if (t.length > perPage) {
      truncated = true;
    }
    return `=== PAGE: ${p.url} ===\n${t.slice(0, perPage)}`;
  });
  return { text: parts.join('\n\n'), truncated };
}

function parseProposals(raw: string): { caseId: number; quote: string }[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end <= start) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    .map((x) => ({ caseId: Number(x.case_id), quote: typeof x.quote === 'string' ? x.quote : '' }))
    .filter((x) => Number.isInteger(x.caseId) && x.quote !== '');
}

export async function rateFromPolicy(
  provider: ModelProvider,
  apiKey: string,
  model: string,
  serviceName: string,
  pages: PolicyPage[],
): Promise<EstimatedRating> {
  const cases = await getCaseCatalog();
  const byId = new Map(cases.map((c) => [c.id, c]));
  const { text, truncated } = buildPolicyText(pages);

  const batches: TosdrCaseLite[][] = [];
  for (let i = 0; i < cases.length; i += CASES_PER_BATCH) {
    batches.push(cases.slice(i, i + CASES_PER_BATCH));
  }
  const askBatch = (batch: TosdrCaseLite[]) => {
    const caseList = batch
      .map((c) => `${c.id}: ${c.title}${c.description ? ` (${c.description})` : ''}`)
      .join('\n');
    const user = `SERVICE: ${serviceName}\n\nCASES:\n${caseList}\n\nPOLICY TEXT:\n${text}`;
    return callModel(provider, apiKey, model, SYSTEM, user, { maxTokens: 8000, timeoutMs: 120_000 });
  };
  // A failed batch only loses its own cases; the check fails if all do.
  const replies: string[] = [];
  let failures = 0;
  let lastError: unknown;
  for (let i = 0; i < batches.length; i += PARALLEL_CALLS) {
    const settled = await Promise.allSettled(batches.slice(i, i + PARALLEL_CALLS).map(askBatch));
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        replies.push(r.value);
      } else {
        failures += 1;
        lastError = r.reason;
        console.error('Rating batch failed:', r.reason instanceof Error ? r.reason.message.slice(0, 300) : r.reason);
      }
    }
  }
  if (replies.length === 0) {
    throw lastError instanceof Error ? lastError : new Error('Every rating call failed.');
  }

  const indexed: IndexedPage[] = pages.map((p) => {
    const norm = normalize(p.text);
    return { url: p.url, norm, lower: norm.toLowerCase() };
  });

  const points: RatedPoint[] = [];
  const seen = new Set<number>();
  let rejected = 0;
  for (const proposal of replies.flatMap(parseProposals)) {
    const c = byId.get(proposal.caseId);
    if (!c || seen.has(c.id)) {
      continue;
    }
    const found = verifyQuote(proposal.quote, indexed);
    if (!found) {
      rejected += 1;
      continue;
    }
    seen.add(c.id);
    points.push({
      caseId: c.id,
      caseTitle: c.title,
      classification: c.classification,
      quote: found.text,
      sourceUrl: found.url,
    });
  }

  const order: Record<string, number> = { blocker: 0, bad: 1, good: 2, neutral: 3 };
  points.sort((a, b) => (order[a.classification] ?? 4) - (order[b.classification] ?? 4));
  const counts = countCases(points);
  return { grade: tosdrGrade(counts), points, counts, model, textTruncated: truncated, rejectedQuotes: rejected, incomplete: failures > 0 };
}
