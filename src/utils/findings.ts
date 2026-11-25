import type { TosdrPoint } from '../api/tosdr';
import type { DirectCheckRating } from '../api/directCheck';

// One shape for everything we show about an app's terms, whether it came from
// ToS;DR's reviewed points or from a direct check's verified quotes. Screens
// group, count and chart these; they never change what a finding says.

export type Classification = 'blocker' | 'bad' | 'neutral' | 'good';

export interface Finding {
  key: string;
  classification: Classification;
  /** ToS;DR case title ("This service tracks you on other websites"). */
  caseTitle: string;
  /** The point's own title; equals caseTitle for direct checks. */
  title: string;
  /** ToS;DR's analysis, or the page quote for direct checks. */
  body?: string;
  /** body is a word-for-word quote from the company's page. */
  verbatim: boolean;
  source?: string;
  /** ToS;DR case weight (0 for direct checks); higher sorts first. */
  weight: number;
}

export function toClassification(raw: string): Classification {
  const c = raw.toLowerCase();
  return c === 'blocker' || c === 'bad' || c === 'good' ? c : 'neutral';
}

export const isRedFlag = (f: Finding): boolean => f.classification === 'blocker' || f.classification === 'bad';

export function findingsFromTosdr(points: TosdrPoint[]): Finding[] {
  return points.map((p) => ({
    key: `t${p.id}`,
    classification: toClassification(p.case.classification),
    caseTitle: p.case.title,
    title: p.title,
    body: /^generated through the annotate view\.?$/i.test(p.analysis.trim()) ? undefined : p.analysis,
    verbatim: false,
    source: p.source !== '' ? p.source : undefined,
    weight: p.case.weight ?? 0,
  }));
}

export function findingsFromDirect(rating: DirectCheckRating): Finding[] {
  return rating.points.map((p) => ({
    key: `d${p.caseId}`,
    classification: toClassification(p.classification),
    caseTitle: p.caseTitle,
    title: p.caseTitle,
    body: p.quote,
    verbatim: true,
    source: p.sourceUrl,
    weight: 0,
  }));
}

export interface ClassCounts {
  blocker: number;
  bad: number;
  neutral: number;
  good: number;
  total: number;
}

export function countByClass(findings: Finding[]): ClassCounts {
  const counts: ClassCounts = { blocker: 0, bad: 0, neutral: 0, good: 0, total: findings.length };
  for (const f of findings) {
    counts[f.classification] += 1;
  }
  return counts;
}

/** Worst first: blockers, then bad, neutral, good; heavier cases first within each. */
export function sortWorstFirst(findings: Finding[]): Finding[] {
  const rank: Record<Classification, number> = { blocker: 0, bad: 1, neutral: 2, good: 3 };
  return [...findings].sort((a, b) => rank[a.classification] - rank[b.classification] || b.weight - a.weight);
}
