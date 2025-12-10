/// <reference types="vitest/globals" />
import { describe, it, expect } from 'vitest';
import {
  createMockContext,
  createSuccessResult,
  createFailureResult,
  createMockWorkflow,
  createMockOperation,
  testHandler,
  createMockHandler,
  createSpyHandler,
  createThrowingHandler,
  createMockTemplate,
  assertSuccess,
  assertFailure,
} from '../../src/testing/index';
import type { OperationContext } from '../../src/types';

describe('createMockContext', () => {
  it('should create context with default values', () => {
    const context = createMockContext();

    expect(context.workflowId).toBe('test-workflow-id');
    expect(context.operationId).toBe('test-operation-id');
    expect(context.operationType).toBe('test.operation');
    expect(context.stageName).toBe('test-stage');
    expect(context.attempt).toBe(1);
    expect(context.maxAttempts).toBe(3);
    expect(context.previousResults).toEqual({});
    expect(context.initialContext).toEqual({});
    expect(context.workflowType).toBe('test-workflow');
  });

  it('should allow overriding all values', () => {
    const context = createMockContext({
      workflowId: 'custom-workflow',
      operationId: 'custom-operation',
      operationType: 'custom.type',
      stageName: 'custom-stage',
      attempt: 2,
      maxAttempts: 5,
      previousResults: { foo: 'bar' },
      initialContext: { init: true },
      workflowType: 'custom-workflow-type',
    });

    expect(context.workflowId).toBe('custom-workflow');
    expect(context.operationId).toBe('custom-operation');
    expect(context.operationType).toBe('custom.type');
    expect(context.stageName).toBe('custom-stage');
    expect(context.attempt).toBe(2);
    expect(context.maxAttempts).toBe(5);
    expect(context.previousResults).toEqual({ foo: 'bar' });
    expect(context.initialContext).toEqual({ init: true });
    expect(context.workflowType).toBe('custom-workflow-type');
  });

  it('should support typed previous results', () => {
    interface MyContext {
      url: string;
      count: number;
    }

    const context = createMockContext<MyContext>({
      previousResults: { url: 'https://example.com', count: 42 },
    });

    expect(context.previousResults.url).toBe('https://example.com');
    expect(context.previousResults.count).toBe(42);
  });

  it('should support abort signal', () => {
    const controller = new AbortController();
    const context = createMockContext({
      signal: controller.signal,
    });

    expect(context.signal).toBe(controller.signal);
    expect(context.signal?.aborted).toBe(false);

    controller.abort();
    expect(context.signal?.aborted).toBe(true);
  });
});

describe('createSuccessResult', () => {
  it('should create completed result without data', () => {
    const result = createSuccessResult();

    expect(result.status).toBe('completed');
    expect(result.data).toBeUndefined();
  });

  it('should create completed result with data', () => {
    const result = createSuccessResult({ value: 42 });

    expect(result.status).toBe('completed');
    expect(result.data).toEqual({ value: 42 });
  });

  it('should support typed data', () => {
    interface MyData {
      items: string[];
      count: number;
    }

    const result = createSuccessResult<MyData>({
      items: ['a', 'b'],
      count: 2,
    });

    expect(result.data?.items).toEqual(['a', 'b']);
    expect(result.data?.count).toBe(2);
  });
});

describe('createFailureResult', () => {
  it('should create failed result with reason', () => {
    const result = createFailureResult('Something went wrong');

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('Something went wrong');
  });
});

