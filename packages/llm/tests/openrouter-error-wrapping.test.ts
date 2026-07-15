/**
 * Tests for non-streaming OpenRouter error wrapping (GitHub issue #19).
 *
 * Verifies that createResponse / createRawResponse route SDK errors through
 * wrapSdkError so callers get enriched LlmError subclasses (with status/provider
 * metadata and error context) instead of the bare SDK error, and that transient
 * provider errors are correctly classified retryable by isRetryableError.
 *
 * The private OpenRouter SDK instance is replaced with a fake whose `chat.send`
 * rejects with synthetic error shapes (mirrors the shapes used in
 * api-error-provider-message.test.ts).
 */

import { describe, it, expect } from 'vitest';
import { OpenRouterClient } from '../src/clients/openrouter-client';
import { LlmApiError, LlmError, isRetryableError } from '../src/utils/errors';
import type { LlmErrorContext } from '../src/utils/errors';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Minimal shape of the private SDK instance the client calls into. */
interface FakeSdkClient {
  chat: { send: (args: unknown) => Promise<unknown> };
}

function makeClient(model = 'openai/gpt-4o'): OpenRouterClient {
  return new OpenRouterClient({ apiKey: 'test-key', model });
}

/** Replaces the private SDK instance so `chat.send` rejects with `error`. */
function stubSendRejects(client: OpenRouterClient, error: unknown): void {
  (client as unknown as { client: FakeSdkClient }).client = {
    chat: { send: () => Promise.reject(error) },
  };
}

async function captureError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to throw, but it resolved');
}

// ── SDK 502 + provider body → LlmApiError (retryable) ────────────────────────

describe('createRawResponse — SDK 502 with provider error body', () => {
  const sdkError = {
    status: 502,
    body: JSON.stringify({
      error: { message: 'Provider returned error', code: 502 },
    }),
  };

  it('wraps to LlmApiError with enriched status/provider metadata and context', async () => {
    const client = makeClient('openai/gpt-4o');
    stubSendRejects(client, sdkError);

    const err = await captureError(() => client.createRawResponse('hello'));

    expect(err).toBeInstanceOf(LlmApiError);
    const apiErr = err as LlmApiError;
    expect(apiErr.statusCode).toBe(502);
    expect(apiErr.providerMessage).toBe('Provider returned error');
    expect(apiErr.context.clientType).toBe('openrouter');
    expect(apiErr.context.model).toBe('openai/gpt-4o');
    expect(apiErr.context.operation).toBe('createRawResponse');
    expect(isRetryableError(err)).toBe(true);
  });
});

// ── plain Error, no status → wrapped generic LlmError (retryable) ────────────

describe('createResponse — plain Error with no status', () => {
  it('wraps to a generic LlmError (not the bare error) with context populated', async () => {
    const client = makeClient('openai/gpt-4o');
    stubSendRejects(client, new Error('Provider returned error'));

    const err = await captureError(() => client.createResponse('hello'));

    expect(err).toBeInstanceOf(LlmError);
    expect(err).not.toBeInstanceOf(LlmApiError);
    const llmErr = err as LlmError;
    expect(llmErr.message).toContain('Provider returned error');
    expect(llmErr.context.clientType).toBe('openrouter');
    expect(llmErr.context.operation).toBe('createRawResponse');
    expect(isRetryableError(err)).toBe(true);
  });
});

// ── SDK 400 → LlmApiError, non-retryable ─────────────────────────────────────

describe('createRawResponse — SDK 400 client error', () => {
  it('wraps to LlmApiError and isRetryableError is false', async () => {
    const client = makeClient('openai/gpt-4o');
    stubSendRejects(client, {
      status: 400,
      body: JSON.stringify({ error: { message: 'Bad request', code: 400 } }),
    });

    const err = await captureError(() => client.createRawResponse('hello'));

    expect(err).toBeInstanceOf(LlmApiError);
    expect((err as LlmApiError).statusCode).toBe(400);
    expect(isRetryableError(err)).toBe(false);
  });
});

// ── already-wrapped LlmError passes through unchanged ────────────────────────

describe('createRawResponse — already-wrapped LlmError', () => {
  it('rethrows the same instance without double-wrapping', async () => {
    const preContext: LlmErrorContext = {
      clientType: 'openrouter',
      model: 'openai/gpt-4o',
      elapsedMs: 5,
      operation: 'preexisting',
    };
    const preWrapped = new LlmApiError(preContext, 503);

    const client = makeClient('openai/gpt-4o');
    stubSendRejects(client, preWrapped);

    const err = await captureError(() => client.createRawResponse('hello'));

    expect(err).toBe(preWrapped);
    expect((err as LlmApiError).context.operation).toBe('preexisting');
  });
});
