/**
 * Tests for LlmApiError provider-message enrichment (GitHub issue #16).
 *
 * Verifies that:
 *  - wrapSdkError surfaces the provider's human-readable reason in LlmApiError
 *  - backward-compat: LlmApiError(context, 500) still works without details
 *  - extractProviderError is defensive against non-object / malformed input
 */

import { describe, it, expect } from 'vitest';
import {
  LlmApiError,
  LlmError,
  extractProviderError,
  wrapSdkError,
} from '../src/utils/errors';
import type { LlmErrorContext } from '../src/utils/errors';

// ── helpers ──────────────────────────────────────────────────────────────────

const ctx: LlmErrorContext = {
  clientType: 'openrouter',
  model: 'openai/gpt-4o',
  elapsedMs: 120,
  operation: 'chat',
};

// ── wrapSdkError — OpenRouter 403 with body JSON string ──────────────────────

describe('wrapSdkError — OpenRouter-style 403 (body is JSON string)', () => {
  const sdkError = {
    status: 403,
    body: JSON.stringify({
      error: { message: 'Key limit exceeded (monthly limit)', code: 403 },
    }),
  };

  it('wraps to LlmApiError', () => {
    const wrapped = wrapSdkError(sdkError, ctx);
    expect(wrapped).toBeInstanceOf(LlmApiError);
  });

  it('is also instanceof LlmError', () => {
    const wrapped = wrapSdkError(sdkError, ctx);
    expect(wrapped).toBeInstanceOf(LlmError);
  });

  it('includes providerMessage in .message', () => {
    const wrapped = wrapSdkError(sdkError, ctx) as LlmApiError;
    expect(wrapped.message).toContain('Key limit exceeded (monthly limit)');
  });

  it('includes status code in .message', () => {
    const wrapped = wrapSdkError(sdkError, ctx) as LlmApiError;
    expect(wrapped.message).toContain('403');
  });

  it('sets .providerMessage', () => {
    const wrapped = wrapSdkError(sdkError, ctx) as LlmApiError;
    expect(wrapped.providerMessage).toBe('Key limit exceeded (monthly limit)');
  });

  it('sets .providerCode to 403', () => {
    const wrapped = wrapSdkError(sdkError, ctx) as LlmApiError;
    expect(wrapped.providerCode).toBe(403);
  });

  it('preserves the raw body string', () => {
    const wrapped = wrapSdkError(sdkError, ctx) as LlmApiError;
    expect(wrapped.body).toBe(sdkError.body);
  });

  it('sets .statusCode', () => {
    const wrapped = wrapSdkError(sdkError, ctx) as LlmApiError;
    expect(wrapped.statusCode).toBe(403);
  });
});

// ── wrapSdkError — OpenRouter typed-subclass style (error field on the object) ─

describe('wrapSdkError — typed-subclass style (error field on error object)', () => {
  const sdkError = {
    statusCode: 403,
    error: { message: 'Key limit exceeded (monthly limit)', code: 403 },
    body: JSON.stringify({
      error: { message: 'Key limit exceeded (monthly limit)', code: 403 },
    }),
  };

  it('wraps to LlmApiError', () => {
    expect(wrapSdkError(sdkError, ctx)).toBeInstanceOf(LlmApiError);
  });

  it('sets .providerMessage from error.message (priority 1)', () => {
    const wrapped = wrapSdkError(sdkError, ctx) as LlmApiError;
    expect(wrapped.providerMessage).toBe('Key limit exceeded (monthly limit)');
  });

  it('sets .providerCode from error.code', () => {
    const wrapped = wrapSdkError(sdkError, ctx) as LlmApiError;
    expect(wrapped.providerCode).toBe(403);
  });
});

// ── wrapSdkError — error with statusCode but no extractable provider message ──

describe('wrapSdkError — statusCode only, no provider message', () => {
  const sdkError = {
    status: 500,
    body: 'Internal Server Error',
  };

  it('wraps cleanly without throwing', () => {
    expect(() => wrapSdkError(sdkError, ctx)).not.toThrow();
  });

  it('message stays "API error (status 500)"', () => {
    const wrapped = wrapSdkError(sdkError, ctx) as LlmApiError;
    expect(wrapped.message).toBe('API error (status 500)');
  });

  it('providerMessage is undefined', () => {
    const wrapped = wrapSdkError(sdkError, ctx) as LlmApiError;
    expect((wrapped as LlmApiError).providerMessage).toBeUndefined();
  });
});

// ── LlmApiError backward compatibility ───────────────────────────────────────

describe('LlmApiError — backward compatibility (no details)', () => {
  it('new LlmApiError(ctx, 500) produces "API error (status 500)"', () => {
    const err = new LlmApiError(ctx, 500);
    expect(err.message).toBe('API error (status 500)');
  });

  it('providerMessage is undefined when no details passed', () => {
    const err = new LlmApiError(ctx, 500);
    expect(err.providerMessage).toBeUndefined();
  });

  it('no-status variant produces "API error"', () => {
    const err = new LlmApiError(ctx);
    expect(err.message).toBe('API error');
  });
});

// ── extractProviderError — non-object inputs return {} ───────────────────────

describe('extractProviderError — non-object inputs', () => {
  it('returns {} for null', () => {
    expect(extractProviderError(null)).toEqual({});
  });

  it('returns {} for a string', () => {
    expect(extractProviderError('some error string')).toEqual({});
  });

  it('returns {} for a number', () => {
    expect(extractProviderError(42)).toEqual({});
  });

  it('returns {} for undefined', () => {
    expect(extractProviderError(undefined)).toEqual({});
  });
});

// ── extractProviderError — axios-style error ──────────────────────────────────

describe('extractProviderError — axios-style (response.data.error)', () => {
  const axiosError = {
    response: {
      data: {
        error: { message: 'Unauthorized', code: 401 },
      },
    },
  };

  it('extracts providerMessage from response.data.error.message', () => {
    const result = extractProviderError(axiosError);
    expect(result.providerMessage).toBe('Unauthorized');
  });

  it('extracts providerCode from response.data.error.code', () => {
    const result = extractProviderError(axiosError);
    expect(result.providerCode).toBe(401);
  });
});

// ── extractProviderError — body object (already parsed) ──────────────────────

describe('extractProviderError — body already an object', () => {
  const errWithObjectBody = {
    status: 400,
    body: {
      error: { message: 'Bad request from body object', code: 400 },
    },
  };

  it('extracts providerMessage from body.error.message', () => {
    const result = extractProviderError(errWithObjectBody);
    expect(result.providerMessage).toBe('Bad request from body object');
  });
});

// ── extractProviderError — malformed JSON body does not throw ─────────────────

describe('extractProviderError — malformed JSON body', () => {
  it('swallows JSON.parse errors and returns {}', () => {
    const err = { status: 500, body: '{ not valid json' };
    expect(() => extractProviderError(err)).not.toThrow();
    const result = extractProviderError(err);
    expect(result.providerMessage).toBeUndefined();
  });
});
