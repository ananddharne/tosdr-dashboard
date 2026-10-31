// Meta Model API client (OpenAI-compatible chat completions).
//
// Endpoint: POST https://api.meta.ai/v1/chat/completions
// Auth: Bearer token from the MODEL_API_KEY environment variable, passed
// in by server.ts. This module never reads the environment itself and
// never logs the key.
//
// Model: Muse Spark. The default model id below can be overridden with
// the META_MODEL environment variable — check the Meta Model API
// dashboard/docs for the current model ids if the default stops working.

const META_API_URL = 'https://api.meta.ai/v1/chat/completions';
const TIMEOUT_MS = 60000;

interface ChatCompletionsResponse {
  choices?: { message?: { content?: string } }[];
}

export async function callMetaChat(
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(META_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
        max_tokens: 800,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Meta Model API ${res.status}${detail !== '' ? `: ${detail.slice(0, 300)}` : ''}`);
    }
    const data = (await res.json()) as ChatCompletionsResponse;
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      throw new Error('Meta Model API returned an empty answer.');
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}
