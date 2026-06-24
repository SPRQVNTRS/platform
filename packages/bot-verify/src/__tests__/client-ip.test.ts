import { describe, it, expect } from 'vitest';
import { getClientIp } from '../client-ip.js';

function makeHeaders(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe('getClientIp', () => {
  describe('trustedHeader', () => {
    it('returns the trusted header value when present and valid', () => {
      const headers = makeHeaders({
        'x-real-ip': '1.2.3.4',
        'x-forwarded-for': '5.6.7.8',
      });
      expect(getClientIp(headers, { trustedHeader: 'x-real-ip' })).toBe('1.2.3.4');
    });

    it('falls back to XFF when trusted header is missing', () => {
      const headers = makeHeaders({ 'x-forwarded-for': '5.6.7.8' });
      expect(getClientIp(headers, { trustedHeader: 'x-real-ip' })).toBe('5.6.7.8');
    });

    it('falls back to XFF when trusted header contains invalid IP', () => {
      const headers = makeHeaders({
        'x-real-ip': 'not-an-ip',
        'x-forwarded-for': '5.6.7.8',
      });
      expect(getClientIp(headers, { trustedHeader: 'x-real-ip' })).toBe('5.6.7.8');
    });
  });

  describe('XFF with xffTrustedProxyCount', () => {
    it('returns rightmost entry with count 0 (default)', () => {
      const headers = makeHeaders({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
      expect(getClientIp(headers, { xffTrustedProxyCount: 0 })).toBe('5.6.7.8');
    });

    it('returns second-from-right with count 1', () => {
      const headers = makeHeaders({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
      expect(getClientIp(headers, { xffTrustedProxyCount: 1 })).toBe('1.2.3.4');
    });

    it('handles three entries with count 1', () => {
      const headers = makeHeaders({
        'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3',
      });
      expect(getClientIp(headers, { xffTrustedProxyCount: 1 })).toBe('2.2.2.2');
    });
  });

  describe('SECURITY: forged leftmost entry', () => {
    it('does NOT return a forged Google IP at position 0 when count is 0', () => {
      // Attacker forges "66.249.79.2" as leftmost to impersonate Googlebot.
      // Real edge proxy appended "9.9.9.9". Count=0 → rightmost → 9.9.9.9.
      const headers = makeHeaders({
        'x-forwarded-for': '66.249.79.2, 9.9.9.9',
      });
      const ip = getClientIp(headers, { xffTrustedProxyCount: 0 });
      expect(ip).toBe('9.9.9.9');
      expect(ip).not.toBe('66.249.79.2');
    });

    it('returns the forged IP only when count explicitly trusts it', () => {
      // With count=1 we say proxy 9.9.9.9 is trusted and look one step left.
      // In a real setup you'd only do this if you KNOW 9.9.9.9 is your proxy.
      const headers = makeHeaders({
        'x-forwarded-for': '66.249.79.2, 9.9.9.9',
      });
      const ip = getClientIp(headers, { xffTrustedProxyCount: 1 });
      expect(ip).toBe('66.249.79.2');
    });
  });

  describe('edge cases', () => {
    it('returns null when no XFF header', () => {
      const headers = makeHeaders({});
      expect(getClientIp(headers)).toBeNull();
    });

    it('returns null for an invalid IP in XFF', () => {
      const headers = makeHeaders({ 'x-forwarded-for': 'not-an-ip' });
      expect(getClientIp(headers)).toBeNull();
    });

    it('returns null when count exceeds list length', () => {
      const headers = makeHeaders({ 'x-forwarded-for': '1.2.3.4' });
      expect(getClientIp(headers, { xffTrustedProxyCount: 5 })).toBeNull();
    });

    it('normalizes an IPv6 XFF entry', () => {
      const headers = makeHeaders({
        'x-forwarded-for': '2001:4860:4801:10::1',
      });
      expect(getClientIp(headers)).toBe('2001:4860:4801:10::1');
    });

    it('normalizes v4-mapped IPv6 in XFF to plain IPv4', () => {
      const headers = makeHeaders({
        'x-forwarded-for': '::ffff:1.2.3.4',
      });
      expect(getClientIp(headers)).toBe('1.2.3.4');
    });
  });
});
