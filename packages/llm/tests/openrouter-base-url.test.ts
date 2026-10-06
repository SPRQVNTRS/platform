/**
 * Tests for the OpenRouter base URL option (global host vs EU in-region host).
 *
 * Covers the resolver (order, validation, error messages) and the client wiring
 * (the OpenRouter SDK instance really receives the resolved URL as `serverURL`).
 *
 * Every rejection test sits next to an acceptance test for a near-identical input,
 * so a validator that rejects everything (or accepts everything) fails here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LLM } from '../src/llm';
import { OpenRouterClient } from '../src/clients/openrouter-client';
import {
  DEFAULT_OPENROUTER_BASE_URL,
  EU_OPENROUTER_BASE_URL,
  resolveOpenRouterBaseUrl,
} from '../src/utils/openrouter-base-url';

const GLOBAL = 'https://openrouter.ai/api/v1';
const EU = 'https://eu.openrouter.ai/api/v1';

/** The slice of the private SDK instance the tests read. */
interface SdkProbe {
  _baseURL: URL | null;
  _options: { serverURL?: string | URL };
}

function sdkOf(client: OpenRouterClient): SdkProbe {
  return (client as unknown as { client: SdkProbe }).client;
}

beforeEach(() => {
  // Start every test with no ambient setting, whatever the developer's shell holds.
  vi.stubEnv('OPENROUTER_BASE_URL', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveOpenRouterBaseUrl: resolution order', () => {
  it('returns the global default when nothing is set', () => {
    expect(resolveOpenRouterBaseUrl(undefined, {})).toBe(GLOBAL);
    expect(DEFAULT_OPENROUTER_BASE_URL).toBe(GLOBAL);
    expect(EU_OPENROUTER_BASE_URL).toBe(EU);
  });

  it('honours OPENROUTER_BASE_URL', () => {
    expect(resolveOpenRouterBaseUrl(undefined, { OPENROUTER_BASE_URL: EU })).toBe(EU);
  });

  it('reads process.env when no env object is passed', () => {
    vi.stubEnv('OPENROUTER_BASE_URL', EU);
    expect(resolveOpenRouterBaseUrl()).toBe(EU);
  });

  it('lets the explicit option beat the env var, in both directions', () => {
    expect(resolveOpenRouterBaseUrl(GLOBAL, { OPENROUTER_BASE_URL: EU })).toBe(GLOBAL);
    expect(resolveOpenRouterBaseUrl(EU, { OPENROUTER_BASE_URL: GLOBAL })).toBe(EU);
  });

  it('validates the explicit option even when the env var is valid', () => {
    expect(() => resolveOpenRouterBaseUrl('http://openrouter.ai/api/v1', { OPENROUTER_BASE_URL: EU })).toThrow(
      /protocol must be https/,
    );
  });

  it('validates the env var and names it as the source', () => {
    expect(() => resolveOpenRouterBaseUrl(undefined, { OPENROUTER_BASE_URL: 'http://openrouter.ai/api/v1' })).toThrow(
      /OPENROUTER_BASE_URL environment variable/,
    );
  });

  it('rejects an empty value instead of falling back to the global host', () => {
    expect(() => resolveOpenRouterBaseUrl('', {})).toThrow(/the value is empty/);
    expect(() => resolveOpenRouterBaseUrl(undefined, { OPENROUTER_BASE_URL: '  ' })).toThrow(/the value is empty/);
  });
});

describe('resolveOpenRouterBaseUrl: normalisation', () => {
  it('strips a trailing slash', () => {
    expect(resolveOpenRouterBaseUrl(`${GLOBAL}/`, {})).toBe(GLOBAL);
    expect(resolveOpenRouterBaseUrl(`${EU}/`, {})).toBe(EU);
  });

  it('does not strip anything from a value without a trailing slash', () => {
    expect(resolveOpenRouterBaseUrl(EU, {})).toBe(EU);
  });

  it('lowercases the host and ignores surrounding whitespace', () => {
    expect(resolveOpenRouterBaseUrl('  https://EU.OpenRouter.ai/api/v1  ', {})).toBe(EU);
  });
});

describe('resolveOpenRouterBaseUrl: rejections (fail closed)', () => {
  const cases: Array<{ name: string; value: string; message: RegExp }> = [
    { name: 'http', value: 'http://openrouter.ai/api/v1', message: /protocol must be https/ },
    {
      name: 'a lookalike host with the real name as a prefix',
      value: 'https://foo.openrouter.ai.evil.com/api/v1',
      message: /host must be openrouter\.ai or a subdomain/,
    },
    {
      name: 'a lookalike host with no dot before the name',
      value: 'https://evilopenrouter.ai/api/v1',
      message: /host must be openrouter\.ai or a subdomain/,
    },
    {
      name: 'an unrelated host',
      value: 'https://api.openai.com/api/v1',
      message: /host must be openrouter\.ai or a subdomain/,
    },
    {
      name: 'userinfo',
      value: 'https://user:hunter2@openrouter.ai/api/v1',
      message: /credentials in the URL are not allowed/,
    },
    { name: 'a port', value: 'https://openrouter.ai:8443/api/v1', message: /a port is not allowed/ },
    { name: 'a wrong path', value: 'https://openrouter.ai/api/v2', message: /path must be \/api\/v1/ },
    { name: 'a missing path', value: 'https://openrouter.ai', message: /path must be \/api\/v1/ },
    { name: 'a longer path', value: 'https://openrouter.ai/api/v1/chat', message: /path must be \/api\/v1/ },
    { name: 'a query', value: 'https://openrouter.ai/api/v1?x=1', message: /query or fragment is not allowed/ },
    { name: 'a fragment', value: 'https://openrouter.ai/api/v1#top', message: /query or fragment is not allowed/ },
    { name: 'text that is not a URL', value: 'openrouter', message: /not a valid URL/ },
  ];

  it.each(cases)('rejects $name', ({ value, message }) => {
    expect(() => resolveOpenRouterBaseUrl(value, {})).toThrow(message);
  });

  it.each(cases)('names the offending value for $name', ({ value }) => {
    // Userinfo is redacted on purpose, so compare against the host part for that case.
    const probe = value.includes('@') ? 'https://***@openrouter.ai/api/v1' : value;
    expect(() => resolveOpenRouterBaseUrl(value, {})).toThrow(JSON.stringify(probe));
  });

  it('never prints the password from userinfo', () => {
    expect(() => resolveOpenRouterBaseUrl('https://user:hunter2@openrouter.ai/api/v1', {})).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('hunter2') }),
    );
  });

  it('rejects an empty query, an empty fragment and an explicit default port', () => {
    expect(() => resolveOpenRouterBaseUrl('https://openrouter.ai/api/v1?', {})).toThrow(/must be exactly/);
    expect(() => resolveOpenRouterBaseUrl('https://openrouter.ai/api/v1#', {})).toThrow(/must be exactly/);
    expect(() => resolveOpenRouterBaseUrl('https://openrouter.ai:443/api/v1', {})).toThrow(/must be exactly/);
  });

  it('rejects two trailing slashes', () => {
    expect(() => resolveOpenRouterBaseUrl(`${GLOBAL}//`, {})).toThrow(/path must be \/api\/v1/);
  });

  it('accepts the inputs the rejection cases are one edit away from (control)', () => {
    expect(resolveOpenRouterBaseUrl('https://openrouter.ai/api/v1', {})).toBe(GLOBAL);
    expect(resolveOpenRouterBaseUrl('https://foo.openrouter.ai/api/v1', {})).toBe('https://foo.openrouter.ai/api/v1');
    expect(resolveOpenRouterBaseUrl('https://eu.openrouter.ai/api/v1/', {})).toBe(EU);
  });
});

