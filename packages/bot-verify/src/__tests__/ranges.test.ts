import { describe, it, expect, vi } from 'vitest';
import { RangeStore, GOOGLE_RANGE_URLS } from '../ranges.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000;
const TTL_MS = 24 * HOUR_MS;
const RETRY_MS = 15 * 60 * 1000;

function okResponse(payload: unknown): Response {
  return { ok: true, json: async () => payload } as unknown as Response;
}

function payloadFor(cidr: string): unknown {
  return { prefixes: [{ ipv4Prefix: cidr }] };
}

/** A mutable clock the tests can advance. */
function createClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
  };
}

/** Yields to the macrotask queue so settled promises run their callbacks. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('RangeStore.refresh', () => {
  it('passes one shared AbortSignal in the init argument of all three fetches', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      okResponse(payloadFor('192.0.2.0/24')),
    );
    const store = new RangeStore({ initialRanges: [] });

    await store.refresh(fetchImpl as unknown as typeof fetch);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([...GOOGLE_RANGE_URLS]);
    const signals = fetchImpl.mock.calls.map((c) => c[1]?.signal);
    for (const signal of signals) {
      expect(signal).toBeInstanceOf(AbortSignal);
    }
    expect(new Set(signals).size).toBe(1);
  });

  it('replaces the list when all three fetches succeed', async () => {
    const store = new RangeStore({ initialRanges: ['10.0.0.0/8'] });
    const fetchImpl = vi.fn(async () => okResponse(payloadFor('192.0.2.0/24')));

    const ok = await store.refresh(fetchImpl as unknown as typeof fetch);

    expect(ok).toBe(true);
    expect(store.contains('192.0.2.10')).toBe(true);
    expect(store.contains('10.1.1.1')).toBe(false);
  });

  it('keeps the last-good list when one response is not ok', async () => {
    const store = new RangeStore({ initialRanges: ['10.0.0.0/8'] });
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return call === 2
        ? ({ ok: false, json: async () => ({}) } as unknown as Response)
        : okResponse(payloadFor('192.0.2.0/24'));
    });

    const ok = await store.refresh(fetchImpl as unknown as typeof fetch);

    expect(ok).toBe(false);
    expect(store.contains('10.1.1.1')).toBe(true);
    expect(store.contains('192.0.2.10')).toBe(false);
  });

  it('keeps the last-good list when a payload has no prefixes', async () => {
    const store = new RangeStore({ initialRanges: ['10.0.0.0/8'] });
    const fetchImpl = vi.fn(async () => okResponse({ prefixes: [] }));

    const ok = await store.refresh(fetchImpl as unknown as typeof fetch);

    expect(ok).toBe(false);
    expect(store.contains('10.1.1.1')).toBe(true);
  });

  it('never throws when fetchImpl throws synchronously', async () => {
    const store = new RangeStore({ initialRanges: ['10.0.0.0/8'] });
    const fetchImpl = (): Promise<Response> => {
      throw new Error('boom');
    };

    await expect(store.refresh(fetchImpl as unknown as typeof fetch)).resolves.toBe(false);
    expect(store.contains('10.1.1.1')).toBe(true);
  });

  it('is single-flight: concurrent calls share one attempt', async () => {
    const store = new RangeStore({ initialRanges: [] });
    const fetchImpl = vi.fn(async () => okResponse(payloadFor('192.0.2.0/24')));

    const results = await Promise.all([
      store.refresh(fetchImpl as unknown as typeof fetch),
      store.refresh(fetchImpl as unknown as typeof fetch),
      store.refresh(fetchImpl as unknown as typeof fetch),
    ]);

    expect(results).toEqual([true, true, true]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('starts a new attempt once the previous one has settled', async () => {
    const store = new RangeStore({ initialRanges: [] });
    const fetchImpl = vi.fn(async () => okResponse(payloadFor('192.0.2.0/24')));

    await store.refresh(fetchImpl as unknown as typeof fetch);
    await flush();
    await store.refresh(fetchImpl as unknown as typeof fetch);

    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it('records lastAttemptAt at the start of an attempt, even a failed one', async () => {
    const clock = createClock();
    const store = new RangeStore({ initialRanges: [], now: clock.now });
    expect(store.lastAttemptAt).toBeNull();

    clock.advance(5_000);
    const startedAt = clock.now();
    const failing = vi.fn(async () => {
      throw new Error('down');
    });
    await store.refresh(failing as unknown as typeof fetch);

    expect(store.lastAttemptAt).toBe(startedAt);
    expect(store.lastRefreshedAt).not.toBe(startedAt);
  });

  it('resolves false after the timeout when fetchImpl honours the signal', async () => {
    const store = new RangeStore({ initialRanges: ['10.0.0.0/8'] });
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
        }),
    );

    const ok = await store.refresh(fetchImpl as unknown as typeof fetch, { timeoutMs: 20 });

    expect(ok).toBe(false);
    expect(store.contains('10.1.1.1')).toBe(true);
  });

  it('resolves false after the timeout even when fetchImpl ignores the signal', async () => {
    const store = new RangeStore({ initialRanges: ['10.0.0.0/8'] });
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));

    const ok = await store.refresh(fetchImpl as unknown as typeof fetch, { timeoutMs: 20 });

    expect(ok).toBe(false);
    // The in-flight slot is released, so a later attempt really starts.
    await flush();
    const second = store.refresh(fetchImpl as unknown as typeof fetch, { timeoutMs: 20 });
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    await expect(second).resolves.toBe(false);
  });
});

describe('RangeStore.isRefreshDue', () => {
  it('is false while the list is younger than the TTL', () => {
    const clock = createClock();
    const store = new RangeStore({ initialRanges: [], now: clock.now });

    clock.advance(TTL_MS);

    expect(store.isRefreshDue(TTL_MS, RETRY_MS)).toBe(false);
  });

  it('is true past the TTL before any attempt, whatever the retry window', () => {
    const clock = createClock();
    const store = new RangeStore({ initialRanges: [], now: clock.now });

    clock.advance(TTL_MS + 1);

    expect(store.isRefreshDue(TTL_MS, RETRY_MS)).toBe(true);
  });

  it('is false while a refresh is in flight', () => {
    const clock = createClock();
    const store = new RangeStore({ initialRanges: [], now: clock.now });
    clock.advance(TTL_MS + 1);

    void store.refresh((() => new Promise<Response>(() => {})) as unknown as typeof fetch, {
      timeoutMs: 20,
    });

    expect(store.isRefreshDue(TTL_MS, RETRY_MS)).toBe(false);
  });

  it('is false within the retry window after a failed attempt and true after it', async () => {
    const clock = createClock();
    const store = new RangeStore({ initialRanges: [], now: clock.now });
    clock.advance(TTL_MS + 1);

    await store.refresh((async () => {
      throw new Error('down');
    }) as unknown as typeof fetch);
    await flush();

    clock.advance(RETRY_MS - 1);
    expect(store.isRefreshDue(TTL_MS, RETRY_MS)).toBe(false);

    clock.advance(2);
    expect(store.isRefreshDue(TTL_MS, RETRY_MS)).toBe(true);
  });
});
