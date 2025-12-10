/**
 * Core types for the workflow orchestration system.
 *
 * This module defines all the fundamental types used throughout the workflow package,
 * including workflow templates, operations, status enums, and configuration options.
 *
 * @example
 * ```typescript
 * import type {
 *   WorkflowTemplate,
 *   OperationHandler,
 *   WorkflowStatus,
 * } from '@sprqvntrs/workflows';
 * ```
 */

// =============================================================================
// Status Enums
// =============================================================================

/**
 * Possible states for a workflow during its lifecycle.
 *
 * State transitions:
 * - `pending` → `active` (when worker picks up job)
 * - `active` → `paused` (when hitting a checkpoint)
 * - `paused` → `active` (when resumed)
 * - `active` → `completed` (successful completion)
 * - `active` → `failed` (unrecoverable error)
 * - `*` → `cancelled` (manual cancellation)
 */
export type WorkflowStatus = 'pending' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';

/**
 * Possible states for an individual operation within a workflow.
 *
 * State transitions:
 * - `pending` → `active` (when execution starts)
 * - `active` → `completed` (successful completion)
 * - `active` → `failed` (all retries exhausted)
 * - `active` → `skipped` (conditional skip)
 */
export type OperationStatus = 'pending' | 'active' | 'completed' | 'failed' | 'skipped';

// =============================================================================
// Template Definitions
// =============================================================================

/**
 * Configuration for pg-boss job queue behavior.
 *
 * These settings control how jobs are retried, expired, and retained.
 *
 * @example
 * ```typescript
 * const queueConfig: QueueConfig = {
 *   retryLimit: 3,
 *   retryDelay: 10,
 *   retryBackoff: true,
 *   expireInSeconds: 3600,
 * };
 * ```
 */
export interface QueueConfig {
  /**
   * Maximum number of retry attempts for failed jobs.
   * @default 3
   */
  retryLimit?: number;

  /**
   * Initial delay in seconds between retry attempts.
   * @default 5
   */
  retryDelay?: number;

  /**
   * Whether to use exponential backoff for retries.
   * When true, delay doubles with each attempt.
   * @default true
   */
  retryBackoff?: boolean;

  /**
   * Time in seconds before a job expires (considered failed if still running).
   * @default 3600 (1 hour)
   */
  expireInSeconds?: number;

  /**
   * Time in seconds to retain completed jobs in the database.
   * @default 86400 (24 hours)
   */
  retentionSeconds?: number;
}

/**
 * Defines a single operation within a workflow stage.
 *
 * Operations are the smallest unit of work in a workflow. Each operation
 * has a type that maps to a registered handler function.
 *
 * @example
 * ```typescript
 * const operation: OperationTemplate = {
 *   type: 'analyze.content',
 *   timeout: 120000,
 *   maxAttempts: 3,
 *   critical: true,
 * };
 * ```
 */
export interface OperationTemplate {
  /**
   * Unique identifier for this operation type.
   * Must match a registered operation handler.
   * Convention: `category.action` (e.g., 'gather.data', 'analyze.content')
   */
  type: string;

  /**
   * Maximum execution time in milliseconds before timeout.
   * @default 30000 (30 seconds)
   */
  timeout?: number;

  /**
   * Maximum retry attempts for this specific operation.
   * @default 3
   */
  maxAttempts?: number;

  /**
   * Whether failure of this operation should fail the entire workflow.
   * When false, workflow continues even if operation fails.
   * @default true
   */
  critical?: boolean;

  /**
   * Optional condition function to determine if operation should run.
   * Receives the current workflow context.
   * Return `false` to skip this operation.
   */
  condition?: (context: WorkflowContext) => boolean;
}

