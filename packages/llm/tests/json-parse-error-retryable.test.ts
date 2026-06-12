/**
 * Tests for LlmJsonParseError.isLikelyTruncation and its effect on
 * isRetryableError() (GitHub issue #18).
 *
 * Verifies that:
 *  - Truncated/empty responses with no clean finish_reason are classified retryable
 *  - Complete-but-malformed responses (finish_reason: 'stop') are non-retryable
 *  - Other error types' retryability is unaffected
 */

import { describe, it, expect } from 'vitest';
import {
  LlmJsonParseError,
  LlmTimeoutError,
  LlmValidationError,
  isRetryableError,
} from '../src/utils/errors';
import type { LlmErrorContext } from '../src/utils/errors';

// ── helper ───────────────────────────────────────────────────────────────────

function makeJsonParseError(
  rawContent: string,
  parseErrorMessage: string,
  finishReason: string | undefined,
): LlmJsonParseError {
  const context: LlmErrorContext = {
    clientType: 'openrouter',
    model: 'openai/gpt-4o',
    operation: 'structured-output',
    elapsedMs: 850,
    metadata: { finishReason },
  };
  const parseError = new SyntaxError(parseErrorMessage);
  return new LlmJsonParseError(context, rawContent, parseError);
}

// ── truncated fragment + Unexpected end — no finishReason ────────────────────

describe('truncated fragment, Unexpected end of JSON input, finishReason undefined', () => {
  const err = makeJsonParseError(
    '{"tags": ["a"',
    'Unexpected end of JSON input',
    undefined,
  );

  it('isLikelyTruncation is true', () => {
    expect(err.isLikelyTruncation).toBe(true);
  });

  it('isRetryableError returns true', () => {
    expect(isRetryableError(err)).toBe(true);
  });
});

// ── same truncation + finishReason 'unknown' ─────────────────────────────────

describe('truncated fragment, Unexpected end of JSON input, finishReason unknown', () => {
  const err = makeJsonParseError(
    '{"tags": ["a"',
    'Unexpected end of JSON input',
    'unknown',
  );

  it('isLikelyTruncation is true', () => {
    expect(err.isLikelyTruncation).toBe(true);
  });

  it('isRetryableError returns true', () => {
    expect(isRetryableError(err)).toBe(true);
  });
});

// ── empty string content ──────────────────────────────────────────────────────

describe('empty string content, finishReason undefined', () => {
  const err = makeJsonParseError(
    '',
    'Unexpected end of JSON input',
    undefined,
  );

  it('isLikelyTruncation is true', () => {
    expect(err.isLikelyTruncation).toBe(true);
  });

  it('isRetryableError returns true', () => {
    expect(isRetryableError(err)).toBe(true);
  });
});

// ── whitespace-only content ───────────────────────────────────────────────────

describe('whitespace-only content, finishReason undefined', () => {
  const err = makeJsonParseError(
    '   \n\t  ',
    'Unexpected token',
    undefined,
  );

  it('isLikelyTruncation is true (empty after trim)', () => {
    expect(err.isLikelyTruncation).toBe(true);
  });

  it('isRetryableError returns true', () => {
    expect(isRetryableError(err)).toBe(true);
  });
});

// ── complete-but-malformed JSON with finishReason 'stop' ─────────────────────

describe('complete-but-malformed JSON (trailing comma), finishReason stop', () => {
  const err = makeJsonParseError(
    '{"a": 1,}',
    "Unexpected token '}'",
    'stop',
  );

  it('isLikelyTruncation is false (provider claims completion)', () => {
    expect(err.isLikelyTruncation).toBe(false);
  });

  it('isRetryableError returns false', () => {
    expect(isRetryableError(err)).toBe(false);
  });
});

// ── truncated-looking parse error but finishReason 'stop' ────────────────────

describe('Unexpected end of JSON input parse error but finishReason stop', () => {
  const err = makeJsonParseError(
    '{"tags": ["a"',
    'Unexpected end of JSON input',
    'stop',
  );

  it('isLikelyTruncation is false — provider claims completion wins', () => {
    expect(err.isLikelyTruncation).toBe(false);
  });

  it('isRetryableError returns false', () => {
    expect(isRetryableError(err)).toBe(false);
  });
});

// ── malformed JSON, non-truncation message, non-empty, no finishReason ────────

describe('malformed JSON with non-truncation parse error and finishReason undefined', () => {
  const err = makeJsonParseError(
    '{"key": undefined}',
    "Unexpected token 'u'",
    undefined,
  );

  it('isLikelyTruncation is false (non-empty content, non-abrupt error)', () => {
    expect(err.isLikelyTruncation).toBe(false);
  });

  it('isRetryableError returns false', () => {
    expect(isRetryableError(err)).toBe(false);
  });
});

// ── sanity: other error types are unaffected ──────────────────────────────────

describe('sanity — LlmTimeoutError is still retryable', () => {
  const ctx: LlmErrorContext = {
    clientType: 'openrouter',
    model: 'openai/gpt-4o',
    operation: 'structured-output',
    elapsedMs: 30000,
    timeoutMs: 30000,
  };

  it('isRetryableError returns true for LlmTimeoutError', () => {
    const err = new LlmTimeoutError(ctx);
    expect(isRetryableError(err)).toBe(true);
  });
});

describe('sanity — LlmValidationError is still non-retryable', () => {
  const ctx: LlmErrorContext = {
    clientType: 'openrouter',
    model: 'openai/gpt-4o',
    operation: 'structured-output',
    elapsedMs: 200,
  };

  it('isRetryableError returns false for LlmValidationError', () => {
    const err = new LlmValidationError(ctx);
    expect(isRetryableError(err)).toBe(false);
  });
});
