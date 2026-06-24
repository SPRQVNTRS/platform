/**
 * IP address and CIDR matching utilities using ipaddr.js.
 *
 * All functions are fail-open: malformed input returns `false` / `null`
 * rather than throwing.
 *
 * @packageDocumentation
 */

import ipaddr from 'ipaddr.js';

/**
 * Normalizes an IP address string to a canonical form:
 * - IPv4: standard dotted-decimal, no trailing zeros
 * - IPv6: lowercase compressed form (RFC 5952); v4-mapped addresses (`::ffff:1.2.3.4`)
 *   are unwrapped to their plain IPv4 form
 *
 * Returns `null` for any input that is not a valid IP address.
 *
 * @param ip - Raw IP string (may include port brackets like `[::1]`)
 */
export function normalizeIp(ip: string): string | null {
  const stripped = stripBracketsAndPort(ip);
  if (!stripped) {
    return null;
  }

  try {
    const parsed = ipaddr.parse(stripped);

    if (parsed.kind() === 'ipv6') {
      const v6 = parsed as ipaddr.IPv6;
      if (v6.isIPv4MappedAddress()) {
        // Unwrap ::ffff:x.x.x.x → plain IPv4
        return v6.toIPv4Address().toString();
      }
      // toRFC5952String() produces compressed lowercase form (e.g. "::1")
      return v6.toRFC5952String();
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Tests whether `ip` falls within the given `cidr` range.
 *
 * Handles v4, v6, and v4-mapped-v6 by normalizing before comparison.
 * Different address families never match each other.
 * Returns `false` for any malformed input rather than throwing.
 *
 * @param ip - The IP address to test
 * @param cidr - A CIDR string such as `'66.249.64.0/19'` or `'2001:4860:4800::/32'`
 */
export function ipInCidr(ip: string, cidr: string): boolean {
  try {
    const normalizedIpStr = normalizeIp(ip);
    if (normalizedIpStr === null) {
      return false;
    }

    const addr = ipaddr.parse(normalizedIpStr);
    const [network, prefixLen] = ipaddr.parseCIDR(cidr);

    // Different kinds (v4 vs v6) never match
    if (addr.kind() !== network.kind()) {
      return false;
    }

    return addr.match([network, prefixLen]);
  } catch {
    return false;
  }
}

/**
 * Tests whether `ip` falls within any of the given `cidrs`.
 *
 * Short-circuits on first match. Returns `false` if the list is empty.
 */
export function ipInAnyCidr(ip: string, cidrs: readonly string[]): boolean {
  for (const cidr of cidrs) {
    if (ipInCidr(ip, cidr)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Strips IPv6 bracket notation and optional port from an IP string.
 * e.g. `[::1]:8080` → `::1`, `1.2.3.4:80` (plain IPv4 with port) stays as-is
 * since ipaddr.js handles plain dotted IPv4 without ports.
 */
function stripBracketsAndPort(raw: string): string {
  const trimmed = raw.trim();

  // IPv6 bracket form: [addr] or [addr]:port
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    if (end === -1) {
      return '';
    }
    return trimmed.slice(1, end);
  }

  return trimmed;
}