/**
 * Defines a stage within a workflow.
 *
 * Stages are executed sequentially. Operations within a stage can run
 * in parallel or sequentially based on the `parallel` flag.
 *
 * @example
 * ```typescript
 * const stage: StageTemplate = {
 *   name: 'analyze',
 *   description: 'Run all analysis operations',
 *   parallel: true,
 *   operations: [
 *     { type: 'analyze.competitors' },
 *     { type: 'analyze.market' },
 *     { type: 'analyze.financials' },
 *   ],
 * };
 * ```
 */
export interface StageTemplate {
  /**
   * Unique name for this stage within the workflow.
   * Used for tracking progress and error reporting.
   */
  name: string;

  /**
   * Human-readable description of what this stage does.
   */
  description?: string;

  /**
   * Operations to execute in this stage.
   */
  operations: OperationTemplate[];

  /**
   * Whether operations should run in parallel.
   * When false, operations run sequentially in order.
   * @default false
   */
  parallel?: boolean;

  /**
   * Optional fix operations to run if verify operations fail.
   * Only applicable for verify stages. Creates a fix-verify loop.
   */
  fixOperations?: OperationTemplate[];

  /**
   * Maximum number of fix-verify cycles before failing.
   * Only applicable when fixOperations is defined.
   * @default 3
   */
  maxFixCycles?: number;

  /**
   * Optional condition function to determine if stage should run.
   * Receives the current workflow context.
   * Return `false` to skip this entire stage.
   */
  condition?: (context: WorkflowContext) => boolean;
}

/**
 * Defines a checkpoint where workflow can pause for manual intervention.
 *
 * Checkpoints allow workflows to pause at specific points, typically for
 * human review or approval before continuing.
 *
 * @example
 * ```typescript
 * const checkpoint: CheckpointTemplate = {
 *   after: 'gather',
 *   status: 'data_ready',
 *   condition: (ctx) => !ctx.isAutomated,
 * };
 * ```
 */
export interface CheckpointTemplate {
  /**
   * Stage name after which to pause.
   */
  after: string;

  /**
   * Status string to set when paused at this checkpoint.
   * Can be used by UI to show appropriate actions.
   */
  status: string;

  /**
   * Optional condition to determine if checkpoint should trigger.
   * If not provided, checkpoint always triggers.
   */
  condition?: (context: WorkflowContext) => boolean;

  /**
   * Optional timeout in milliseconds to auto-resume.
   * If not provided, requires manual resume.
   */
  autoResumeAfter?: number;
}

/**
 * Coordination configuration for preventing race conditions.
 *
 * When multiple workflows might operate on the same entity, coordination
 * ensures they don't interfere with each other.
 *
 * @example
 * ```typescript
 * const coordination: CoordinationConfig = {
 *   entityType: 'document',
 *   entityIdPath: 'documentId',
 *   criticalOperations: ['process.document', 'save.document'],
 * };
 * ```
 */
export interface CoordinationConfig {
  /**
   * Type of entity being coordinated (e.g., 'document', 'user', 'order').
   */
  entityType: string;

  /**
   * Path in context to find the entity ID.
   * Supports dot notation for nested paths.
   */
  entityIdPath: string;

  /**
   * Operation types that require coordination.
   * These operations will wait for prior operations on the same entity.
   */
  criticalOperations?: string[];

  /**
   * Maximum time in milliseconds to wait for coordination.
   * @default 600000 (10 minutes)
   */
  coordinationTimeout?: number;
}

/**
 * Complete workflow template definition.
 *
 * Templates define the structure and behavior of a workflow type.
 * They are registered with the orchestrator and used to create workflow instances.
 *
 * @example
 * ```typescript
 * const template: WorkflowTemplate = {
 *   type: 'content-generation',
 *   queue: 'default',
 *   version: '1.0.0',
 *   description: 'Generate and publish content',
 *   stages: [
 *     { name: 'gather', operations: [{ type: 'gather.data' }] },
 *     { name: 'generate', operations: [{ type: 'generate.content' }] },
 *   ],
 *   checkpoints: [
 *     { after: 'generate', status: 'content_ready' },
 *   ],
 * };
 * ```
 */
