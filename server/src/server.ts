// Chat backend for the ToS;DR Dashboard app.
//
// WHAT IT DOES
//   POST /chat — takes a question plus a service's already-fetched ToS;DR
//   points (and optionally public policy text) from the mobile app, asks a
//   Muse Spark model to answer ONLY from those sources with quoted
//   citations, and returns the answer plus the citations used.
//   GET /health — liveness check, no key required.
//
// HOW TO GET A KEY
//   1. Open the Meta Model API dashboard (dev.meta.ai) and create an API
//      key. Copy it immediately — it is shown only once.
//   2. Copy server/.env.example to server/.env and put the key there:
//        MODEL_API_KEY=your-real-key
//   3. NEVER commit .env. The repo .gitignore excludes it, and this
//      server refuses to run without the variable so a missing key fails
//      loudly instead of silently.
//
// HOW TO RUN LOCALLY
//   cd server
//   npm install        (dev dependencies only: typescript + node types)
//   npm run build
//   MODEL_API_KEY=your-key-here npm start
//   # or: cp .env.example .env  (then edit .env) and `npm start` — the
//   # server below loads .env itself ONLY for local development.
//   The server listens on PORT (default 3001). The mobile app calls it
//   when EXPO_PUBLIC_CHAT_API_URL points at it, e.g.:
//     EXPO_PUBLIC_CHAT_API_URL=http://localhost:3001 npx expo start
//
// HOSTING
//   On whatever host runs this backend, set MODEL_API_KEY as an
//   environment variable in the host's settings. Never commit it to the
//   repo — this repo is public. Rotate the key in the dashboard if it
//   ever leaks.
//
// PRIVACY
//   Only the service's public ToS;DR points/policy text and the user's
//   question are sent to the model. No user personal data, no device
//   identifiers, no followed-app list, and no account data ever leave
//   this server toward the model API.
//
// NOTE: this server has no runtime dependencies — it uses Node's built-in
// http server and global fetch (Node 18+). Rate limiting is in-memory
// per caller IP; put real authentication in front of it before exposing
// it publicly.

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildGroundedPrompt, type PromptPoint } from './prompt';
import { callMetaChat } from './metaApi';
import { RateLimiter } from './rateLimit';

// --- Local .env loading (development convenience only) --------------------
// Reads server/.env if present. Production hosts must set the variable in
// their own environment settings instead; this file must never be committed.
function loadLocalEnv(): void {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) {
        continue;
      }
      const eq = trimmed.indexOf('=');
      if (eq === -1) {
        continue;
      }
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // No .env file is fine — the variable may come from the host instead.
  }
}

loadLocalEnv();

const MODEL_API_KEY = process.env.MODEL_API_KEY;
if (MODEL_API_KEY === undefined || MODEL_API_KEY.trim() === '' || MODEL_API_KEY === 'your-key-here') {
  console.error(
    'ERROR: MODEL_API_KEY is not set. Copy server/.env.example to server/.env and add your key, ' +
      'or set MODEL_API_KEY in the host environment. Refusing to start.',
  );
  process.exit(1);
}
const API_KEY: string = MODEL_API_KEY;
const MODEL = process.env.META_MODEL ?? 'muse-spark-1.3';
const PORT = Number(process.env.PORT ?? 3001);
const MAX_BODY_BYTES = 256 * 1024;

const limiter = new RateLimiter(30, 60_000);
const DISCLAIMER = 'Information only, not legal advice.';

interface ChatRequestBody {
  question?: unknown;
  serviceName?: unknown;
  points?: unknown;
  policyText?: unknown;
}

interface Citation {
  index: number;
  pointTitle: string;
  quote: string;
  source: string;
}

function clientIp(req: http.IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded !== '') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function parsePoints(raw: unknown): PromptPoint[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
    .slice(0, 100)
    .map((p) => ({
      title: typeof p.title === 'string' ? p.title : '',
      caseTitle: typeof p.caseTitle === 'string' ? p.caseTitle : '',
      analysis: typeof p.analysis === 'string' ? p.analysis : '',
      source: typeof p.source === 'string' ? p.source : '',
      classification: typeof p.classification === 'string' ? p.classification : '',
    }))
    .filter((p) => p.title !== '' || p.analysis !== '');
}

function extractCitations(
  answer: string,
  sources: { title: string; text: string }[],
  points: PromptPoint[],
): Citation[] {
  const used = new Set<number>();
  for (const match of answer.matchAll(/\[(\d+)\]/g)) {
    const n = Number(match[1]);
    if (Number.isInteger(n) && n >= 1 && n <= sources.length) {
      used.add(n);
    }
  }
  return [...used].sort((a, b) => a - b).map((n) => ({
    index: n,
    pointTitle: sources[n - 1].title,
    quote: sources[n - 1].text,
    source: points[n - 1]?.source ?? '',
  }));
}

async function handleChat(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (!limiter.allow(clientIp(req))) {
    sendJson(res, 429, { error: 'Rate limit exceeded. Try again in a minute.' });
    return;
  }

  let body: ChatRequestBody;
  try {
    body = JSON.parse(await readBody(req)) as ChatRequestBody;
  } catch {
    sendJson(res, 400, { error: 'Request body must be valid JSON.' });
    return;
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (question === '' || question.length > 2000) {
    sendJson(res, 400, { error: 'question must be a non-empty string under 2000 characters.' });
    return;
  }
  const serviceName = typeof body.serviceName === 'string' ? body.serviceName : 'Unknown service';
  const points = parsePoints(body.points);
  const policyText =
    typeof body.policyText === 'string' ? body.policyText.slice(0, 50000) : undefined;

  const prompt = buildGroundedPrompt(question, serviceName, points, policyText);

  let answer: string;
  try {
    answer = await callMetaChat(API_KEY, MODEL, prompt.system, prompt.user);
  } catch (err) {
    console.error('Model call failed:', err instanceof Error ? err.message : err);
    sendJson(res, 502, { error: 'The model service could not be reached. Try again shortly.' });
    return;
  }

  if (!answer.includes(DISCLAIMER)) {
    answer = `${answer.trim()}\n\n${DISCLAIMER}`;
  }
  const citations = extractCitations(answer, prompt.sources, points);
  sendJson(res, 200, { answer, citations, model: MODEL, disclaimer: DISCLAIMER });
}

const server = http.createServer((req, res) => {
  void (async () => {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { ok: true, model: MODEL });
      return;
    }
    if (req.method === 'POST' && req.url === '/chat') {
      await handleChat(req, res);
      return;
    }
    sendJson(res, 404, { error: 'Not found.' });
  })().catch((err: unknown) => {
    console.error('Unhandled error:', err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Internal server error.' });
    }
  });
});

server.listen(PORT, () => {
  console.log(`ToS;DR Dashboard chat backend listening on http://localhost:${PORT} (model: ${MODEL})`);
});
