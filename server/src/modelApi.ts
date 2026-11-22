// Model API client. Every supported provider speaks the OpenAI-compatible
// chat completions format, so switching provider is configuration only:
//
//   MODEL_PROVIDER  gemini (default) | meta
//   MODEL_API_KEY   that provider's key (never logged, never sent to the app)
//   MODEL_NAME      optional model id override (META_MODEL still works for meta)
//
// Gemini: Google AI Studio key, free tier while the project has no billing.
//   Free-tier prompts may be used by Google to improve its products.
// Meta:   Meta Model API (Muse Spark), pay-as-you-go.

export interface ModelProvider {
  id: string;
  url: string;
  defaultModel: string;
}

const PROVIDERS: Record<string, ModelProvider> = {
  gemini: {
    id: 'gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    defaultModel: 'gemini-3.6-flash',
  },
  meta: {
    id: 'meta',
    url: 'https://api.meta.ai/v1/chat/completions',
    defaultModel: 'muse-spark-1.3',
  },
};

export function resolveProvider(env: NodeJS.ProcessEnv): { provider: ModelProvider; model: string } {
  const name = (env.MODEL_PROVIDER ?? 'gemini').trim().toLowerCase();
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown MODEL_PROVIDER "${name}". Use one of: ${Object.keys(PROVIDERS).join(', ')}.`);
  }
  const override = env.MODEL_NAME ?? (provider.id === 'meta' ? env.META_MODEL : undefined);
  return { provider, model: override?.trim() || provider.defaultModel };
}

const TIMEOUT_MS = 60000;
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAY_MS = 3000;

interface ChatCompletionsResponse {
  choices?: { message?: { content?: string } }[];
}

class RetryableError extends Error {}

async function once(
  provider: ModelProvider,
  apiKey: string,
  body: string,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(provider.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const message = `${provider.id} model API ${res.status}${detail !== '' ? `: ${detail.slice(0, 300)}` : ''}`;
      throw RETRY_STATUSES.has(res.status) ? new RetryableError(message) : new Error(message);
    }
    const data = (await res.json()) as ChatCompletionsResponse;
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      throw new Error(`${provider.id} model API returned an empty answer.`);
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/** One chat completion. Retries once on rate-limit / overload errors. */
export async function callModel(
  provider: ModelProvider,
  apiKey: string,
  model: string,
  system: string,
  user: string,
  opts: { maxTokens?: number; timeoutMs?: number; temperature?: number } = {},
): Promise<string> {
  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: opts.temperature ?? 0.2,
    // Gemini counts its internal reasoning against this cap, so keep it roomy.
    max_tokens: opts.maxTokens ?? 2000,
  });
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  try {
    return await once(provider, apiKey, body, timeoutMs);
  } catch (err) {
    if (!(err instanceof RetryableError)) {
      throw err;
    }
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    return once(provider, apiKey, body, timeoutMs);
  }
}