export interface WorkflowTemplate {
  /**
   * Unique identifier for this workflow type.
   * Used to look up the template when starting workflows.
   */
  type: string;

  /**
   * pg-boss queue name for this workflow.
   * Different queues can have different worker counts.
   */
  queue: string;

  /**
   * Semantic version of this template.
   * Useful for tracking template changes over time.
   */
  version: string;

  /**
   * Human-readable description of what this workflow does.
   */
  description?: string;

  /**
   * Estimated duration in seconds for UI display.
   * Does not affect actual execution.
   */
  estimatedDurationSeconds?: number;

  /**
   * Queue configuration overrides for this workflow type.
   */
  queueConfig?: QueueConfig;

  /**
   * Ordered list of stages to execute.
   */
  stages: StageTemplate[];

  /**
   * Optional checkpoints for manual intervention.
   */
  checkpoints?: CheckpointTemplate[];

  /**
   * Optional next workflow to trigger on completion.
   * Enables workflow chaining.
   */
  nextWorkflow?: string;

  /**
   * Optional coordination configuration for race condition prevention.
   */
  coordination?: CoordinationConfig;
}

// =============================================================================
// Operation Handler Types
// =============================================================================

/**
 * Result returned by an operation handler.
 *
 * Operations must return this structure to indicate success/failure
 * and provide any data to merge into the workflow context.
 *
 * @example
 * ```typescript
 * // Successful operation
 * return {
 *   status: 'completed',
 *   data: { scrapedContent: content },
 * };
 *
 * // Failed operation
 * return {
 *   status: 'failed',
 *   reason: 'External API returned 503',
 * };
 * ```
 */
export interface OperationResult<TData = Record<string, unknown>> {
  /**
   * Outcome of the operation.
   */
  status: 'completed' | 'failed';

  /**
   * Data to merge into workflow context on success.
   */
  data?: TData;

  /**
   * Error message or reason for failure.
   */
  reason?: string;

  /**
   * Additional metadata about the operation execution.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Context provided to operation handlers.
 *
 * Contains all information needed to execute an operation, including
 * accumulated results from previous operations.
 *
 * @example
 * ```typescript
 * const handler: OperationHandler = async (context) => {
 *   const { previousResults, workflowId, operationId } = context;
 *   const url = previousResults.websiteUrl;
 *   // ... perform operation
 * };
 * ```
 */
export interface OperationContext<TPrevious = Record<string, unknown>> {
  /**
   * Unique identifier of the workflow instance.
   */
  workflowId: string;

  /**
   * Unique identifier of this operation instance.
   */
  operationId: string;

  /**
   * Type of this operation (from template).
   */
  operationType: string;

  /**
   * Name of the current stage.
   */
  stageName: string;

  /**
   * Current attempt number (1-indexed).
   */
  attempt: number;

  /**
   * Maximum attempts allowed for this operation.
   */
  maxAttempts: number;

  /**
   * Accumulated results from all previous operations.
   * This is the merged workflow context up to this point.
   */
  previousResults: TPrevious;

  /**
   * Initial context provided when workflow was started.
   */
  initialContext: Record<string, unknown>;

  /**
   * Workflow type (from template).
   */
  workflowType: string;

  /**
   * Optional abort signal for cancellation.
   */
  signal?: AbortSignal;
}

/**
 * Function signature for operation handlers.
 *
 * Operation handlers are async functions that perform the actual work.
 * They receive context and must return an OperationResult.
 *
 * @example
 * ```typescript
 * const scrapeWebsite: OperationHandler = async (context) => {
 *   try {
 *     const data = await scraper.scrape(context.previousResults.url);
 *     return { status: 'completed', data: { scrapedData: data } };
 *   } catch (error) {
 *     return { status: 'failed', reason: error.message };
 *   }
 * };
 * ```
 */
export type OperationHandler<
  TContext = Record<string, unknown>,
  TResult = Record<string, unknown>,
> = (context: OperationContext<TContext>) => Promise<OperationResult<TResult>>;

// =============================================================================
// Workflow Context and State
// =============================================================================

/**
 * Accumulated workflow context.
 *
 * This type represents the accumulated state of a workflow,
 * including initial context and all operation results merged together.
 */
export type WorkflowContext = Record<string, unknown>;

/**
 * Workflow record stored in the database.
 */
export interface WorkflowRecord {
  /**
   * Unique identifier (UUID).
   */
  id: string;

