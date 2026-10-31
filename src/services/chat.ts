import type { TosdrPoint } from '../api/tosdr';

// Grounded chat: answers come ONLY from a service's fetched ToS;DR points.
// There is no LLM call here and no API key is needed. The question is
// matched client-side against point titles, case titles, and analyses, and
// every answer quotes the points it rests on. When no point covers the
// question, the answer is "not stated in the rated points" — never a guess.
//
// UPGRADE PATH (when an LLM is wanted): send the question plus the same
// fetched points as context to a model API (for example Meta's Model API),
// with instructions to answer only from those points, to quote the point
// it relies on, and to reply "not stated in the rated points" when nothing
// covers the question. Keep the human-readable quote rule and the
// not-legal-advice note; the LLM must not replace the evidence, only
// phrase it better.

export interface ChatQuote {
  pointTitle: string;
  caseTitle: string;
  analysis: string;
  source: string;
  classification: string;
}

export interface ChatAnswer {
  verdict: 'answered' | 'partial' | 'not-stated';
  text: string;
  quotes: ChatQuote[];
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'does', 'do', 'did', 'can', 'could', 'will', 'would',
  'should', 'my', 'me', 'i', 'you', 'your', 'it', 'its', 'this', 'that', 'on', 'in',
  'of', 'to', 'for', 'with', 'and', 'or', 'doesnt', "doesn't", 'about', 'what', 'how',
  'whether', 'if', 'service', 'app', 'website', 'company',
]);

export const SUGGESTED_QUESTIONS = [
  'Does this service train AI on my data?',
  'Does it sell or share my data?',
  'Can I delete my data?',
  'Does it track me?',
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function scorePoint(questionTokens: string[], point: TosdrPoint): number {
  const titleTokens = new Set(tokenize(point.title));
  const caseTokens = new Set(tokenize(point.case.title));
  const analysisTokens = new Set(tokenize(point.analysis));
  let score = 0;
  for (const token of questionTokens) {
    if (titleTokens.has(token)) {
      score += 3;
    } else if (caseTokens.has(token)) {
      score += 2;
    } else if (analysisTokens.has(token)) {
      score += 1;
    }
    // Stem-ish fallback: "training" matches "train", "selling" matches "sell".
    if (token.length > 4) {
      const stem = token.slice(0, -3);
      if ([...titleTokens].some((t) => t.startsWith(stem))) {
        score += 1;
      }
    }
  }
  return score;
}

export function answerQuestion(question: string, points: TosdrPoint[]): ChatAnswer {
  const tokens = tokenize(question);
  if (tokens.length === 0 || points.length === 0) {
    return {
      verdict: 'not-stated',
      text:
        points.length === 0
          ? 'This service has no rated points to answer from yet.'
          : 'I could not understand the question. Try one of the suggested questions.',
      quotes: [],
    };
  }

  const scored = points
    .map((point) => ({ point, score: scorePoint(tokens, point) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      verdict: 'not-stated',
      text: 'Not stated in the rated points. The rated points for this service do not cover this question.',
      quotes: [],
    };
  }

  const top = scored.slice(0, 3);
  const quotes: ChatQuote[] = top.map(({ point }) => ({
    pointTitle: point.title,
    caseTitle: point.case.title,
    analysis: point.analysis,
    source: point.source,
    classification: point.case.classification,
  }));

  const best = scored[0].score;
  const verdict: ChatAnswer['verdict'] = best >= 6 ? 'answered' : 'partial';
  const intro =
    verdict === 'answered'
      ? 'Based on the rated points:'
      : 'The rated points partly cover this. Here is the closest evidence:';
  const lines = top.map((s) => `• ${s.point.title}`).join('\n');
  return { verdict, text: `${intro}\n${lines}`, quotes };
}
