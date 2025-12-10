/**
 * Testing utilities for workflows.
 *
 * This module provides utilities for testing workflow templates and operations
 * in isolation, without requiring a full database or pg-boss setup.
 *
 * @example
 * ```typescript
 * import { createMockOrchestrator, createMockContext } from '@sprqvntrs/workflows/testing';
 *
 * // Test an operation handler
 * const context = createMockContext({
 *   workflowId: 'test-workflow',
 *   operationType: 'gather.data',
 *   previousResults: { url: 'https://example.com' },
 * });
 *
 * const result = await myHandler(context);
 * expect(result.status).toBe('completed');
 * ```
 */

import type {
  OperationContext,
  OperationResult,
  WorkflowTemplate,
  OperationHandler,
  WorkflowContext,
  WorkflowRecord,
  OperationRecord,
  WorkflowStatus,
  OperationStatus,
} from '../types';

// =============================================================================
// Mock Context
// =============================================================================

/**
 * Options for creating a mock operation context.
 */
export interface MockContextOptions {
  /**
   * Workflow ID.
   * @default 'test-workflow-id'
   */
  workflowId?: string;

  /**
   * Operation ID.
   * @default 'test-operation-id'
   */
  operationId?: string;

  /**
   * Operation type.
   * @default 'test.operation'
   */
  operationType?: string;

  /**
   * Stage name.
   * @default 'test-stage'
   */
  stageName?: string;

  /**
   * Current attempt number.
   * @default 1
   */
  attempt?: number;

  /**
   * Maximum attempts.
   * @default 3
   */
  maxAttempts?: number;

  /**
   * Previous operation results.
   * @default {}
   */
  previousResults?: Record<string, unknown>;

  /**
   * Initial workflow context.
   * @default {}
   */
  initialContext?: Record<string, unknown>;

  /**
   * Workflow type.
   * @default 'test-workflow'
   */
  workflowType?: string;

  /**
   * Abort signal for cancellation testing.
   */
  signal?: AbortSignal;
}

/**
 * Creates a mock operation context for testing handlers.
 *
 * @param options - Context options
 * @returns Mock operation context
 *
 * @example
 * ```typescript
 * // Basic usage
 * const context = createMockContext();
 *
 * // With custom values
 * const context = createMockContext({
 *   operationType: 'gather.data',
 *   previousResults: { url: 'https://example.com' },
 *   attempt: 2,
 * });
 *
 * // Test handler
 * const result = await myHandler(context);
 * ```
 */
export function createMockContext<T = Record<string, unknown>>(
  options?: MockContextOptions,
): OperationContext<T> {
  return {
    workflowId: options?.workflowId ?? 'test-workflow-id',
    operationId: options?.operationId ?? 'test-operation-id',
    operationType: options?.operationType ?? 'test.operation',
    stageName: options?.stageName ?? 'test-stage',
    attempt: options?.attempt ?? 1,
    maxAttempts: options?.maxAttempts ?? 3,
    previousResults: (options?.previousResults ?? {}) as T,
    initialContext: options?.initialContext ?? {},
    workflowType: options?.workflowType ?? 'test-workflow',
    signal: options?.signal,
  };
}

// =============================================================================
// Mock Results
// =============================================================================

/**
 * Creates a successful operation result.
 *
 * @param data - Result data
 * @returns Successful operation result
 *
 * @example
 * ```typescript
 * const result = createSuccessResult({ processedCount: 10 });
 * // { status: 'completed', data: { processedCount: 10 } }
 * ```
 */
export function createSuccessResult<T = Record<string, unknown>>(
  data?: T,
): OperationResult<T> {
  return {
    status: 'completed',
    data,
  };
}

/**
 * Creates a failed operation result.
 *
 * @param reason - Failure reason
 * @returns Failed operation result
 *
 * @example
 * ```typescript
 * const result = createFailureResult('Network timeout');
 * // { status: 'failed', reason: 'Network timeout' }
 * ```
 */
