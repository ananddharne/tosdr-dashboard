import { Platform } from 'react-native';

// Data breaches from Have I Been Pwned (https://haveibeenpwned.com).
//
//   GET https://haveibeenpwned.com/api/v3/breaches?domain=<domain>
//
// Public, free, no API key, and CORS-enabled, so the app calls it directly.
// Matching is by exact domain, so we try each of an app's domains.
//
// Attribution (required): HIBP breach data is licensed under CC BY 4.0.
// Credit it wherever breaches are shown and on the About screen.
//
// We drop entries that aren't a breach of the company itself: lists HIBP
// believes are fabricated, spam lists, stealer logs and malware dumps, and
// retired entries. Unverified breaches are kept but labelled.

export const HIBP_SITE = 'https://haveibeenpwned.com';
const API = `${HIBP_SITE}/api/v3/breaches`;
const TIMEOUT_MS = 12000;
const MAX_DOMAINS = 4;
const TTL_MS = 6 * 60 * 60 * 1000;

interface HibpBreach {
  Name: string;
  Title: string;
  Domain: string;
  BreachDate: string;
  AddedDate: string;
  PwnCount: number;
  Description: string;
  DataClasses: string[];
  IsVerified: boolean;
  IsFabricated: boolean;
  IsSensitive: boolean;
  IsRetired: boolean;
  IsSpamList: boolean;
  IsMalware?: boolean;
  IsStealerLog?: boolean;
}

export interface Breach {
  id: string;
  title: string;
  domain: string;
  /** When the breach happened (YYYY-MM-DD; often only the month is known). */
  breachDate: string;
  /** When HIBP added it; usually when it became public. */
  addedDate: string;
  accounts: number;
  /** What leaked: "Email addresses", "Passwords"… */
  dataClasses: string[];
  /** HIBP's description with HTML removed. */
  description: string;
  verified: boolean;
  /** HIBP's page for this breach. */
  url: string;
}

export interface BreachReport {
  domains: string[];
  breaches: Breach[];
  /** Total accounts across all breaches (may count the same person twice). */
  accounts: number;
}

/** "https://www.facebook.com/policy" -> "facebook.com". Null for non-domains. */
export function domainOf(raw: string): string | null {
  const host = raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#:].*$/, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

const stripHtml = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

async function fetchDomain(domain: string): Promise<HibpBreach[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // HIBP asks clients for a User-Agent; browsers don't let pages set one,
    // but they send their own.
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (Platform.OS !== 'web') {
      headers['User-Agent'] = 'tosdr-dashboard';
    }
    const res = await fetch(`${API}?domain=${encodeURIComponent(domain)}`, { headers, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HIBP ${res.status}`);
    }
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as HibpBreach[]) : [];
  } finally {
    clearTimeout(timer);
  }
}

const cache = new Map<string, { at: number; report: Promise<BreachReport> }>();

/**
 * Breaches listed for any of `urls` (an app's domains), newest first.
 * Rejects if HIBP can't be reached, so callers can tell "none" from "unknown".
 */
export function fetchBreaches(urls: string[]): Promise<BreachReport> {
  const domains = [...new Set(urls.map(domainOf).filter((d): d is string => d !== null))].slice(0, MAX_DOMAINS);
  const key = domains.join(',');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return hit.report;
  }
  const report = (async (): Promise<BreachReport> => {
    const lists = await Promise.all(domains.map(fetchDomain));
    const seen = new Set<string>();
    const breaches: Breach[] = [];
    for (const b of lists.flat()) {
      if (seen.has(b.Name) || b.IsFabricated || b.IsSpamList || b.IsRetired || b.IsMalware || b.IsStealerLog) {
        continue;
      }
      seen.add(b.Name);
      breaches.push({
        id: b.Name,
        title: b.Title,
        domain: b.Domain,
        breachDate: b.BreachDate,
        addedDate: b.AddedDate,
        accounts: b.PwnCount,
        dataClasses: b.DataClasses,
        description: stripHtml(b.Description),
        verified: b.IsVerified,
        url: `${HIBP_SITE}/Breach/${encodeURIComponent(b.Name)}`,
      });
    }
    breaches.sort((a, b) => b.breachDate.localeCompare(a.breachDate));
    return { domains, breaches, accounts: breaches.reduce((n, b) => n + b.accounts, 0) };
  })();
  cache.set(key, { at: Date.now(), report });
  // Don't keep a failure cached.
  report.catch(() => cache.delete(key));
  return report;
}

/** 509458528 -> "509M", 6682453 -> "6.7M", 77267 -> "77K". */
export function formatCount(n: number): string {
  const fmt = (v: number, unit: string) => `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}${unit}`;
  if (n >= 1e9) return fmt(n / 1e9, 'B');
  if (n >= 1e6) return fmt(n / 1e6, 'M');
  if (n >= 1e3) return fmt(n / 1e3, 'K');
  return String(n);
}
