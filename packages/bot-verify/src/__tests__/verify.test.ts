import { describe, it, expect, vi } from 'vitest';
import { createBotVerifier } from '../verify.js';
import { parsePrefixes } from '../ranges.js';

// Load the bundled data to pick sample IPs — same data the production store uses
import googlebotData from '../data/googlebot.json' assert { type: 'json' };
import specialCrawlersData from '../data/special-crawlers.json' assert { type: 'json' };
import userTriggeredData from '../data/user-triggered-fetchers.json' assert { type: 'json' };

// ─── Helpers ────────────────────────────────────────────────────────────────

const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
const SPOOF_IP = '45.39.15.48'; // Not a Google IP

/** Creates a verifier that will never touch the network */
function createTestVerifier(overrides?: Parameters<typeof createBotVerifier>[0]) {
  return createBotVerifier({
    fetchImpl: () => { throw new Error('network disabled in tests'); },
    rdns: false,
    ...overrides,
  });
}

// ─── Sample IPs from each bundled file ──────────────────────────────────────

const googlebotPrefixes = parsePrefixes(googlebotData);
const specialPrefixes = parsePrefixes(specialCrawlersData);
const userTriggeredPrefixes = parsePrefixes(userTriggeredData);

/** Pick the first IP from a /N CIDR prefix (the network address + 1 for hosts) */
function firstIpInPrefix(cidr: string): string {
  const [base] = cidr.split('/');
  if (base === undefined) throw new Error(`Invalid CIDR: ${cidr}`);
  // For IPv4, increment the last octet by 1 to get a host address
  if (!base.includes(':')) {
    const parts = base.split('.');
    const last = parts[3];
    if (last !== undefined) {
      const n = parseInt(last, 10);
      parts[3] = String(n + 1);
      return parts.join('.');
    }
  }
  // For IPv6, append ::1
  return `${base}1`;
}

// A few sample IPs from each file
const googlebotIpv4 = (() => {
  const p = googlebotPrefixes.find((c) => !c.includes(':'));
  if (!p) throw new Error('No IPv4 prefix in googlebot.json');
  return firstIpInPrefix(p);
})();

const googlebotIpv6 = (() => {
  const p = googlebotPrefixes.find((c) => c.includes(':'));
  if (!p) throw new Error('No IPv6 prefix in googlebot.json');
  return firstIpInPrefix(p);
})();

const specialIpv4 = (() => {
  const p = specialPrefixes.find((c) => !c.includes(':'));
  if (!p) throw new Error('No IPv4 prefix in special-crawlers.json');
  return firstIpInPrefix(p);
})();

