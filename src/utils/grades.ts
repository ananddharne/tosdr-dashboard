import type { TosdrPoint } from '../api/tosdr';

// Grade ordering and colours. Worst grade first on the dashboard:
// E, D, C, B, A, then unrated/unknown ("N/A") at the end.

export const GRADE_ORDER: Record<string, number> = { E: 0, D: 1, C: 2, B: 3, A: 4 };

export function gradeRank(grade: string): number {
  return GRADE_ORDER[grade.toUpperCase()] ?? 5;
}

export function gradeColor(grade: string): string {
  switch (grade.toUpperCase()) {
    case 'A':
      return '#15803d';
    case 'B':
      return '#65a30d';
    case 'C':
      return '#ca8a04';
    case 'D':
      return '#ea580c';
    case 'E':
      return '#dc2626';
    default:
      return '#64748b';
  }
}

export function classificationColor(classification: string): string {
  switch (classification.toLowerCase()) {
    case 'good':
      return '#15803d';
    case 'bad':
      return '#dc2626';
    case 'blocker':
      return '#991b1b';
    default:
      return '#64748b';
  }
}

// --- AI lens ---------------------------------------------------------------
// Derives a service's AI practices ONLY from its actual rated points.
// A status is "yes" only when a point's case title covers that practice and
// the case classification is bad/blocker (the practice is flagged), "no"
// only when a covering point is classified good, and "not-stated" otherwise.
// Nothing here is inferred from a company name, a product category, or any
// outside knowledge. When in doubt the answer is "not-stated".

export type AiStatus = 'yes' | 'no' | 'not-stated';

export interface AiEvidence {
  field: string;
  status: AiStatus;
  pointTitle: string;
  caseTitle: string;
  classification: string;
}

export interface AiLens {
  trainsOnUserData: AiStatus;
  automatedDecisions: AiStatus;
  thirdPartyModels: AiStatus;
  evidence: AiEvidence[];
}

const AI_TRAINING_KEYS = ['ai training', 'artificial intelligence', 'machine learning', 'ai model'];
const AUTOMATED_KEYS = ['automated decision', 'profiling'];
const THIRD_PARTY_AI_KEYS = ['third part'];

function statusFromClassification(classification: string): AiStatus | null {
  const c = classification.toLowerCase();
  if (c === 'bad' || c === 'blocker') {
    return 'yes';
  }
  if (c === 'good') {
    return 'no';
  }
  return null;
}

export function deriveAiLens(points: TosdrPoint[]): AiLens {
  const lens: AiLens = {
    trainsOnUserData: 'not-stated',
    automatedDecisions: 'not-stated',
    thirdPartyModels: 'not-stated',
    evidence: [],
  };

  const consider = (
    field: 'trainsOnUserData' | 'automatedDecisions' | 'thirdPartyModels',
    point: TosdrPoint,
  ) => {
    const status = statusFromClassification(point.case.classification);
    if (status === null) {
      return;
    }
    // A flagged practice ("yes") wins over a clean one; a clean one is only
    // recorded when nothing has flagged the practice yet.
    if (status === 'yes' || lens[field] === 'not-stated') {
      lens[field] = status;
      lens.evidence.push({
        field,
        status,
        pointTitle: point.title,
        caseTitle: point.case.title,
        classification: point.case.classification,
      });
    }
  };

  for (const point of points) {
    const caseTitle = point.case.title.toLowerCase();
    if (AI_TRAINING_KEYS.some((k) => caseTitle.includes(k))) {
      consider('trainsOnUserData', point);
    }
    if (AUTOMATED_KEYS.some((k) => caseTitle.includes(k))) {
      consider('automatedDecisions', point);
    }
    if (
      THIRD_PARTY_AI_KEYS.some((k) => caseTitle.includes(k)) &&
      AI_TRAINING_KEYS.some((k) => caseTitle.includes(k))
    ) {
      consider('thirdPartyModels', point);
    }
  }

  lens.evidence = lens.evidence.slice(0, 6);
  return lens;
}

/** One-line dashboard summary of a service's AI practices. */
export function aiSummaryLine(lens: AiLens): string {
  if (lens.trainsOnUserData === 'yes') {
    return 'Trains on your data';
  }
  if (lens.automatedDecisions === 'yes') {
    return 'Uses automated decisions';
  }
  if (lens.trainsOnUserData === 'no' && lens.automatedDecisions === 'no') {
    return 'No AI training flagged';
  }
  return 'AI practices not stated';
}
