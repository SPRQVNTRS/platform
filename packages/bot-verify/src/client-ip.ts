/**
 * Secure client IP extraction from HTTP headers.
 *
 * SECURITY MODEL:
 * - The leftmost X-Forwarded-For entry is ALWAYS attacker-controlled and
 *   must never be trusted as the real client IP without a trusted proxy chain.
 * - Only a header set by a proxy we control (`trustedHeader`) or the rightmost
 *   N entries in XFF (where N = trusted proxy count) are safe to use.
 *
 * @packageDocumentation
 */

import { normalizeIp } from './cidr.js';

/** Options for {@link getClientIp}. */
export interface ClientIpOptions {
  /**
   * Name of a header (lowercase) that a trusted reverse-proxy overwrites with
   * the real client IP, e.g. `'x-real-ip'`. When present and valid, this
   * header is returned verbatim without inspecting X-Forwarded-For.
   *
   * Only use this if the proxy unconditionally overwrites the header (not
   * merely appends to it), so it cannot be spoofed by the client.
   */
  trustedHeader?: string;
  /**
   * Number of trusted proxies in the infrastructure chain, counted from the
   * RIGHT of the X-Forwarded-For list. Default `0` (only the rightmost entry,
   * added by the edge proxy, is trusted).
   *
   * Example: `"clientIP, proxy1, proxy2"` with `xffTrustedProxyCount: 1`
   * means `proxy2` is trusted, so the real client IP is `proxy1`.
   *
   * NEVER set this higher than the number of proxies you control.
   */
  xffTrustedProxyCount?: number;
}

/**
 * Extracts the best-available client IP from the request headers.
 *
 * Priority:
 * 1. `trustedHeader` (if configured and contains a valid IP)
 * 2. X-Forwarded-For, counting `xffTrustedProxyCount` proxies from the right
 *
 * Returns `null` when no valid IP can be determined.
 *
 * IMPORTANT: The leftmost X-Forwarded-For entry is attacker-controlled.
 * A forged Google IP in position 0 does NOT affect the result when
 * `xffTrustedProxyCount` is `0` (the default).
 *
 * @param headers - The request Headers object
 * @param opts - IP extraction options
 */
export function getClientIp(headers: Headers, opts?: ClientIpOptions): string | null {
  if (opts?.trustedHeader) {
    const headerValue = headers.get(opts.trustedHeader);
    if (headerValue) {
      const normalized = normalizeIp(headerValue.trim());
      if (normalized !== null) {
        return normalized;
      }
    }
  }

  const xffHeader = headers.get('x-forwarded-for');
  if (!xffHeader) {
    return null;
  }

  const entries = xffHeader
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (entries.length === 0) {
    return null;
  }

  const k = opts?.xffTrustedProxyCount ?? 0;
  // The entry at `len - 1 - k` is the first untrusted entry from the right
  const targetIndex = entries.length - 1 - k;

  if (targetIndex < 0 || targetIndex >= entries.length) {
    return null;
  }

  const candidate = entries[targetIndex];
  if (candidate === undefined) {
    return null;
  }

  return normalizeIp(candidate);
}