const userTriggeredIpv4 = (() => {
  const p = userTriggeredPrefixes.find((c) => !c.includes(':'));
  if (!p) throw new Error('No IPv4 prefix in user-triggered-fetchers.json');
  return firstIpInPrefix(p);
})();

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('createBotVerifier', () => {
  describe('not-a-claim (non-Google UA)', () => {
    it('returns not-a-claim for a normal browser UA', async () => {
      const verifier = createTestVerifier();
      const result = await verifier.verify({ userAgent: CHROME_UA, ip: SPOOF_IP });
      expect(result.verdict).toBe('not-a-claim');
      expect(result.claimedBot).toBeNull();
      expect(result.method).toBe('none');
    });
  });

  describe('uncertain (missing/invalid IP)', () => {
    it('returns uncertain when ip is null', async () => {
      const verifier = createTestVerifier({ rdns: true });
      const result = await verifier.verify({ userAgent: GOOGLEBOT_UA, ip: null });
      expect(result.verdict).toBe('uncertain');
      expect(result.claimedBot).toBe('Googlebot');
    });

    it('returns uncertain when ip is empty string', async () => {
      const verifier = createTestVerifier({ rdns: true });
      const result = await verifier.verify({ userAgent: GOOGLEBOT_UA, ip: '' });
      expect(result.verdict).toBe('uncertain');
    });

    it('returns uncertain when ip is not a valid address', async () => {
      const verifier = createTestVerifier({ rdns: true });
      const result = await verifier.verify({ userAgent: GOOGLEBOT_UA, ip: 'not-an-ip' });
      expect(result.verdict).toBe('uncertain');
    });
  });

  describe('verified via ip-range', () => {
    it('verifies a real Googlebot IPv4 from googlebot.json', async () => {
      const verifier = createTestVerifier();
      const result = await verifier.verify({ userAgent: GOOGLEBOT_UA, ip: googlebotIpv4 });
      expect(result.verdict).toBe('verified');
      expect(result.method).toBe('ip-range');
    });

    it('verifies a real Googlebot IPv6 from googlebot.json', async () => {
      const verifier = createTestVerifier();
      const result = await verifier.verify({ userAgent: GOOGLEBOT_UA, ip: googlebotIpv6 });
      expect(result.verdict).toBe('verified');
      expect(result.method).toBe('ip-range');
    });

    it('verifies a real IP from special-crawlers.json', async () => {
      const verifier = createTestVerifier();
      const result = await verifier.verify({ userAgent: GOOGLEBOT_UA, ip: specialIpv4 });
      expect(result.verdict).toBe('verified');
      expect(result.method).toBe('ip-range');
    });

    it('verifies a real IP from user-triggered-fetchers.json', async () => {
      const verifier = createTestVerifier();
      const result = await verifier.verify({ userAgent: GOOGLEBOT_UA, ip: userTriggeredIpv4 });
      expect(result.verdict).toBe('verified');
      expect(result.method).toBe('ip-range');
    });
  });

  describe('spoofed (rdns: false)', () => {
    it('returns spoofed for a non-Google IP when rdns is disabled', async () => {
      const verifier = createTestVerifier({ rdns: false });
      const result = await verifier.verify({ userAgent: GOOGLEBOT_UA, ip: SPOOF_IP });
      expect(result.verdict).toBe('spoofed');
      expect(result.method).toBe('ip-range');
      expect(result.claimedBot).toBe('Googlebot');
    });
  });

  describe('rdns outcomes', () => {
    it('returns verified when rdnsImpl confirms', async () => {
      const verifier = createTestVerifier({
        rdns: true,
        rdnsImpl: async () => 'confirmed',
      });
      const result = await verifier.verify({ userAgent: GOOGLEBOT_UA, ip: SPOOF_IP });
      expect(result.verdict).toBe('verified');
      expect(result.method).toBe('rdns');
    });

    it('returns spoofed when rdnsImpl returns failed', async () => {
      const verifier = createTestVerifier({
        rdns: true,
        rdnsImpl: async () => 'failed',
      });
      const result = await verifier.verify({ userAgent: GOOGLEBOT_UA, ip: SPOOF_IP });
      expect(result.verdict).toBe('spoofed');
      expect(result.method).toBe('rdns');
    });

    it('returns uncertain when rdnsImpl returns error (fail-open)', async () => {
      const verifier = createTestVerifier({
        rdns: true,
        rdnsImpl: async () => 'error',
      });
      const result = await verifier.verify({ userAgent: GOOGLEBOT_UA, ip: SPOOF_IP });
      expect(result.verdict).toBe('uncertain');
      expect(result.method).toBe('rdns');
    });
  });

  describe('INVARIANT: no real Google IP is ever classified as spoofed', () => {
    it('verifies multiple sample IPs from each bundled file', async () => {
      const verifier = createTestVerifier({ rdns: false });

      // Pick a few v4 and v6 samples from each file
      const allPrefixes = [
        ...googlebotPrefixes.slice(0, 3),
        ...specialPrefixes.slice(0, 3),
        ...userTriggeredPrefixes.slice(0, 3),
      ];

      for (const prefix of allPrefixes) {
        const ip = firstIpInPrefix(prefix);
        const result = await verifier.verify({ userAgent: GOOGLEBOT_UA, ip });
        expect(result.verdict, `Expected verified for ${ip} (${prefix})`).toBe('verified');
      }
    });
  });

  describe('fail-open: empty range store + rdns error → uncertain (never spoofed)', () => {
    it('returns uncertain, not spoofed, when ranges are empty and rDNS errors', async () => {
      const verifier = createBotVerifier({
        initialRanges: [],
        fetchImpl: () => { throw new Error('no network'); },
        rdns: true,
        rdnsImpl: async () => 'error',
      });
      const result = await verifier.verify({ userAgent: GOOGLEBOT_UA, ip: SPOOF_IP });
      expect(result.verdict).toBe('uncertain');
      expect(result.verdict).not.toBe('spoofed');
    });
  });

  describe('logger', () => {
    it('calls the logger with the result', async () => {
      const loggedResults: unknown[] = [];
      const verifier = createTestVerifier({
        logger: (r) => loggedResults.push(r),
      });
      await verifier.verify({ userAgent: GOOGLEBOT_UA, ip: SPOOF_IP });
      expect(loggedResults).toHaveLength(1);
    });

    it('does not propagate logger errors', async () => {
      const verifier = createTestVerifier({
        logger: () => { throw new Error('logger exploded'); },
      });
      await expect(
        verifier.verify({ userAgent: GOOGLEBOT_UA, ip: SPOOF_IP }),
      ).resolves.not.toThrow();
    });
  });

  describe('refreshRanges', () => {
    it('returns false when fetch fails', async () => {
      const verifier = createTestVerifier();
      const ok = await verifier.refreshRanges();
      expect(ok).toBe(false);
    });

    it('returns true when fetch succeeds with valid data', async () => {
      const samplePayload = {
        prefixes: [
          { ipv4Prefix: '192.0.2.0/24' },
        ],
      };
      const mockFetch = vi.fn(async () => ({
        ok: true,
        json: async () => samplePayload,
      } as unknown as Response));

      const verifier = createBotVerifier({
        fetchImpl: mockFetch as typeof fetch,
        rdns: false,
      });
      const ok = await verifier.refreshRanges();
      expect(ok).toBe(true);
    });
  });

  describe('background range refresh', () => {
    const HOUR_MS = 60 * 60 * 1000;
    const STALE_MS = 25 * HOUR_MS; // past the default 24 h TTL
    const RETRY_MS = 15 * 60 * 1000;
    const NEW_RANGE_IP = '192.0.2.10';

    function createClock(): { now: () => number; advance: (ms: number) => void } {
      let t = 1_000_000;
      return {
        now: () => t,
        advance: (ms) => {
          t += ms;
        },
      };
    }

    function okResponse(payload: unknown): Response {
      return { ok: true, json: async () => payload } as unknown as Response;
    }

    function flush(): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, 0));
    }

    it('does not wait for a hanging refresh after the TTL', async () => {
      const clock = createClock();
      const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
      const verifier = createBotVerifier({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        now: clock.now,
        rdns: false,
      });
      clock.advance(STALE_MS);

      const outcome = await Promise.race([
        verifier.verify({ userAgent: GOOGLEBOT_UA, ip: googlebotIpv4 }),
        new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 1000)),
      ]);

      expect(outcome).not.toBe('timed-out');
      expect(outcome).toMatchObject({ verdict: 'verified', method: 'ip-range' });
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    it('starts exactly one refresh for 10 concurrent verifications', async () => {
      const clock = createClock();
      const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
      const verifier = createBotVerifier({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        now: clock.now,
        rdns: false,
      });
      clock.advance(STALE_MS);

      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          verifier.verify({ userAgent: GOOGLEBOT_UA, ip: googlebotIpv4 }),
        ),
      );

      expect(results.every((r) => r.verdict === 'verified')).toBe(true);
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    it.each([
      ['fetch rejects', async () => { throw new Error('down'); }],
      ['response is not ok', async () => ({ ok: false, json: async () => ({}) }) as unknown as Response],
    ])('retries a failed refresh only after rangeRetryMs (%s)', async (_label, impl) => {
      const clock = createClock();
      const fetchImpl = vi.fn(impl);
      const verifier = createBotVerifier({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        now: clock.now,
        rdns: false,
      });
      const input = { userAgent: GOOGLEBOT_UA, ip: googlebotIpv4 };
      clock.advance(STALE_MS);

      await verifier.verify(input);
      await flush();
      expect(fetchImpl).toHaveBeenCalledTimes(3);

      // Still inside the retry window: no new fetch
      clock.advance(RETRY_MS - 1000);
      await verifier.verify(input);
      await flush();
      expect(fetchImpl).toHaveBeenCalledTimes(3);

      // Past the retry window: exactly one more refresh
      clock.advance(2000);
      await Promise.all([verifier.verify(input), verifier.verify(input)]);
      await flush();
      expect(fetchImpl).toHaveBeenCalledTimes(6);
    });

    it('uses a custom rangeRetryMs', async () => {
      const clock = createClock();
      const fetchImpl = vi.fn(async () => { throw new Error('down'); });
      const verifier = createBotVerifier({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        now: clock.now,
        rangeRetryMs: 1000,
        rdns: false,
      });
      const input = { userAgent: GOOGLEBOT_UA, ip: googlebotIpv4 };
      clock.advance(STALE_MS);

      await verifier.verify(input);
      await flush();
      clock.advance(1001);
      await verifier.verify(input);
      await flush();

      expect(fetchImpl).toHaveBeenCalledTimes(6);
    });

    it('replaces the list after a successful background refresh', async () => {
      const clock = createClock();
      const fetchImpl = vi.fn(async () =>
        okResponse({ prefixes: [{ ipv4Prefix: '192.0.2.0/24' }] }),
      );
      const verifier = createBotVerifier({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        now: clock.now,
        initialRanges: [],
        rdns: false,
      });
      const input = { userAgent: GOOGLEBOT_UA, ip: NEW_RANGE_IP };

      const before = await verifier.verify(input);
      expect(before.verdict).toBe('spoofed');

      clock.advance(STALE_MS);
      // verify() runs synchronously up to the refresh trigger (rDNS is off),
      // so the background refresh is in flight when it returns its promise.
      // It is judged on the old list.
      const during = verifier.verify(input);
      // refreshRanges() joins the in-flight attempt and resolves when it ends.
      expect(await verifier.refreshRanges()).toBe(true);
      expect((await during).verdict).toBe('spoofed');
      expect(fetchImpl).toHaveBeenCalledTimes(3);

      const after = await verifier.verify(input);
      expect(after).toMatchObject({ verdict: 'verified', method: 'ip-range' });
    });

    it('passes an AbortSignal to fetchImpl', async () => {
      const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
        okResponse({ prefixes: [{ ipv4Prefix: '192.0.2.0/24' }] }),
      );
      const verifier = createBotVerifier({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        rdns: false,
      });

      await verifier.refreshRanges();

      expect(fetchImpl).toHaveBeenCalledTimes(3);
      for (const call of fetchImpl.mock.calls) {
        expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
      }
    });

    it('refreshRanges() resolves false once rangeFetchTimeoutMs passes', async () => {
      const fetchImpl = vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
          }),
      );
      const verifier = createBotVerifier({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        rangeFetchTimeoutMs: 20,
        rdns: false,
      });

      await expect(verifier.refreshRanges()).resolves.toBe(false);
    });

    it('keeps verifying against the old list after a failed refresh', async () => {
      const clock = createClock();
      const verifier = createBotVerifier({
        fetchImpl: (async () => { throw new Error('down'); }) as unknown as typeof fetch,
        now: clock.now,
        rdns: false,
      });
      clock.advance(STALE_MS);

      await verifier.verify({ userAgent: GOOGLEBOT_UA, ip: googlebotIpv4 });
      await flush();
      const result = await verifier.verify({ userAgent: GOOGLEBOT_UA, ip: googlebotIpv4 });

      expect(result.verdict).toBe('verified');
    });
  });
});
