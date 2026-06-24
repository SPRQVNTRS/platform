/**
 * Core bot verification logic.
 *
 * Creates a `BotVerifier` that checks whether a request claiming to be a
 * Google crawler actually originates from Google's published IP ranges or can
 * be confirmed via reverse-DNS.
 *
 * OVERRIDING CORRECTNESS RULE: NEVER classify a real Google crawler as
 * `'spoofed'`. When in doubt (missing IP, DNS errors, range refresh failure),
 * return `'uncertain'` so callers treat the request as pass-through.
 *
 * @packageDocumentation
 */

import { detectClaimedCrawler } from './ua.js';
import { normalizeIp } from './cidr.js';
import { RangeStore } from './ranges.js';
import { reverseDnsVerify } from './rdns.js';
import type { VerifyInput, VerifyResult } from './types.js';

/** Options for {@link createBotVerifier}. */
export interface BotVerifierOptions {
  /**
   * How often to refresh the Google IP ranges from the official URLs.
   * Defaults to 24 hours.
   */
  rangeRefreshTtlMs?: number;
  /**
   * Whether to perform a reverse-DNS lookup when the IP is not in the
   * published ranges. Defaults to `true`.
   *
   * When `false`, any IP not in the published ranges is immediately classified
   * as `'spoofed'`.
   */
  rdns?: boolean;
  /**
   * Timeout for rDNS lookups in milliseconds. Defaults to `1500`.
   */
  rdnsTimeoutMs?: number;
  /**
   * Injectable fetch implementation (useful in tests to avoid network calls).
   * Defaults to the global `fetch`.
   */
  fetchImpl?: typeof fetch;
  /**
   * Injectable rDNS implementation (useful in tests).
   * Defaults to {@link reverseDnsVerify} with `rdnsTimeoutMs` applied.
   */
  rdnsImpl?: (ip: string) => Promise<'confirmed' | 'failed' | 'error'>;
  /**
   * Injectable clock for testability. Defaults to `Date.now`.
   */
  now?: () => number;
  /**
   * Override the initial CIDR list (useful in tests; pass `[]` to simulate
   * empty ranges). Defaults to the bundled union of all three Google files.
   */
  initialRanges?: string[];
  /**
   * Optional structured logger called after every verification.
   * Errors thrown by the logger are swallowed so they never affect the result.
   */
  logger?: (result: VerifyResult) => void;
}

/** Public interface for a bot verifier instance. */
export interface BotVerifier {
  /**
   * Verifies whether the request described by `input` is a legitimate
   * Google crawler or a spoof attempt.
   */
  verify(input: VerifyInput): Promise<VerifyResult>;
  /**
   * Manually triggers a refresh of the Google IP ranges.
   * Returns `true` on success, `false` if the refresh failed (ranges unchanged).
   */
  refreshRanges(): Promise<boolean>;
}

/**
 * Creates a new {@link BotVerifier} instance.
 *
 * The verifier seeds its IP range list from the bundled JSON files
 * immediately (so it is never empty) and refreshes lazily in the background
 * based on `rangeRefreshTtlMs`.
 */
export function createBotVerifier(opts?: BotVerifierOptions): BotVerifier {
  const rangeRefreshTtlMs = opts?.rangeRefreshTtlMs ?? 24 * 60 * 60 * 1000;
  const useRdns = opts?.rdns ?? true;
  const rdnsTimeoutMs = opts?.rdnsTimeoutMs ?? 1500;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const nowFn = opts?.now ?? Date.now;
  const logger = opts?.logger;

  const store = new RangeStore({
    initialRanges: opts?.initialRanges,
    now: nowFn,
  });

  const rdnsImpl =
    opts?.rdnsImpl ??
    ((ip: string) => reverseDnsVerify(ip, { timeoutMs: rdnsTimeoutMs }));

  async function verify(input: VerifyInput): Promise<VerifyResult> {
    const result = await doVerify(input);
    if (logger) {
      try {
        logger(result);
      } catch {
        // Logger errors must never propagate
      }
    }
    return result;
  }

  async function doVerify(input: VerifyInput): Promise<VerifyResult> {
    const { userAgent, ip } = input;

    // Step 1: Check if the UA claims to be a Google crawler at all
    const claimedBot = detectClaimedCrawler(userAgent);
    if (claimedBot === null) {
      return {
        verdict: 'not-a-claim',
        claimedBot: null,
        ip,
        method: 'none',
        reason: 'UA does not claim a Google crawler',
      };
    }

    // Step 2: Validate the IP
    const normalizedIp = ip ? normalizeIp(ip) : null;
    if (!ip || normalizedIp === null) {
      return {
        verdict: 'uncertain',
        claimedBot,
        ip: ip ?? null,
        method: 'none',
        reason: 'no usable client IP',
      };
    }

    // Step 3: Lazy range refresh
    const age = nowFn() - store.lastRefreshedAt;
    if (age > rangeRefreshTtlMs) {
      // Fire and forget — failures are swallowed inside RangeStore.refresh
      await store.refresh(fetchImpl);
    }

    // Step 4: IP-range check
    if (store.contains(normalizedIp)) {
      return {
        verdict: 'verified',
        claimedBot,
        ip: normalizedIp,
        method: 'ip-range',
        reason: 'IP in Google published ranges',
      };
    }

    // Step 5: rDNS check (when enabled)
    if (useRdns) {
      const rdnsResult = await rdnsImpl(normalizedIp);

      if (rdnsResult === 'confirmed') {
        return {
          verdict: 'verified',
          claimedBot,
          ip: normalizedIp,
          method: 'rdns',
          reason: 'reverse-DNS confirmed Google',
        };
      }

      if (rdnsResult === 'failed') {
        return {
          verdict: 'spoofed',
          claimedBot,
          ip: normalizedIp,
          method: 'rdns',
          reason: 'reverse-DNS does not confirm Google ownership',
        };
      }

      // rdnsResult === 'error'
      return {
        verdict: 'uncertain',
        claimedBot,
        ip: normalizedIp,
        method: 'rdns',
        reason: 'rDNS inconclusive (DNS infrastructure error)',
      };
    }

    // Step 6: rDNS disabled — IP not in range → spoofed
    return {
      verdict: 'spoofed',
      claimedBot,
      ip: normalizedIp,
      method: 'ip-range',
      reason: 'IP not in Google published ranges (rDNS disabled)',
    };
  }

  return {
    verify,
    refreshRanges: () => store.refresh(fetchImpl),
  };
}
