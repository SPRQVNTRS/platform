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

/** Default per-attempt budget for the three range fetches, in milliseconds. */
export const DEFAULT_REFRESH_TIMEOUT_MS = 10_000;

/** Options for a single {@link RangeStore.refresh} attempt. */
export interface RefreshOptions {
  /**
   * Total time budget for one attempt (all three fetches and their body
   * reads share it). Defaults to {@link DEFAULT_REFRESH_TIMEOUT_MS}.
   */
  timeoutMs?: number;
}

/** Rejects with the signal's reason once it aborts. Never resolves. */
function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

/**
 * Holds the current union of Google crawler CIDR ranges and provides
 * background refresh from the official Google endpoints.
 *
 * Construction is synchronous and never leaves the store empty (seeds from
 * bundled data immediately). Refresh is async, fail-open, single-flight and
 * time-boxed.
 */
export class RangeStore {
  private cidrs: string[];
  private readonly now: () => number;
  private inFlight: Promise<boolean> | null = null;
  /** Time of the last successful refresh (or construction). */
  lastRefreshedAt: number;
  /** Time the last real refresh attempt started, or `null` before any attempt. */
  lastAttemptAt: number | null = null;

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
   * Returns true when a background refresh should start now.
   *
   * False while a refresh is in flight. Otherwise true only when the list is
   * older than `ttlMs` AND the last attempt (if any) started more than
   * `retryMs` ago, so a failing endpoint is not hit on every request.
   */
  isRefreshDue(ttlMs: number, retryMs: number): boolean {
    if (this.inFlight !== null) {
      return false;
    }

    const now = this.now();
    if (now - this.lastRefreshedAt <= ttlMs) {
      return false;
    }

    return this.lastAttemptAt === null || now - this.lastAttemptAt > retryMs;
  }

  /**
   * Fetches all three Google range URLs and atomically replaces the current
   * CIDR union only if ALL fetches succeed with non-empty prefix lists.
   *
   * Single-flight: while an attempt is running, further calls return the same
   * promise and start no new fetches. Each attempt is bounded by one
   * `AbortSignal.timeout`, passed to every fetch so it also aborts body reads.
   *
   * On any failure (network error, timeout, parse error, unexpected shape),
   * keeps the last-good list and returns `false`. Never throws, never empties
   * the store.
   *
   * @param fetchImpl - Fetch implementation (injectable for tests)
   * @param opts - Per-attempt options
   */
  refresh(fetchImpl: typeof fetch = fetch, opts?: RefreshOptions): Promise<boolean> {
    if (this.inFlight !== null) {
      return this.inFlight;
    }

    this.lastAttemptAt = this.now();
    const attempt: Promise<boolean> = this.attemptRefresh(
      fetchImpl,
      opts?.timeoutMs ?? DEFAULT_REFRESH_TIMEOUT_MS,
    ).finally(() => {
      if (this.inFlight === attempt) {
        this.inFlight = null;
      }
    });
    this.inFlight = attempt;
    return attempt;
  }

  private async attemptRefresh(fetchImpl: typeof fetch, timeoutMs: number): Promise<boolean> {
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      // Race against the signal as well, so a fetchImpl that ignores it can
      // not leave the in-flight slot occupied forever.
      const newCidrs = await Promise.race([
        this.fetchAllRanges(fetchImpl, signal),
        rejectOnAbort(signal),
      ]);
      if (newCidrs === null) {
        return false;
      }

      // Atomic replace
      this.cidrs = newCidrs;
      this.lastRefreshedAt = this.now();
      return true;
    } catch {
      // Network errors, timeouts, JSON parse errors, etc. — keep last-good list
      return false;
    }
  }

  /** Returns the new union, or `null` when any response is unusable. */
  private async fetchAllRanges(
    fetchImpl: typeof fetch,
    signal: AbortSignal,
  ): Promise<string[] | null> {
    const responses = await Promise.all(
      GOOGLE_RANGE_URLS.map((url) => fetchImpl(url, { signal })),
    );

    // Fail if any response was not OK
    for (const resp of responses) {
      if (!resp.ok) {
        return null;
      }
    }

    const bodies = await Promise.all(responses.map((r) => r.json() as Promise<unknown>));

    const newCidrs: string[] = [];
    for (const body of bodies) {
      const prefixes = parsePrefixes(body);
      if (prefixes.length === 0) {
        // Unexpected shape — bail out to keep last-good
        return null;
      }
      newCidrs.push(...prefixes);
    }

    return newCidrs;
  }
}
