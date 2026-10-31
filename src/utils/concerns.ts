import type { TosdrPoint } from '../api/tosdr';

// Concern topics. ToS;DR does not publish a stable topic-id map in the
// public API docs, so concerns are matched against point case titles and
// point titles by keyword. Matching is deliberately transparent: a point
// matches a concern when any keyword appears in its case title or title.
// Keywords are lowercase; matching is case-insensitive.

export interface Concern {
  id: string;
  label: string;
  keywords: string[];
}

export const CONCERNS: Concern[] = [
  {
    id: 'ai',
    label: 'AI training & automated decisions',
    keywords: ['ai training', 'artificial intelligence', 'machine learning', 'automated decision', 'profiling', 'ai model'],
  },
  {
    id: 'selling',
    label: 'Data selling & sharing',
    keywords: ['sold', 'sell', 'share', 'shared', 'third part', 'advertis', 'broker'],
  },
  {
    id: 'tracking',
    label: 'Tracking & cookies',
    keywords: ['track', 'cookie', 'fingerprint', 'beacon', 'pixel'],
  },
  {
    id: 'content',
    label: 'Your content & licence',
    keywords: ['content', 'licence', 'license', 'intellectual property', 'reuse', 'copyright'],
  },
  {
    id: 'deletion',
    label: 'Deletion & termination',
    keywords: ['delet', 'terminat', 'close your account', 'retain', 'retention'],
  },
];

export function pointMatchesConcern(point: TosdrPoint, concern: Concern): boolean {
  const haystack = `${point.case.title} ${point.title}`.toLowerCase();
  return concern.keywords.some((kw) => haystack.includes(kw));
}

/** Empty selection means "all concerns" (no filtering). */
export function filterPointsByConcerns(points: TosdrPoint[], concernIds: string[]): TosdrPoint[] {
  if (concernIds.length === 0) {
    return points;
  }
  const selected = CONCERNS.filter((c) => concernIds.includes(c.id));
  if (selected.length === 0) {
    return points;
  }
  return points.filter((p) => selected.some((c) => pointMatchesConcern(p, c)));
}
