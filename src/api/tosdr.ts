// ToS;DR API client.
//
// Data source: the public ToS;DR API at https://api.tosdr.org
//   GET /search/v5?query=<text>  -> { services: [...] }
//   GET /service/v3?id=<id>      -> one service with rating + points
// No API key is required. The API is volunteer-run with no SLA, so every
// call here has a timeout and callers must handle failure by serving the
// last cached copy with its fetch date (see src/services/storage.ts).
//
// Attribution (required): ToS;DR grades and points are published under
// CC BY-SA 3.0 by Terms of Service; Didn't Read (https://tosdr.org).
// This app is an independent client and is not affiliated with ToS;DR.
// Show the attribution on the About screen; do not remove it.

export const TOSDR_API_BASE = 'https://api.tosdr.org';
export const TOSDR_SITE = 'https://tosdr.org';

const TIMEOUT_MS = 15000;

export interface TosdrSearchService {
  id: number;
  name: string;
  slug: string;
  rating: string;
  urls: string[];
  is_comprehensively_reviewed: boolean;
  updated_at: string;
  created_at: string;
}

export interface TosdrCase {
  id: number;
  title: string;
  localized_title: string | null;
  description: string;
  classification: string; // "good" | "bad" | "neutral" | "blocker" (others tolerated)
  topic_id: number;
  weight: number;
}

export interface TosdrPoint {
  id: number;
  title: string;
  analysis: string;
  source: string;
  status: string; // e.g. "APPROVED"
  document_id: number | null;
  updated_at: string;
  created_at: string;
  case: TosdrCase;
}

export interface TosdrDocumentRef {
  id: number;
  name: string;
  url: string;
  updated_at: string;
  created_at: string;
}

export interface TosdrServiceDetail {
  id: number;
  name: string;
  slug: string;
  rating: string;
  urls: string[];
  image: string | null;
  is_comprehensively_reviewed: boolean;
  documents: TosdrDocumentRef[];
  points: TosdrPoint[];
  updated_at: string;
  created_at: string;
}

export class TosdrApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'TosdrApiError';
    this.status = status;
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${TOSDR_API_BASE}${path}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new TosdrApiError(`ToS;DR API ${res.status} for ${path}`, res.status);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof TosdrApiError) {
      throw err;
    }
    throw new TosdrApiError(
      err instanceof Error ? `Network error: ${err.message}` : 'Network error contacting ToS;DR',
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Search ToS;DR services by name. Returns best matches first. */
export async function searchServices(query: string): Promise<TosdrSearchService[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const data = await fetchJson<{ services?: TosdrSearchService[] }>(
    `/search/v5?query=${encodeURIComponent(trimmed)}`,
  );
  return Array.isArray(data.services) ? data.services : [];
}

/**
 * Fetch one service with its rating and full points list.
 * The v3 endpoint returns the service object directly; older wrapped
 * shapes ({ parameters: {...} }) are unwrapped defensively.
 */
export async function getService(serviceId: number): Promise<TosdrServiceDetail> {
  const data = await fetchJson<Record<string, unknown>>(`/service/v3?id=${serviceId}`);
  const raw = (data.parameters ?? data) as unknown as TosdrServiceDetail;
  if (!raw || typeof raw.id !== 'number' || !Array.isArray(raw.points)) {
    throw new TosdrApiError(`Unexpected service payload for id ${serviceId}`, 0);
  }
  return raw;
}

/** Only points the ToS;DR community has approved are shown by default. */
export function approvedPoints(service: TosdrServiceDetail): TosdrPoint[] {
  return service.points.filter((p) => p.status.toUpperCase() === 'APPROVED');
}