  /**
   * Workflow type (matches template type).
   */
  type: string;

  /**
   * Current status.
   */
  status: WorkflowStatus;

  /**
   * Accumulated context (initial + operation results).
   */
  context: WorkflowContext;

  /**
   * Currently executing stage name.
   */
  currentStage: string | null;

  /**
   * Checkpoint status if paused.
   */
  checkpointStatus: string | null;

  /**
   * Error message if failed.
   */
  errorMessage: string | null;

  /**
   * When workflow was created.
   */
  createdAt: Date;

  /**
   * When execution started.
   */
  startedAt: Date | null;

  /**
   * When execution completed (success or failure).
   */
  completedAt: Date | null;

  /**
   * Template version used.
   */
  templateVersion: string;
}

/**
 * Operation record stored in the database.
 */
export interface OperationRecord {
  /**
   * Unique identifier (UUID).
   */
  id: string;

  /**
   * Parent workflow ID.
   */
  workflowId: string;

  /**
   * Operation type (matches template).
   */
  type: string;

  /**
   * Stage name this operation belongs to.
   */
  stage: string;

  /**
   * Current status.
   */
  status: OperationStatus;

  /**
   * Operation result data.
   */
  result: Record<string, unknown> | null;

  /**
   * Error message if failed.
   */
  errorMessage: string | null;

  /**
   * Current attempt count.
   */
  attempts: number;

  /**
   * Maximum allowed attempts.
   */
  maxAttempts: number;

  /**
   * When operation was created.
   */
  createdAt: Date;

  /**
   * When operation started executing.
   */
  startedAt: Date | null;

  /**
   * When operation completed.
   */
  completedAt: Date | null;
}

// =============================================================================
// Orchestrator Configuration
// =============================================================================

/**
 * Configuration for a single queue.
 *
 * @example
 * ```typescript
 * const queueDef: QueueDefinition = {
 *   name: 'heavy-processing',
 *   workers: 2,
 *   batchSize: 1,
 * };
 * ```
 */
export interface QueueDefinition {
  /**
   * Unique name for this queue.
   */
  name: string;

  /**
   * Number of concurrent workers for this queue.
   * @default 1
   */
  workers?: number;

  /**
   * Number of jobs to fetch per worker poll.
   * @default 1
   */
  batchSize?: number;

  /**
   * Polling interval in milliseconds.
   * @default 2000
   */
  pollingIntervalMs?: number;
}

/**
 * Main configuration for the workflow orchestrator.
 *
 * @example
 * ```typescript
 * const config: OrchestratorConfig = {
 *   connectionString: process.env.DATABASE_URL,
 *   queues: [
 *     { name: 'default', workers: 5 },
 *     { name: 'sequential', workers: 1 },
 *   ],
 *   defaultTimeout: 30000,
 *   defaultRetryLimit: 3,
 * };
 * ```
 */
export interface OrchestratorConfig {
  /**
   * PostgreSQL connection string.
   */
  connectionString: string;

  /**
   * Queue definitions.
   * At minimum, define a 'default' queue.
   */
  queues: QueueDefinition[];

  /**
   * Default operation timeout in milliseconds.
   * @default 30000 (30 seconds)
   */
  defaultTimeout?: number;

  /**
   * Default retry limit for operations.
   * @default 3
   */
  defaultRetryLimit?: number;

  /**
   * Default retry delay in seconds.
   * @default 5
   */
  defaultRetryDelay?: number;

