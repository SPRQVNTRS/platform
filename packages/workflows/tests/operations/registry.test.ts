/// <reference types="vitest/globals" />
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createOperationRegistry,
  withTimeout,
  withRetry,
  withErrorBoundary,
  compose,
  defineHandler,
  type OperationRegistry,
} from '../../src/operations/registry';
import type { OperationContext, OperationResult, OperationHandler } from '../../src/types';

describe('OperationRegistry', () => {
  let registry: OperationRegistry;

  beforeEach(() => {
    registry = createOperationRegistry();
  });

  const mockHandler: OperationHandler = async () => ({
    status: 'completed',
    data: { result: 'success' },
  });

  describe('register', () => {
    it('should register a handler', () => {
      registry.register('test.operation', mockHandler);
      expect(registry.has('test.operation')).toBe(true);
    });

    it('should throw when registering duplicate handler', () => {
      registry.register('test.operation', mockHandler);
      expect(() => registry.register('test.operation', mockHandler)).toThrow(/already registered/);
    });
  });

  describe('registerMany', () => {
    it('should register multiple handlers', () => {
      registry.registerMany({
        'op1': mockHandler,
        'op2': mockHandler,
      });

      expect(registry.has('op1')).toBe(true);
      expect(registry.has('op2')).toBe(true);
    });

    it('should throw on duplicate handlers', () => {
      registry.register('op1', mockHandler);

      expect(() =>
        registry.registerMany({
          'op1': mockHandler, // Already registered
          'op2': mockHandler,
        }),
      ).toThrow(/already registered/);
    });
  });

  describe('get', () => {
    it('should return registered handler', () => {
      registry.register('test.operation', mockHandler);
      const handler = registry.get('test.operation');

      expect(handler).toBe(mockHandler);
    });

    it('should return undefined for non-existent handler', () => {
      expect(registry.get('non-existent')).toBeUndefined();
    });
  });

  describe('getOrThrow', () => {
    it('should return registered handler', () => {
      registry.register('test.operation', mockHandler);
      const handler = registry.getOrThrow('test.operation');

      expect(handler).toBe(mockHandler);
    });

    it('should throw for non-existent handler', () => {
      expect(() => registry.getOrThrow('non-existent')).toThrow(/not found/);
    });
  });

  describe('types', () => {
    it('should return all registered types', () => {
      registry.register('op1', mockHandler);
      registry.register('op2', mockHandler);

      const types = registry.types();

      expect(types.has('op1')).toBe(true);
      expect(types.has('op2')).toBe(true);
      expect(types.size).toBe(2);
    });
  });

  describe('unregister', () => {
    it('should remove registered handler', () => {
      registry.register('test.operation', mockHandler);
      const removed = registry.unregister('test.operation');

      expect(removed).toBe(true);
      expect(registry.has('test.operation')).toBe(false);
    });

    it('should return false for non-existent handler', () => {
      expect(registry.unregister('non-existent')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all handlers', () => {
      registry.register('op1', mockHandler);
      registry.register('op2', mockHandler);

      registry.clear();

      expect(registry.types().size).toBe(0);
    });
  });
});

describe('withTimeout', () => {
  const createMockContext = (): OperationContext => ({
    workflowId: 'wf-1',
    operationId: 'op-1',
    operationType: 'test',
    stageName: 'test-stage',
    attempt: 1,
    maxAttempts: 3,
    previousResults: {},
    initialContext: {},
    workflowType: 'test-workflow',
  });

  it('should return result if handler completes within timeout', async () => {
    const handler: OperationHandler = async () => ({
      status: 'completed',
      data: { value: 42 },
    });

    const wrappedHandler = withTimeout(handler, 1000);
    const result = await wrappedHandler(createMockContext());

    expect(result.status).toBe('completed');
    expect(result.data).toEqual({ value: 42 });
  });

  it('should throw if handler exceeds timeout', async () => {
    const handler: OperationHandler = async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { status: 'completed' };
    };

    const wrappedHandler = withTimeout(handler, 10); // 10ms timeout

    await expect(wrappedHandler(createMockContext())).rejects.toThrow(/timed out/);
  });
});

