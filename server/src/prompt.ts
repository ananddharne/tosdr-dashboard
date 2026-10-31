// Grounded prompt construction.
//
// The model is NEVER asked an open-ended question. It receives:
//   1. The user's question.
//   2. The service's already-fetched ToS;DR points (public data).
//   3. Optionally, an excerpt of the service's public policy text.
// And it is instructed to answer ONLY from those sources, to cite the
// quoted clause behind every claim with a [n] marker, and to say
// "not stated" when the sources do not cover the question.
//
// Privacy rule enforced by the caller (server.ts): no user personal data
// is ever placed in this prompt. The only user-supplied text is the
// question itself; everything else is the service's public terms data.

export interface PromptPoint {
  title: string;
  caseTitle: string;
  analysis: string;
  source: string;
  classification: string;
}

export interface PromptSource {
  index: number;
  title: string;
  text: string; // the quotable clause: analysis if present, else the title
}

export interface BuiltPrompt {
  system: string;
  user: string;
  sources: PromptSource[];
}

const MAX_POINTS = 40;
const MAX_ANALYSIS_CHARS = 800;
const MAX_POLICY_CHARS = 12000;

const SYSTEM_PROMPT = [
  'You are a privacy-policy assistant. Answer the user question using ONLY the numbered sources below.',
  'Rules:',
  '1. Every claim in your answer must come from one of the numbered sources. Cite it with its [n] marker.',
  '2. If the sources do not cover the question, say exactly: "Not stated in the provided sources." Do not guess, do not use outside knowledge, and do not soften this into a maybe.',
  '3. Quote the clause you rely on; do not paraphrase it into a stronger or weaker claim than the source states.',
  '4. Keep the answer short and plain-spoken.',
  '5. End your answer with exactly this line: "Information only, not legal advice."',
].join('\n');

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function buildGroundedPrompt(
  question: string,
  serviceName: string,
  points: PromptPoint[],
  policyText?: string,
): BuiltPrompt {
  const usable = points.slice(0, MAX_POINTS);
  const sources: PromptSource[] = usable.map((point, i) => ({
    index: i + 1,
    title: point.title,
    text: truncate(point.analysis.trim() !== '' ? point.analysis : point.title, MAX_ANALYSIS_CHARS),
  }));

  const sourceBlock =
    sources.length > 0
      ? sources
          .map((s) => {
            const point = usable[s.index - 1];
            return `[${s.index}] Case: ${point.caseTitle} (${point.classification}) — ${point.title}\nClause: ${s.text}`;
          })
          .join('\n\n')
      : 'No rated points were provided for this service.';

  const policyBlock =
    policyText !== undefined && policyText.trim() !== ''
      ? `\n\nPolicy excerpt (public terms text):\n${truncate(policyText, MAX_POLICY_CHARS)}`
      : '';

  const user = [
    `Service: ${serviceName}`,
    '',
    'Sources:',
    sourceBlock,
    policyBlock,
    '',
    `Question: ${question}`,
  ].join('\n');

  return { system: SYSTEM_PROMPT, user, sources };
}