  /**
   * pg-boss schema name.
   * @default 'pgboss'
   */
  schema?: string;

  /**
   * Whether to enable debug logging.
   * @default false
   */
  debug?: boolean;

  /**
   * Application name for pg-boss.
   * Useful for monitoring in PostgreSQL.
   */
  application?: string;
}

// =============================================================================
// API Types
// =============================================================================

/**
 * Options for starting a new workflow.
 *
 * @example
 * ```typescript
 * const options: StartWorkflowOptions = {
 *   type: 'content-generation',
 *   context: { documentId: '123', userId: 'user-456' },
 *   priority: 10,
 * };
 * ```
 */
export interface StartWorkflowOptions {
  /**
   * Workflow type (must match a registered template).
   */
  type: string;

  /**
   * Initial context for the workflow.
   */
  context: WorkflowContext;

  /**
   * Optional job priority (higher = more urgent).
   * @default 0
   */
  priority?: number;

  /**
   * Optional delay before job becomes available (in seconds).
   */
  startAfterSeconds?: number;

  /**
   * Optional unique key to prevent duplicate workflows.
   * If a workflow with this key exists and is not completed, start will fail.
   */
  singletonKey?: string;
}

/**
 * Result of starting a workflow.
 */
export interface StartWorkflowResult {
  /**
   * Unique identifier for the created workflow.
   */
  workflowId: string;

  /**
   * pg-boss job ID.
   */
  jobId: string;
}

/**
 * Options for scheduling a recurring workflow.
 *
 * @example
 * ```typescript
 * const schedule: ScheduleOptions = {
 *   name: 'daily-cleanup',
 *   cron: '0 4 * * *',
 *   type: 'cleanup-workflow',
 *   context: { scope: 'all' },
 * };
 * ```
 */
export interface ScheduleOptions {
  /**
   * Unique name for this schedule.
   */
  name: string;

  /**
   * Cron expression (minute hour day-of-month month day-of-week).
   */
  cron: string;

  /**
   * Workflow type to start on each trigger.
   */
  type: string;

  /**
   * Context to pass to each workflow instance.
   */
  context?: WorkflowContext;

  /**
   * Timezone for cron evaluation.
   * @default 'UTC'
   */
  timezone?: string;
}

/**
 * Detailed workflow status including operations.
 */
export interface WorkflowStatusDetails {
  /**
   * The workflow record.
   */
  workflow: WorkflowRecord;

  /**
   * All operation records for this workflow.
   */
  operations: OperationRecord[];

  /**
   * Current progress as percentage (0-100).
   */
  progress: number;

  /**
   * Human-readable status message.
   */
  message: string;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Base error class for workflow errors.
 */
export class WorkflowError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'WorkflowError';
  }
}

/**
 * Error thrown when a template is invalid or not found.
 */
export class TemplateError extends WorkflowError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'TEMPLATE_ERROR', context);
    this.name = 'TemplateError';
  }
}

/**
 * Error thrown when an operation fails.
 */
export class OperationError extends WorkflowError {
  constructor(
    message: string,
    public readonly operationType: string,
    public readonly operationId: string,
    context?: Record<string, unknown>,
  ) {
    super(message, 'OPERATION_ERROR', { ...context, operationType, operationId });
    this.name = 'OperationError';
  }
}

/**
 * Error thrown when an operation times out.
 */
export class TimeoutError extends WorkflowError {
  constructor(
    message: string,
    public readonly operationType: string,
    public readonly timeoutMs: number,
    context?: Record<string, unknown>,
  ) {
    super(message, 'TIMEOUT_ERROR', { ...context, operationType, timeoutMs });
    this.name = 'TimeoutError';
  }
}

/**
 * Error thrown when coordination/locking fails.
 */
export class CoordinationError extends WorkflowError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'COORDINATION_ERROR', context);
    this.name = 'CoordinationError';
  }
}
