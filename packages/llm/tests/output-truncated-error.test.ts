import assert from 'node:assert';
import {
  LlmError,
  LlmOutputTruncatedError,
  LlmTimeoutError,
  LlmApiError,
  LlmValidationError,
  wrapSdkError,
} from '../src/utils/errors.js';
import type { LlmErrorContext } from '../src/utils/errors.js';

/**
 * Test script for LlmOutputTruncatedError
 *
 * Run with: pnpm tsx tests/output-truncated-error.test.ts
 */

function makeContext(overrides?: Partial<LlmErrorContext>): LlmErrorContext {
  return {
    clientType: 'openai',
    model: 'gpt-4o',
    elapsedMs: 5000,
    operation: 'structured-output',
    ...overrides,
  };
}

function testConstructorSetsCorrectProperties() {
  const context = makeContext({ requestId: 'req-123' });
  const error = new LlmOutputTruncatedError(context, 8192);

  assert.strictEqual(error.name, 'LlmOutputTruncatedError');
  assert.ok(error.message.includes('8192'), 'Message should include contentLength');
  assert.ok(error.message.includes('truncated'), 'Message should mention truncation');
  assert.ok(error.message.includes('finish_reason: length'), 'Message should mention finish_reason');
  assert.strictEqual(error.contentLength, 8192);
  assert.deepStrictEqual(error.context, context);
  assert.strictEqual(error.originalError, undefined);
  assert.ok(error.timestamp, 'Timestamp should be set');

  console.log('  testConstructorSetsCorrectProperties');
}

function testIsInstanceOfLlmError() {
  const context = makeContext();
  const error = new LlmOutputTruncatedError(context, 4096);

  assert.ok(error instanceof LlmError, 'Should be instanceof LlmError');
  assert.ok(error instanceof Error, 'Should be instanceof Error');

  console.log('  testIsInstanceOfLlmError');
}

function testIsInstanceOfLlmOutputTruncatedError() {
  const context = makeContext();
  const error = new LlmOutputTruncatedError(context, 4096);

  assert.ok(
    error instanceof LlmOutputTruncatedError,
    'Should be instanceof LlmOutputTruncatedError',
  );

  // Negative checks: should NOT be instanceof other error subclasses
  assert.ok(!(error instanceof LlmTimeoutError), 'Should not be instanceof LlmTimeoutError');
  assert.ok(!(error instanceof LlmApiError), 'Should not be instanceof LlmApiError');
  assert.ok(!(error instanceof LlmValidationError), 'Should not be instanceof LlmValidationError');

  console.log('  testIsInstanceOfLlmOutputTruncatedError');
}

function testGetDetailedMessageIncludesTruncationInfo() {
  const context = makeContext({
    clientType: 'anthropic',
    model: 'claude-3-opus',
    operation: 'extract-data',
    elapsedMs: 12000,
    timeoutMs: 30000,
    requestId: 'req-abc',
    metadata: { attempt: 2, maxAttempts: 3, promptSize: 5000 },
  });
  const error = new LlmOutputTruncatedError(context, 16384);

  const detailed = error.getDetailedMessage();

  assert.ok(detailed.includes('ANTHROPIC'), 'Should include uppercase client type');
  assert.ok(detailed.includes('claude-3-opus'), 'Should include model name');
  assert.ok(detailed.includes('extract-data'), 'Should include operation');
  assert.ok(detailed.includes('12000ms'), 'Should include elapsed time');
  assert.ok(detailed.includes('30000ms'), 'Should include timeout');
  assert.ok(detailed.includes('req-abc'), 'Should include request ID');
  assert.ok(detailed.includes('2/3'), 'Should include attempt info');
  assert.ok(detailed.includes('5000'), 'Should include prompt size');
  assert.ok(detailed.includes('truncated'), 'Should include truncation info from message');

  console.log('  testGetDetailedMessageIncludesTruncationInfo');
}

function testToJsonIncludesAllFields() {
  const context = makeContext({ requestId: 'req-json' });
  const error = new LlmOutputTruncatedError(context, 2048);

  const json = error.toJSON();

  assert.strictEqual(json.name, 'LlmOutputTruncatedError');
  assert.ok(json.message.includes('2048'), 'JSON message should include contentLength');
  assert.ok(json.timestamp, 'JSON should include timestamp');
  assert.deepStrictEqual(json.context, context);
  assert.strictEqual(json.originalError, undefined);
  assert.ok(json.stack, 'JSON should include stack trace');

  console.log('  testToJsonIncludesAllFields');
}

function testWrapSdkErrorDoesNotMisclassify() {
  const context = makeContext();
  const truncatedError = new LlmOutputTruncatedError(context, 10000);

  // wrapSdkError receives an LlmOutputTruncatedError (which is an Error with a message).
  // It should NOT classify it as a timeout, API, or validation error.
  const wrapContext = makeContext({ operation: 'wrap-test' });
  const wrapped = wrapSdkError(truncatedError, wrapContext);

  // Should be a generic LlmError, not a timeout/API/validation error
  assert.ok(!(wrapped instanceof LlmTimeoutError), 'Should not be wrapped as LlmTimeoutError');
  assert.ok(!(wrapped instanceof LlmApiError), 'Should not be wrapped as LlmApiError');
  assert.ok(!(wrapped instanceof LlmValidationError), 'Should not be wrapped as LlmValidationError');
  assert.ok(wrapped instanceof LlmError, 'Should be wrapped as LlmError');

  // The wrapped error should carry the original LlmOutputTruncatedError
  assert.strictEqual(wrapped.originalError, truncatedError);
  assert.strictEqual(wrapped.message, truncatedError.message);

  console.log('  testWrapSdkErrorDoesNotMisclassify');
}

function testContentLengthStoredCorrectly() {
  const context = makeContext();

  // Zero length
  const errorZero = new LlmOutputTruncatedError(context, 0);
  assert.strictEqual(errorZero.contentLength, 0);
  assert.ok(errorZero.message.includes('0-char'), 'Message should include 0-char');

  // Small length
  const errorSmall = new LlmOutputTruncatedError(context, 42);
  assert.strictEqual(errorSmall.contentLength, 42);
  assert.ok(errorSmall.message.includes('42-char'), 'Message should include 42-char');

  // Large length
  const errorLarge = new LlmOutputTruncatedError(context, 102400);
  assert.strictEqual(errorLarge.contentLength, 102400);
  assert.ok(errorLarge.message.includes('102400-char'), 'Message should include 102400-char');

  console.log('  testContentLengthStoredCorrectly');
}

async function main() {
  console.log('=== Testing LlmOutputTruncatedError ===\n');

  const tests = [
    testConstructorSetsCorrectProperties,
    testIsInstanceOfLlmError,
    testIsInstanceOfLlmOutputTruncatedError,
    testGetDetailedMessageIncludesTruncationInfo,
    testToJsonIncludesAllFields,
    testWrapSdkErrorDoesNotMisclassify,
    testContentLengthStoredCorrectly,
  ];

  let passed = 0;
  let failed = 0;
  const failures: Array<{ name: string; error: Error }> = [];

  for (const test of tests) {
    try {
      test();
      passed++;
    } catch (error) {
      failed++;
      failures.push({ name: test.name, error: error as Error });
      console.error(`  FAIL ${test.name}: ${(error as Error).message}`);
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  if (failures.length > 0) {
    console.error('\nFailures:');
    for (const { name, error } of failures) {
      console.error(`  ${name}:`, error);
    }
    process.exit(1);
  }
}

main();