describe('createMockWorkflow', () => {
  it('should create workflow with default values', () => {
    const workflow = createMockWorkflow();

    expect(workflow.id).toBe('test-workflow-id');
    expect(workflow.type).toBe('test-workflow');
    expect(workflow.status).toBe('pending');
    expect(workflow.context).toEqual({});
    expect(workflow.currentStage).toBeNull();
    expect(workflow.checkpointStatus).toBeNull();
    expect(workflow.errorMessage).toBeNull();
    expect(workflow.templateVersion).toBe('1.0.0');
    expect(workflow.createdAt).toBeInstanceOf(Date);
    expect(workflow.startedAt).toBeNull();
    expect(workflow.completedAt).toBeNull();
  });

  it('should allow overriding all values', () => {
    const now = new Date();
    const workflow = createMockWorkflow({
      id: 'custom-id',
      type: 'custom-type',
      status: 'active',
      context: { key: 'value' },
      currentStage: 'processing',
      checkpointStatus: 'waiting',
      errorMessage: 'Error occurred',
      templateVersion: '2.0.0',
      createdAt: now,
      startedAt: now,
      completedAt: now,
    });

    expect(workflow.id).toBe('custom-id');
    expect(workflow.type).toBe('custom-type');
    expect(workflow.status).toBe('active');
    expect(workflow.context).toEqual({ key: 'value' });
    expect(workflow.currentStage).toBe('processing');
    expect(workflow.checkpointStatus).toBe('waiting');
    expect(workflow.errorMessage).toBe('Error occurred');
    expect(workflow.templateVersion).toBe('2.0.0');
    expect(workflow.createdAt).toBe(now);
    expect(workflow.startedAt).toBe(now);
    expect(workflow.completedAt).toBe(now);
  });
});

describe('createMockOperation', () => {
  it('should create operation with default values', () => {
    const operation = createMockOperation();

    expect(operation.id).toBe('test-operation-id');
    expect(operation.workflowId).toBe('test-workflow-id');
    expect(operation.type).toBe('test.operation');
    expect(operation.stage).toBe('test-stage');
    expect(operation.status).toBe('pending');
    expect(operation.result).toBeNull();
    expect(operation.errorMessage).toBeNull();
    expect(operation.attempts).toBe(0);
    expect(operation.maxAttempts).toBe(3);
    expect(operation.createdAt).toBeInstanceOf(Date);
    expect(operation.startedAt).toBeNull();
    expect(operation.completedAt).toBeNull();
  });

  it('should allow overriding all values', () => {
    const now = new Date();
    const operation = createMockOperation({
      id: 'custom-op-id',
      workflowId: 'custom-workflow-id',
      type: 'custom.operation',
      stage: 'custom-stage',
      status: 'completed',
      result: { data: 'test' },
      errorMessage: 'Custom error',
      attempts: 2,
      maxAttempts: 5,
      createdAt: now,
      startedAt: now,
      completedAt: now,
    });

    expect(operation.id).toBe('custom-op-id');
    expect(operation.workflowId).toBe('custom-workflow-id');
    expect(operation.type).toBe('custom.operation');
    expect(operation.stage).toBe('custom-stage');
    expect(operation.status).toBe('completed');
    expect(operation.result).toEqual({ data: 'test' });
    expect(operation.errorMessage).toBe('Custom error');
    expect(operation.attempts).toBe(2);
    expect(operation.maxAttempts).toBe(5);
    expect(operation.createdAt).toBe(now);
    expect(operation.startedAt).toBe(now);
    expect(operation.completedAt).toBe(now);
  });
});

describe('testHandler', () => {
  it('should run handler with mock context', async () => {
    const handler = async () => createSuccessResult({ value: 'test' });

    const result = await testHandler(handler);

    expect(result.status).toBe('completed');
    expect(result.data).toEqual({ value: 'test' });
  });

  it('should pass context options to handler', async () => {
    let capturedContext: OperationContext | null = null;
    const handler = async (ctx: OperationContext) => {
      capturedContext = ctx;
      return createSuccessResult();
    };

    await testHandler(handler, {
      workflowId: 'custom-workflow',
      operationType: 'custom.operation',
    });

    expect(capturedContext?.workflowId).toBe('custom-workflow');
    expect(capturedContext?.operationType).toBe('custom.operation');
  });
});

describe('createMockHandler', () => {
  it('should return the provided result', async () => {
    const expectedResult = createSuccessResult({ value: 42 });
    const handler = createMockHandler(expectedResult);

    const result = await handler(createMockContext());

    expect(result).toBe(expectedResult);
  });

  it('should ignore context', async () => {
    const handler = createMockHandler(createSuccessResult());

    const result1 = await handler(createMockContext({ workflowId: 'wf1' }));
    const result2 = await handler(createMockContext({ workflowId: 'wf2' }));

    expect(result1.status).toBe('completed');
    expect(result2.status).toBe('completed');
  });
});

