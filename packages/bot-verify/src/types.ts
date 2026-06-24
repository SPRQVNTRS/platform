/**
 * Core types for bot verification.
 *
 * @packageDocumentation
 */

/**
 * The outcome of a bot verification check.
 *
 * - `'verified'` — IP confirmed as a legitimate Google crawler
 * - `'spoofed'` — IP does NOT belong to Google; the UA claim is fraudulent
 * - `'uncertain'` — could not confirm or deny (e.g., DNS error, missing IP)
 * - `'not-a-claim'` — the User-Agent does not claim to be a Google crawler
 */
export type BotVerdict = 'verified' | 'spoofed' | 'uncertain' | 'not-a-claim';

/** Input supplied to the verifier for a single request. */
export interface VerifyInput {
  /** Raw User-Agent header value. */
  userAgent: string;
  /** Client IP address (may be null if unavailable). */
  ip: string | null;
}

/** Result of a single verification. */
export interface VerifyResult {
  /** Final verdict for this request. */
  verdict: BotVerdict;
  /**
   * The Google crawler token that was claimed in the UA, e.g. `'Googlebot'`.
   * `null` when `verdict` is `'not-a-claim'`.
   */
  claimedBot: string | null;
  /** The client IP that was evaluated (may be null when not available). */
  ip: string | null;
  /**
   * The method used to reach the verdict.
   * - `'ip-range'` — checked against Google's published CIDR lists
   * - `'rdns'` — verified (or failed) via reverse-DNS lookup
   * - `'none'` — no IP/network check was performed
   */
  method: 'ip-range' | 'rdns' | 'none';
  /** Short human-readable explanation of the verdict. */
  reason: string;
}
