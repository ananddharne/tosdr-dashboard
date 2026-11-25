import { Platform } from 'react-native';

// Data breaches from Have I Been Pwned (https://haveibeenpwned.com).
//
//   GET https://haveibeenpwned.com/api/v3/breaches
//
// The app downloads HIBP's full public list once (about 1,050 breaches,
// ~220 KB compressed; free, no API key, CORS-enabled) and matches locally:
//   - exact: the breach's domain is the app's domain or a subdomain of it;
//   - brand: same brand on another site (dominos.com -> dominos.co.in), which
//     may be a separate company such as a local franchise, so it is labelled.
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
  /** exact: this app's site; brand: another site of the same brand. */
  match: 'exact' | 'brand';
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

// "dominos.co.in" -> "dominos", "pizza.dominos.be" -> "dominos".
const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'gov', 'ac', 'edu', 'ne', 'or']);
function brandOf(domain: string): string {
  const parts = domain.split('.');
  if (parts.length >= 3 && SECOND_LEVEL.has(parts[parts.length - 2]) && parts[parts.length - 1].length === 2) {
    return parts[parts.length - 3];
  }
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
}
// Short brands ("x", "ok") would match unrelated sites.
const MIN_BRAND = 4;

let all: { at: number; list: Promise<HibpBreach[]> } | null = null;

function fetchAll(): Promise<HibpBreach[]> {
  if (all && Date.now() - all.at < TTL_MS) {
    return all.list;
  }
  const list = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      // HIBP asks clients for a User-Agent; browsers don't let pages set one,
      // but they send their own.
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (Platform.OS !== 'web') {
        headers['User-Agent'] = 'tosdr-dashboard';
      }
      const res = await fetch(API, { headers, signal: controller.signal });
      if (!res.ok) {
        throw new Error(`HIBP ${res.status}`);
      }
      const data: unknown = await res.json();
      return Array.isArray(data) ? (data as HibpBreach[]) : [];
    } finally {
      clearTimeout(timer);
    }
  })();
  all = { at: Date.now(), list };
  // Don't keep a failure cached.
  list.catch(() => {
    all = null;
  });
  return list;
}

function matchOf(breachDomain: string, domains: string[]): Breach['match'] | null {
  const bd = breachDomain.toLowerCase().replace(/^www\./, '');
  if (bd === '') {
    return null;
  }
  if (domains.some((d) => bd === d || bd.endsWith(`.${d}`))) {
    return 'exact';
  }
  const brand = brandOf(bd);
  return brand.length >= MIN_BRAND && domains.some((d) => brandOf(d) === brand) ? 'brand' : null;
}

/**
 * Breaches for any of `urls` (an app's domains), this app's own first, then
 * newest first. Rejects if HIBP can't be reached, so callers can tell "none"
 * from "unknown".
 */
export async function fetchBreaches(urls: string[]): Promise<BreachReport> {
  const domains = [...new Set(urls.map(domainOf).filter((d): d is string => d !== null))];
  const list = await fetchAll();
  const breaches: Breach[] = [];
  for (const b of list) {
    if (b.IsFabricated || b.IsSpamList || b.IsRetired || b.IsMalware || b.IsStealerLog) {
      continue;
    }
    const match = matchOf(b.Domain, domains);
    if (match === null) {
      continue;
    }
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
      match,
    });
  }
  breaches.sort((a, b) => (a.match === b.match ? 0 : a.match === 'exact' ? -1 : 1) || b.breachDate.localeCompare(a.breachDate));
  return { domains, breaches, accounts: breaches.reduce((n, b) => n + b.accounts, 0) };
}

/** 509458528 -> "509M", 6682453 -> "6.7M", 77267 -> "77K". */
export function formatCount(n: number): string {
  const fmt = (v: number, unit: string) => `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}${unit}`;
  if (n >= 1e9) return fmt(n / 1e9, 'B');
  if (n >= 1e6) return fmt(n / 1e6, 'M');
  if (n >= 1e3) return fmt(n / 1e3, 'K');
  return String(n);
}