describe('createSpyHandler', () => {
  it('should call spy with context', async () => {
    const calls: OperationContext[] = [];
    const handler = createSpyHandler((ctx) => calls.push(ctx), createSuccessResult());

    const context = createMockContext({ workflowId: 'spy-test' });
    await handler(context);

    expect(calls.length).toBe(1);
    expect(calls[0]?.workflowId).toBe('spy-test');
  });

  it('should return provided result', async () => {
    const expectedResult = createSuccessResult({ spied: true });
    const handler = createSpyHandler(() => {}, expectedResult);

    const result = await handler(createMockContext());

    expect(result).toBe(expectedResult);
  });
});

describe('createThrowingHandler', () => {
  it('should throw the provided error', async () => {
    const error = new Error('Test error');
    const handler = createThrowingHandler(error);

    await expect(handler(createMockContext())).rejects.toThrow('Test error');
  });

  it('should throw specific error instance', async () => {
    const error = new Error('Specific error');
    const handler = createThrowingHandler(error);

    await expect(handler(createMockContext())).rejects.toBe(error);
  });
});

describe('createMockTemplate', () => {
  it('should create template with default values', () => {
    const template = createMockTemplate();

    expect(template.type).toBe('test-workflow');
    expect(template.queue).toBe('test-queue');
    expect(template.version).toBe('1.0.0');
    expect(template.description).toBe('Test workflow');
    expect(template.stages).toHaveLength(1);
    expect(template.stages[0]?.name).toBe('test-stage');
    expect(template.stages[0]?.operations).toHaveLength(1);
    expect(template.stages[0]?.operations[0]?.type).toBe('test.operation');
  });

  it('should allow overriding all values', () => {
    const template = createMockTemplate({
      type: 'custom-workflow',
      queue: 'custom-queue',
      version: '2.0.0',
      description: 'Custom description',
      stages: [
        {
          name: 'custom-stage',
          operations: [{ type: 'custom.op1' }, { type: 'custom.op2' }],
        },
      ],
      checkpoints: [{ after: 'custom-stage', status: 'ready' }],
      nextWorkflow: 'next-workflow',
      coordination: { entityType: 'user', lockTimeout: 60 },
      queueConfig: { retryLimit: 5 },
      estimatedDurationSeconds: 300,
    });

    expect(template.type).toBe('custom-workflow');
    expect(template.queue).toBe('custom-queue');
    expect(template.version).toBe('2.0.0');
    expect(template.description).toBe('Custom description');
    expect(template.stages).toHaveLength(1);
    expect(template.stages[0]?.operations).toHaveLength(2);
    expect(template.checkpoints).toHaveLength(1);
    expect(template.nextWorkflow).toBe('next-workflow');
    expect(template.coordination?.entityType).toBe('user');
    expect(template.queueConfig?.retryLimit).toBe(5);
    expect(template.estimatedDurationSeconds).toBe(300);
  });
});

describe('assertSuccess', () => {
  it('should not throw for successful result', () => {
    const result = createSuccessResult({ value: 42 });

    expect(() => assertSuccess(result)).not.toThrow();
  });

  it('should throw for failed result', () => {
    const result = createFailureResult('Something failed');

    expect(() => assertSuccess(result)).toThrow('Expected success but got failure: Something failed');
  });

  it('should narrow type after assertion', () => {
    const result = createSuccessResult({ value: 42 });
    assertSuccess(result);

    // After assertion, TypeScript should know status is 'completed'
    expect(result.status).toBe('completed');
    expect(result.data?.value).toBe(42);
  });
});

describe('assertFailure', () => {
  it('should not throw for failed result', () => {
    const result = createFailureResult('Expected failure');

    expect(() => assertFailure(result)).not.toThrow();
  });

  it('should throw for successful result', () => {
    const result = createSuccessResult();

    expect(() => assertFailure(result)).toThrow('Expected failure but got success');
  });

  it('should narrow type after assertion', () => {
    const result = createFailureResult('Test failure');
    assertFailure(result);

    // After assertion, TypeScript should know status is 'failed'
    expect(result.status).toBe('failed');
    expect(result.reason).toBe('Test failure');
  });
});
