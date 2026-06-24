/**
 * Google crawler IP range store.
 *
 * Holds the union of all three Google published CIDR lists and supports
 * background refresh. Never empty: seeds from bundled JSON at construction
 * and falls back to the last-good list on any refresh failure (fail-open).
 *
 * @packageDocumentation
 */

import googlebotData from './data/googlebot.json';
import specialCrawlersData from './data/special-crawlers.json';
import userTriggeredData from './data/user-triggered-fetchers.json';
import { ipInAnyCidr } from './cidr.js';

/** Official URLs for Google's published crawler IP ranges. */
export const GOOGLE_RANGE_URLS = [
  'https://developers.google.com/static/search/apis/ipranges/googlebot.json',
  'https://developers.google.com/static/search/apis/ipranges/special-crawlers.json',
  'https://developers.google.com/static/search/apis/ipranges/user-triggered-fetchers.json',
] as const;

/**
 * Extracts CIDR strings from a Google IP range JSON payload.
 * Handles unknown input defensively — never throws.
 */
export function parsePrefixes(data: unknown): string[] {
  if (typeof data !== 'object' || data === null || !('prefixes' in data)) {
    return [];
  }

  const prefixes = (data as { prefixes: unknown }).prefixes;
  if (!Array.isArray(prefixes)) {
    return [];
  }

  const result: string[] = [];
  for (const entry of prefixes) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }

    const e = entry as Record<string, unknown>;
    if (typeof e['ipv4Prefix'] === 'string') {
      result.push(e['ipv4Prefix']);
    } else if (typeof e['ipv6Prefix'] === 'string') {
      result.push(e['ipv6Prefix']);
    }
  }

  return result;
}

/** The bundled (fail-safe) union of all three Google range files. */
const BUNDLED_CIDRS: readonly string[] = [
  ...parsePrefixes(googlebotData),
  ...parsePrefixes(specialCrawlersData),
  ...parsePrefixes(userTriggeredData),
];

/** Options for constructing a {@link RangeStore}. */
export interface RangeStoreOptions {
  /**
   * Override the initial CIDR list (useful in tests; pass `[]` to simulate
   * empty ranges). Defaults to the bundled union.
   */
  initialRanges?: string[];
  /**
   * Injectable clock for testability. Defaults to `Date.now`.
   */
  now?: () => number;
}

/**
 * Holds the current union of Google crawler CIDR ranges and provides
 * background refresh from the official Google endpoints.
 *
 * Construction is synchronous and never leaves the store empty (seeds from
 * bundled data immediately). Refresh is async and fail-open.
 */
export class RangeStore {
  private cidrs: string[];
  private readonly now: () => number;
  lastRefreshedAt: number;

  constructor(opts?: RangeStoreOptions) {
    this.cidrs = opts?.initialRanges !== undefined ? [...opts.initialRanges] : [...BUNDLED_CIDRS];
    this.now = opts?.now ?? Date.now;
    this.lastRefreshedAt = this.now();
  }

  /**
   * Returns true if `ip` is contained within the current CIDR union.
   */
  contains(ip: string): boolean {
    return ipInAnyCidr(ip, this.cidrs);
  }

  /**
   * Fetches all three Google range URLs and atomically replaces the current
   * CIDR union only if ALL fetches succeed.
   *
   * On any failure (network error, parse error, unexpected shape), keeps the
   * last-good list and returns `false`. Never throws, never empties the store.
   *
   * @param fetchImpl - Fetch implementation (injectable for tests)
   */
  async refresh(fetchImpl: typeof fetch = fetch): Promise<boolean> {
    try {
      const responses = await Promise.all(
        GOOGLE_RANGE_URLS.map((url) => fetchImpl(url)),
      );

      // Fail if any response was not OK
      for (const resp of responses) {
        if (!resp.ok) {
          return false;
        }
      }

      const bodies = await Promise.all(responses.map((r) => r.json() as Promise<unknown>));

      const newCidrs: string[] = [];
      for (const body of bodies) {
        const prefixes = parsePrefixes(body);
        if (prefixes.length === 0) {
          // Unexpected shape — bail out to keep last-good
          return false;
        }
        newCidrs.push(...prefixes);
      }

      // Atomic replace
      this.cidrs = newCidrs;
      this.lastRefreshedAt = this.now();
      return true;
    } catch {
      // Network errors, JSON parse errors, etc. — keep last-good list
      return false;
    }
  }
}