describe('OpenRouterClient: SDK wiring', () => {
  it('passes the global default to the SDK as serverURL', () => {
    const client = new OpenRouterClient({ apiKey: 'test-key', model: 'openai/gpt-4o' });
    expect(client.baseUrl).toBe(GLOBAL);
    expect(sdkOf(client)._options.serverURL).toBe(GLOBAL);
    expect(sdkOf(client)._baseURL?.href).toBe(`${GLOBAL}/`); // the SDK keeps a URL object, which adds the slash
  });

  it('passes the EU host from the config option to the SDK', () => {
    const client = new OpenRouterClient({ apiKey: 'test-key', model: 'openai/gpt-4o', baseUrl: `${EU}/` });
    expect(client.baseUrl).toBe(EU);
    expect(sdkOf(client)._options.serverURL).toBe(EU);
    expect(sdkOf(client)._baseURL?.href).toBe(`${EU}/`);
  });

  it('passes the EU host from the env var to the SDK', () => {
    vi.stubEnv('OPENROUTER_BASE_URL', EU);
    const client = new OpenRouterClient({ apiKey: 'test-key', model: 'openai/gpt-4o' });
    expect(client.baseUrl).toBe(EU);
    expect(sdkOf(client)._options.serverURL).toBe(EU);
  });

  it('prefers the config option over the env var', () => {
    vi.stubEnv('OPENROUTER_BASE_URL', EU);
    const client = new OpenRouterClient({ apiKey: 'test-key', model: 'openai/gpt-4o', baseUrl: GLOBAL });
    expect(client.baseUrl).toBe(GLOBAL);
    expect(sdkOf(client)._options.serverURL).toBe(GLOBAL);
  });

  it('throws at construction on a bad value, and the message has no API key', () => {
    const build = () =>
      new OpenRouterClient({ apiKey: 'sk-or-v1-your-key-here', baseUrl: 'https://foo.openrouter.ai.evil.com/api/v1' });
    expect(build).toThrow(/foo\.openrouter\.ai\.evil\.com/);
    expect(build).toThrow(expect.objectContaining({ message: expect.not.stringContaining('sk-or-v1-your-key-here') }));
  });

  it('throws at construction when the env var is bad', () => {
    vi.stubEnv('OPENROUTER_BASE_URL', 'http://openrouter.ai/api/v1');
    expect(() => new OpenRouterClient({ apiKey: 'test-key' })).toThrow(/OPENROUTER_BASE_URL/);
  });

  it('sends the request to the configured host', async () => {
    const seen: string[] = [];
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      seen.push(input instanceof Request ? input.url : String(input));
      return new Response('{"error":{"message":"stop","code":500}}', {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const client = new OpenRouterClient({
        apiKey: 'test-key',
        model: 'openai/gpt-4o',
        baseUrl: EU,
        maxRetries: 0,
      });
      await client.createRawResponse('hello').catch(() => undefined);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(`${EU}/chat/completions`);
  });
});

describe('LLM.getClient: openrouter', () => {
  it('forwards baseUrl to the client', () => {
    const client = LLM.getClient('openrouter', 'openai/gpt-4o', { apiKey: 'test-key', baseUrl: EU });
    expect((client as OpenRouterClient).baseUrl).toBe(EU);
  });

  it('defaults to the global host', () => {
    const client = LLM.getClient('openrouter', 'openai/gpt-4o', { apiKey: 'test-key' });
    expect((client as OpenRouterClient).baseUrl).toBe(GLOBAL);
  });

  it('rejects a bad baseUrl', () => {
    expect(() =>
      LLM.getClient('openrouter', 'openai/gpt-4o', { apiKey: 'test-key', baseUrl: 'http://x.example' }),
    ).toThrow(/Invalid OpenRouter base URL/);
  });
});
