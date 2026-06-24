/**
 * Reverse-DNS verification for Google crawlers.
 *
 * Implements the two-step check recommended by Google:
 *   1. PTR lookup on the IP → hostname
 *   2. Forward A/AAAA lookup on that hostname → must contain the original IP
 *
 * @packageDocumentation
 */

import dns from 'node:dns/promises';
import { normalizeIp } from './cidr.js';

const DNS_ERROR_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEOUT', 'ESERVFAIL', 'ENONAME']);

/** Allowed domains for reverse-DNS confirmation. */
const DEFAULT_ALLOWED_DOMAINS = ['googlebot.com', 'google.com', 'googleusercontent.com'] as const;

/** Options for {@link reverseDnsVerify}. */
export interface ReverseDnsOptions {
  /**
   * Hostname suffixes that are accepted as legitimate Google crawler domains.
   * Defaults to `['googlebot.com', 'google.com', 'googleusercontent.com']`.
   */
  allowedDomains?: string[];
  /**
   * Maximum time in milliseconds to wait for DNS lookups.
   * Defaults to `1500`.
   */
  timeoutMs?: number;
}

/**
 * Performs a two-step reverse-DNS verification for a Google crawler IP.
 *
 * Returns:
 * - `'confirmed'` — PTR resolves to a Google domain AND forward A/AAAA
 *   resolves back to the original IP
 * - `'failed'` — DNS resolves successfully but does NOT confirm Google
 *   (no PTR, non-Google hostname, or forward mismatch)
 * - `'error'` — DNS infrastructure failure (timeout, SERVFAIL, ECONNREFUSED)
 *
 * A timeout is treated as `'error'` (uncertain), not `'failed'` (spoofed),
 * because we must not block legitimate bots due to DNS unreachability.
 */
export async function reverseDnsVerify(
  ip: string,
  opts?: ReverseDnsOptions,
): Promise<'confirmed' | 'failed' | 'error'> {
  const allowedDomains = opts?.allowedDomains ?? DEFAULT_ALLOWED_DOMAINS;
  const timeoutMs = opts?.timeoutMs ?? 1500;

  return Promise.race([
    doVerify(ip, allowedDomains),
    timeout(timeoutMs),
  ]);
}

async function doVerify(
  ip: string,
  allowedDomains: readonly string[],
): Promise<'confirmed' | 'failed' | 'error'> {
  const normalizedOriginal = normalizeIp(ip);
  if (normalizedOriginal === null) {
    return 'failed';
  }

  // Step 1: PTR lookup
  let hostnames: string[];
  try {
    hostnames = await dns.reverse(ip);
  } catch (err) {
    return classifyDnsError(err);
  }

  if (hostnames.length === 0) {
    return 'failed';
  }

  // Step 2: Forward lookup on each hostname that matches an allowed domain
  for (const hostname of hostnames) {
    if (!isAllowedDomain(hostname, allowedDomains)) {
      continue;
    }

    const forwardConfirmed = await forwardLookup(hostname, normalizedOriginal);
    if (forwardConfirmed === 'confirmed') {
      return 'confirmed';
    }
    if (forwardConfirmed === 'error') {
      return 'error';
    }
    // 'failed' → try next hostname
  }

  return 'failed';
}

async function forwardLookup(
  hostname: string,
  originalIp: string,
): Promise<'confirmed' | 'failed' | 'error'> {
  try {
    const [ipv4Results, ipv6Results] = await Promise.allSettled([
      dns.resolve4(hostname),
      dns.resolve6(hostname),
    ]);

    const addresses: string[] = [];

    if (ipv4Results.status === 'fulfilled') {
      addresses.push(...ipv4Results.value);
    } else if (isInfraError(ipv4Results.reason)) {
      return 'error';
    }

    if (ipv6Results.status === 'fulfilled') {
      addresses.push(...ipv6Results.value);
    } else if (isInfraError(ipv6Results.reason)) {
      return 'error';
    }

    for (const addr of addresses) {
      const normalized = normalizeIp(addr);
      if (normalized !== null && normalized === originalIp) {
        return 'confirmed';
      }
    }

    return 'failed';
  } catch (err) {
    return isInfraError(err) ? 'error' : 'failed';
  }
}

function isAllowedDomain(hostname: string, allowedDomains: readonly string[]): boolean {
  const lower = hostname.toLowerCase();
  for (const domain of allowedDomains) {
    if (lower === domain || lower.endsWith(`.${domain}`)) {
      return true;
    }
  }
  return false;
}

function classifyDnsError(err: unknown): 'failed' | 'error' {
  if (isInfraError(err)) {
    return 'error';
  }
  // ENOTFOUND, ENODATA, NXDOMAIN, ENONAME → legitimately no record → failed
  return 'failed';
}

function isInfraError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  const code = (err as { code?: string }).code;
  if (code === undefined) {
    return false;
  }
  return DNS_ERROR_CODES.has(code);
}

function timeout(ms: number): Promise<'error'> {
  return new Promise((resolve) => setTimeout(() => resolve('error'), ms));
}
