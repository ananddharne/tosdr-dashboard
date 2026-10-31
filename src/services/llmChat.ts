import type { TosdrPoint } from '../api/tosdr';

// Chat backend client. The app talks to OUR OWN backend (see server/),
// never to a model API directly — so no API key of any kind lives in the
// mobile app code. The backend URL comes from the EXPO_PUBLIC_
// environment variable at build/start time:
//
//   EXPO_PUBLIC_CHAT_API_URL=http://localhost:3001 npx expo start
//
// When the variable is unset, the app uses the on-device grounded
// matcher in src/services/chat.ts instead (see ChatScreen). When it is
// set but the backend is unreachable, ChatScreen also falls back to the
// on-device matcher and says so.

export interface LlmCitation {
  pointTitle: string;
  quote: string;
  source: string;
}

export interface LlmChatResult {
  answer: string;
  citations: LlmCitation[];
}

const BASE_URL = (process.env.EXPO_PUBLIC_CHAT_API_URL ?? '').replace(/\/$/, '');

export function isLlmChatConfigured(): boolean {
  return BASE_URL !== '';
}

export async function askLlmChat(
  question: string,
  serviceName: string,
  points: TosdrPoint[],
): Promise<LlmChatResult> {
  if (!isLlmChatConfigured()) {
    throw new Error('Chat backend is not configured.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${BASE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        serviceName,
        points: points.map((p) => ({
          title: p.title,
          caseTitle: p.case.title,
          analysis: p.analysis,
          source: p.source,
          classification: p.case.classification,
        })),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Chat backend ${res.status}${detail !== '' ? `: ${detail.slice(0, 200)}` : ''}`);
    }
    const data = (await res.json()) as { answer?: unknown; citations?: unknown };
    if (typeof data.answer !== 'string' || data.answer.trim() === '') {
      throw new Error('Chat backend returned an empty answer.');
    }
    const citations: LlmCitation[] = Array.isArray(data.citations)
      ? (data.citations as Record<string, unknown>[])
          .filter((c) => typeof c.pointTitle === 'string' && typeof c.quote === 'string')
          .map((c) => ({
            pointTitle: c.pointTitle as string,
            quote: c.quote as string,
            source: typeof c.source === 'string' ? c.source : '',
          }))
      : [];
    return { answer: data.answer, citations };
  } finally {
    clearTimeout(timer);
  }
}
