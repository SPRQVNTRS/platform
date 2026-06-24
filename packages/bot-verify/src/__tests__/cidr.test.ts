import { describe, it, expect } from 'vitest';
import { ipInCidr, ipInAnyCidr, normalizeIp } from '../cidr.js';

describe('ipInCidr', () => {
  describe('IPv4', () => {
    it('matches an IP inside a /19 block', () => {
      // 192.178.4.0/27 — IPs .0 through .31 are in range
      expect(ipInCidr('192.178.4.1', '192.178.4.0/27')).toBe(true);
    });

    it('does not match an IP outside a /27 block', () => {
      // .32 is the start of the next /27
      expect(ipInCidr('192.178.4.32', '192.178.4.0/27')).toBe(false);
    });

    it('matches the network address itself', () => {
      expect(ipInCidr('66.249.64.0', '66.249.64.0/19')).toBe(true);
    });

    it('does not match an IP from a different /19', () => {
      expect(ipInCidr('66.249.96.1', '66.249.64.0/19')).toBe(false);
    });
  });

  describe('IPv6', () => {
    // From googlebot.json
    const v6Cidr = '2001:4860:4801:10::/64';

    it('matches a v6 address inside the prefix', () => {
      expect(ipInCidr('2001:4860:4801:10::1', v6Cidr)).toBe(true);
    });

    it('does not match a v6 address outside the prefix', () => {
      expect(ipInCidr('2001:4860:4801:11::1', v6Cidr)).toBe(false);
    });
  });

  describe('v4-mapped in v6', () => {
    it('matches an unwrapped v4-mapped address against an IPv4 CIDR', () => {
      // ::ffff:66.249.64.1 should unwrap to 66.249.64.1
      expect(ipInCidr('::ffff:66.249.64.1', '66.249.64.0/19')).toBe(true);
    });

    it('does not match a v6 CIDR when the IP unwraps to v4', () => {
      // After unwrapping to v4, kinds differ → false
      expect(ipInCidr('::ffff:66.249.64.1', '2001:4860:4801:10::/64')).toBe(false);
    });
  });

  describe('malformed input', () => {
    it('returns false for an invalid IP', () => {
      expect(ipInCidr('not-an-ip', '66.249.64.0/19')).toBe(false);
    });

    it('returns false for an invalid CIDR', () => {
      expect(ipInCidr('66.249.64.1', 'not-a-cidr')).toBe(false);
    });

    it('returns false for empty strings', () => {
      expect(ipInCidr('', '')).toBe(false);
    });
  });
});

describe('ipInAnyCidr', () => {
  it('returns true when IP matches at least one CIDR', () => {
    const cidrs = ['10.0.0.0/8', '192.178.4.0/27'];
    expect(ipInAnyCidr('192.178.4.5', cidrs)).toBe(true);
  });

  it('returns false when IP does not match any CIDR', () => {
    const cidrs = ['10.0.0.0/8', '192.178.4.0/27'];
    expect(ipInAnyCidr('1.2.3.4', cidrs)).toBe(false);
  });

  it('returns false for empty CIDR list', () => {
    expect(ipInAnyCidr('66.249.64.1', [])).toBe(false);
  });
});

describe('normalizeIp', () => {
  it('normalizes a plain IPv4 address', () => {
    expect(normalizeIp('66.249.64.1')).toBe('66.249.64.1');
  });

  it('normalizes an IPv6 address to lowercase', () => {
    const result = normalizeIp('2001:4860:4801:0010::0001');
    expect(result).toBe('2001:4860:4801:10::1');
  });

  it('unwraps v4-mapped IPv6 to plain IPv4', () => {
    expect(normalizeIp('::ffff:66.249.64.1')).toBe('66.249.64.1');
  });

  it('unwraps v4-mapped IPv6 in hex form', () => {
    // ::ffff:42f9:4001 = ::ffff:66.249.64.1
    expect(normalizeIp('::ffff:42f9:4001')).toBe('66.249.64.1');
  });

  it('returns null for a hostname', () => {
    expect(normalizeIp('googlebot.com')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(normalizeIp('')).toBeNull();
  });

  it('returns null for junk input', () => {
    expect(normalizeIp('not.an.ip.address')).toBeNull();
  });

  it('handles bracketed IPv6 (strips brackets)', () => {
    expect(normalizeIp('[::1]')).toBe('::1');
  });
});
