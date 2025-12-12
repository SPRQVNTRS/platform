/**
 * @sprqvntrs/workflows
 *
 * PostgreSQL-backed workflow orchestration with pg-boss job queuing.
 *
 * This package provides a declarative, template-driven approach to executing
 * multi-stage background workflows with reliable persistence and job processing.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { createWorkflowOrchestrator } from '@sprqvntrs/workflows';
 * import { drizzle } from 'drizzle-orm/node-postgres';
 * import { Pool } from 'pg';
 *
 * // Set up database
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const db = drizzle(pool);
 *
 * // Create orchestrator
 * const orchestrator = await createWorkflowOrchestrator({
 *   connectionString: process.env.DATABASE_URL,
 *   db,
 *   queues: [
 *     { name: 'default', workers: 5 },
 *     { name: 'sequential', workers: 1 },
 *   ],
 * });
 *
 * // Register a workflow template
 * orchestrator.registerTemplate({
 *   type: 'content-generation',
 *   queue: 'default',
 *   version: '1.0.0',
 *   stages: [
 *     { name: 'gather', operations: [{ type: 'gather.data' }] },
 *     { name: 'analyze', parallel: true, operations: [
 *       { type: 'analyze.content' },
 *       { type: 'analyze.market' },
 *     ]},
 *     { name: 'generate', operations: [{ type: 'generate.report' }] },
 *   ],
 * });
 *
 * // Register operation handlers
 * orchestrator.registerOperations({
 *   'gather.data': async (ctx) => {
 *     const data = await fetchData(ctx.previousResults.url);
 *     return { status: 'completed', data: { fetchedData: data } };
 *   },
 *   // ... more handlers
 * });
 *
 * // Start a workflow
 * const { workflowId } = await orchestrator.start({
 *   type: 'content-generation',
 *   context: { url: 'https://example.com' },
 * });
 * ```
 *
 * ## Architecture
 *
 * The package follows a three-layer architecture:
 *
 * 1. **Orchestrator** - Public API for starting, managing, and querying workflows
 * 2. **Execution Engine** - Interprets templates and executes stages/operations
 * 3. **Infrastructure** - pg-boss job queue and Drizzle database persistence
 *
 * ## Features
 *
 * - **Declarative Templates** - Define workflows as configuration objects
 * - **Parallel Execution** - Run operations concurrently within stages
 * - **Checkpoints** - Pause workflows for manual intervention
 * - **Workflow Chaining** - Trigger follow-up workflows on completion
 * - **Fix-Verify Loops** - Automatic retry cycles for data integrity
 * - **Entity Locking** - Prevent race conditions between workflows
 * - **Type Safety** - Full TypeScript support with generics
 *
 * @packageDocumentation
 */

// =============================================================================
// Main Orchestrator
// =============================================================================

export { createWorkflowOrchestrator, type WorkflowOrchestrator, type CreateOrchestratorConfig } from './src/orchestrator';

// =============================================================================
// Core Types
// =============================================================================

export type {
  // Status types
  WorkflowStatus,
  OperationStatus,

  // Template types
  WorkflowTemplate,
  StageTemplate,
  OperationTemplate,
  CheckpointTemplate,
  CoordinationConfig,
  QueueConfig,

  // Operation types
  OperationHandler,
  OperationContext,
  OperationResult,

  // Record types
  WorkflowRecord,
  OperationRecord,
  WorkflowContext,

  // Configuration types
  OrchestratorConfig,
  QueueDefinition,

  // API types
  StartWorkflowOptions,
  StartWorkflowResult,
  ScheduleOptions,
  WorkflowStatusDetails,
} from './src/types';

// Error types
export { WorkflowError, TemplateError, OperationError, TimeoutError, CoordinationError } from './src/types';

// =============================================================================
// Registries
// =============================================================================

export {
  createTemplateRegistry,
  validateTemplate,
  getOperationTypes,
  getQueueNames,
  type TemplateRegistry,
  type ValidationError,
} from './src/templates/registry';

export {
  createOperationRegistry,
  withTimeout,
  withRetry,
  withErrorBoundary,
  compose,
  defineHandler,
  type OperationRegistry,
  type TypedOperationHandler,
} from './src/operations/registry';

// =============================================================================
// Execution Engine
// =============================================================================

export {
  createExecutionEngine,
  type ExecutionEngine,
  type ExecutionEngineConfig,
} from './src/engine/execution-engine';

// =============================================================================
// Infrastructure
// =============================================================================

// pg-boss utilities
export {
  createBoss,
  createSendOptions,
  createWorkOptions,
  registerWorker,
  registerBatchWorker,
  scheduleRecurring,
  unschedule,
  getJob,
  cancelJob,
  resumeJob,
  setupGracefulShutdown,
  setupEventListeners,
  DEFAULT_QUEUE_CONFIG,
  DEFAULT_PGBOSS_CONFIG,
  type PgBossConfig,
  type WorkflowJobData,
  type JobHandler,
  type BatchJobHandler,
  type PgBossEvent,
} from './src/infrastructure/pg-boss';

// Database state
export {
  createDbState,
  type DbState,
  type Database,
  type CreateWorkflowData,
  type CreateOperationData,
  type ListWorkflowsOptions,
} from './src/infrastructure/db-state';

// =============================================================================
// Coordination
// =============================================================================

export {
  createLockManager,
  withLock,
  withLockWait,
  type LockManager,
  type LockOptions,
  type WaitOptions,
  type LockInfo,
} from './src/coordination/lock-manager';

// =============================================================================
// Re-exports for convenience
// =============================================================================

// Re-export PgBoss for advanced usage
export { default as PgBoss } from 'pg-boss';