export function createFailureResult(reason: string): OperationResult {
  return {
    status: 'failed',
    reason,
  };
}

// =============================================================================
// Mock Workflow Records
// =============================================================================

/**
 * Options for creating a mock workflow record.
 */
export interface MockWorkflowOptions {
  id?: string;
  type?: string;
  status?: WorkflowStatus;
  context?: WorkflowContext;
  currentStage?: string | null;
  checkpointStatus?: string | null;
  errorMessage?: string | null;
  templateVersion?: string;
  createdAt?: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

/**
 * Creates a mock workflow record for testing.
 *
 * @param options - Workflow options
 * @returns Mock workflow record
 *
 * @example
 * ```typescript
 * const workflow = createMockWorkflow({
 *   status: 'active',
 *   currentStage: 'analyze',
 * });
 * ```
 */
export function createMockWorkflow(options?: MockWorkflowOptions): WorkflowRecord {
  return {
    id: options?.id ?? 'test-workflow-id',
    type: options?.type ?? 'test-workflow',
    status: options?.status ?? 'pending',
    context: options?.context ?? {},
    currentStage: options?.currentStage ?? null,
    checkpointStatus: options?.checkpointStatus ?? null,
    errorMessage: options?.errorMessage ?? null,
    templateVersion: options?.templateVersion ?? '1.0.0',
    createdAt: options?.createdAt ?? new Date(),
    startedAt: options?.startedAt ?? null,
    completedAt: options?.completedAt ?? null,
  };
}

/**
 * Options for creating a mock operation record.
 */
export interface MockOperationOptions {
  id?: string;
  workflowId?: string;
  type?: string;
  stage?: string;
  status?: OperationStatus;
  result?: Record<string, unknown> | null;
  errorMessage?: string | null;
  attempts?: number;
  maxAttempts?: number;
  createdAt?: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

/**
 * Creates a mock operation record for testing.
 *
 * @param options - Operation options
 * @returns Mock operation record
 *
 * @example
 * ```typescript
 * const operation = createMockOperation({
 *   type: 'gather.data',
 *   status: 'completed',
 *   result: { data: {} },
 * });
 * ```
 */
export function createMockOperation(options?: MockOperationOptions): OperationRecord {
  return {
    id: options?.id ?? 'test-operation-id',
    workflowId: options?.workflowId ?? 'test-workflow-id',
    type: options?.type ?? 'test.operation',
    stage: options?.stage ?? 'test-stage',
    status: options?.status ?? 'pending',
    result: options?.result ?? null,
    errorMessage: options?.errorMessage ?? null,
    attempts: options?.attempts ?? 0,
    maxAttempts: options?.maxAttempts ?? 3,
    createdAt: options?.createdAt ?? new Date(),
    startedAt: options?.startedAt ?? null,
    completedAt: options?.completedAt ?? null,
  };
}

// =============================================================================
// Handler Testing
// =============================================================================

/**
 * Tests an operation handler with the given context.
 *
 * Convenience wrapper that creates a mock context and runs the handler.
 *
 * @param handler - Handler to test
 * @param options - Context options
 * @returns Operation result
 *
 * @example
 * ```typescript
 * const result = await testHandler(myHandler, {
 *   previousResults: { url: 'https://example.com' },
 * });
 *
 * expect(result.status).toBe('completed');
 * expect(result.data?.fetchedData).toBeDefined();
 * ```
 */
export async function testHandler<TContext = Record<string, unknown>, TResult = Record<string, unknown>>(
  handler: OperationHandler<TContext, TResult>,
  options?: MockContextOptions,
): Promise<OperationResult<TResult>> {
  const context = createMockContext<TContext>(options);
  return handler(context);
}

/**
 * Creates a mock handler that returns a fixed result.
 *
 * Useful for testing workflows without running actual operations.
 *
 * @param result - Result to return
 * @returns Mock handler
 *
 * @example
 * ```typescript
 * const mockHandler = createMockHandler(createSuccessResult({ data: 'test' }));
 * registry.register('test.operation', mockHandler);
 * ```
 */
export function createMockHandler<T = Record<string, unknown>>(
  result: OperationResult<T>,
): OperationHandler<Record<string, unknown>, T> {
  return async () => result;
}

/**
 * Creates a mock handler that calls a spy function.
 *
 * Useful for verifying handler calls in tests.
 *
 * @param spy - Spy function to call
 * @param result - Result to return
 * @returns Mock handler
 *
 * @example
 * ```typescript
 * const calls: OperationContext[] = [];
 * const mockHandler = createSpyHandler(
 *   (ctx) => calls.push(ctx),
 *   createSuccessResult()
 * );
 *
 * await testHandler(mockHandler);
 * expect(calls.length).toBe(1);
 * ```
 */
export function createSpyHandler<T = Record<string, unknown>>(
  spy: (context: OperationContext) => void,
  result: OperationResult<T>,
): OperationHandler<Record<string, unknown>, T> {
  return async (context) => {
    spy(context);
    return result;
  };
}

/**
 * Creates a mock handler that throws an error.
 *
 * Useful for testing error handling.
 *
 * @param error - Error to throw
 * @returns Mock handler that throws
 *
 * @example
 * ```typescript
 * const errorHandler = createThrowingHandler(new Error('Network failure'));
 *
 * await expect(testHandler(errorHandler)).rejects.toThrow('Network failure');
 * ```
 */
export function createThrowingHandler(error: Error): OperationHandler {
  return async () => {
    throw error;
  };
}

// =============================================================================
// Template Testing
// =============================================================================

/**
 * Creates a minimal valid workflow template for testing.
 *
 * @param overrides - Template overrides
 * @returns Valid workflow template
 *
 * @example
 * ```typescript
 * const template = createMockTemplate({
 *   type: 'my-workflow',
 *   stages: [
 *     { name: 'gather', operations: [{ type: 'gather.data' }] },
 *   ],
 * });
 * ```
 */
export function createMockTemplate(
  overrides?: Partial<WorkflowTemplate>,
): WorkflowTemplate {
  return {
    type: overrides?.type ?? 'test-workflow',
    queue: overrides?.queue ?? 'test-queue',
    version: overrides?.version ?? '1.0.0',
    description: overrides?.description ?? 'Test workflow',
    stages: overrides?.stages ?? [
      {
        name: 'test-stage',
        operations: [{ type: 'test.operation' }],
      },
    ],
    checkpoints: overrides?.checkpoints,
    nextWorkflow: overrides?.nextWorkflow,
    coordination: overrides?.coordination,
    queueConfig: overrides?.queueConfig,
    estimatedDurationSeconds: overrides?.estimatedDurationSeconds,
  };
}

// =============================================================================
// Assertions
// =============================================================================

/**
 * Asserts that an operation result is successful.
 *
 * @param result - Result to check
 * @throws Error if result is not successful
 *
 * @example
 * ```typescript
 * const result = await testHandler(myHandler);
 * assertSuccess(result);
 * // Type narrows to { status: 'completed', data: ... }
 * ```
 */
export function assertSuccess<T>(
  result: OperationResult<T>,
): asserts result is OperationResult<T> & { status: 'completed' } {
  if (result.status !== 'completed') {
    throw new Error(`Expected success but got failure: ${result.reason}`);
  }
}

/**
 * Asserts that an operation result is a failure.
 *
 * @param result - Result to check
 * @throws Error if result is not a failure
 *
 * @example
 * ```typescript
 * const result = await testHandler(myHandler);
 * assertFailure(result);
 * // Type narrows to { status: 'failed', reason: ... }
 * ```
 */
export function assertFailure(
  result: OperationResult,
): asserts result is OperationResult & { status: 'failed' } {
  if (result.status !== 'failed') {
    throw new Error(`Expected failure but got success`);
  }
}