describe('withRetry', () => {
  const createMockContext = (): OperationContext => ({
    workflowId: 'wf-1',
    operationId: 'op-1',
    operationType: 'test',
    stageName: 'test-stage',
    attempt: 1,
    maxAttempts: 3,
    previousResults: {},
    initialContext: {},
    workflowType: 'test-workflow',
  });

  it('should return result on first success', async () => {
    const handler: OperationHandler = async () => ({
      status: 'completed',
      data: { value: 42 },
    });

    const wrappedHandler = withRetry(handler, { maxAttempts: 3, baseDelayMs: 1 });
    const result = await wrappedHandler(createMockContext());

    expect(result.status).toBe('completed');
  });

  it('should retry on failure and return success', async () => {
    let attempts = 0;
    const handler: OperationHandler = async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Transient error');
      }
      return { status: 'completed', data: { attempts } };
    };

    const wrappedHandler = withRetry(handler, { maxAttempts: 3, baseDelayMs: 1 });
    const result = await wrappedHandler(createMockContext());

    expect(result.status).toBe('completed');
    expect(result.data?.attempts).toBe(3);
  });

  it('should return failed result after all retries exhausted', async () => {
    const handler: OperationHandler = async () => {
      throw new Error('Permanent error');
    };

    const wrappedHandler = withRetry(handler, { maxAttempts: 2, baseDelayMs: 1 });
    const result = await wrappedHandler(createMockContext());

    expect(result.status).toBe('failed');
    expect(result.reason).toContain('Permanent error');
  });

  it('should respect shouldRetry predicate', async () => {
    let attempts = 0;
    const handler: OperationHandler = async () => {
      attempts++;
      throw new Error('Non-retryable');
    };

    const wrappedHandler = withRetry(handler, {
      maxAttempts: 3,
      baseDelayMs: 1,
      shouldRetry: () => false, // Never retry
    });

    const result = await wrappedHandler(createMockContext());

    expect(result.status).toBe('failed');
    expect(attempts).toBe(1); // Only one attempt
  });
});

describe('withErrorBoundary', () => {
  const createMockContext = (): OperationContext => ({
    workflowId: 'wf-1',
    operationId: 'op-1',
    operationType: 'test',
    stageName: 'test-stage',
    attempt: 1,
    maxAttempts: 3,
    previousResults: {},
    initialContext: {},
    workflowType: 'test-workflow',
  });

  it('should pass through successful result', async () => {
    const handler: OperationHandler = async () => ({
      status: 'completed',
      data: { value: 42 },
    });

    const wrappedHandler = withErrorBoundary(handler);
    const result = await wrappedHandler(createMockContext());

    expect(result.status).toBe('completed');
    expect(result.data).toEqual({ value: 42 });
  });

  it('should catch exceptions and return failed result', async () => {
    const handler: OperationHandler = async () => {
      throw new Error('Something went wrong');
    };

    const wrappedHandler = withErrorBoundary(handler);
    const result = await wrappedHandler(createMockContext());

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('Something went wrong');
  });

  it('should handle non-Error throws', async () => {
    const handler: OperationHandler = async () => {
      throw 'String error';
    };

    const wrappedHandler = withErrorBoundary(handler);
    const result = await wrappedHandler(createMockContext());

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('String error');
  });
});

describe('compose', () => {
  const createMockContext = (): OperationContext => ({
    workflowId: 'wf-1',
    operationId: 'op-1',
    operationType: 'test',
    stageName: 'test-stage',
    attempt: 1,
    maxAttempts: 3,
    previousResults: {},
    initialContext: {},
    workflowType: 'test-workflow',
  });

  it('should apply wrappers from right to left', async () => {
    const order: string[] = [];

    const handler: OperationHandler = async () => {
      order.push('handler');
      return { status: 'completed' };
    };

    const wrapper1 = (h: OperationHandler): OperationHandler => async (ctx) => {
      order.push('wrapper1-before');
      const result = await h(ctx);
      order.push('wrapper1-after');
      return result;
    };

    const wrapper2 = (h: OperationHandler): OperationHandler => async (ctx) => {
      order.push('wrapper2-before');
      const result = await h(ctx);
      order.push('wrapper2-after');
      return result;
    };

    const composedHandler = compose(handler, wrapper1, wrapper2);
    await composedHandler(createMockContext());

    // reduceRight applies from right to left: wrapper2 first, then wrapper1 wraps it
    // So wrapper1 is outermost, wrapper2 is inner
    expect(order).toEqual([
      'wrapper1-before',
      'wrapper2-before',
      'handler',
      'wrapper2-after',
      'wrapper1-after',
    ]);
  });
});

describe('defineHandler', () => {
  it('should return the same handler for type inference', () => {
    const handler = defineHandler<{ url: string }, { data: string }>(async (ctx) => {
      return {
        status: 'completed',
        data: { data: ctx.previousResults.url },
      };
    });

    expect(typeof handler).toBe('function');
  });
});
