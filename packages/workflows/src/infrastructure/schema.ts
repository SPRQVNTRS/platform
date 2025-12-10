/**
 * Drizzle ORM schema for workflow orchestration.
 *
 * This module exports the database schema required for workflow persistence.
 * Import this schema into your application's Drizzle configuration.
 *
 * @example
 * ```typescript
 * // In your drizzle schema file
 * import { workflows, workflowOperations, workflowLocks } from '@sprqvntrs/workflows/schema';
 *
 * export { workflows, workflowOperations, workflowLocks };
 * ```
 *
 * @example
 * ```typescript
 * // Running migrations
 * // Add these tables to your Drizzle migrations
 * ```
 */

import { pgTable, uuid, text, timestamp, jsonb, integer, unique, index } from 'drizzle-orm/pg-core';

// =============================================================================
// Workflows Table
// =============================================================================

/**
 * Main workflows table storing workflow instances.
 *
 * Each row represents a single workflow execution with its current state
 * and accumulated context from completed operations.
 *
 * @remarks
 * The `context` column stores a JSONB object that grows as operations complete.
 * Consider monitoring context size for workflows with many operations.
 */
export const workflows = pgTable(
  'workflows',
  {
    /**
     * Unique identifier for the workflow instance.
     */
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * Workflow type matching a registered template.
     * @example 'content-generation', 'data-processing'
     */
    type: text('type').notNull(),

    /**
     * Current workflow status.
     * @see WorkflowStatus type for possible values
     */
    status: text('status').notNull().default('pending'),

    /**
     * Accumulated workflow context (initial + operation results).
     * This JSONB column stores all data flowing through the workflow.
     */
    context: jsonb('context').notNull().default({}),

    /**
     * Currently executing stage name.
     * Null when workflow hasn't started or is completed.
     */
    currentStage: text('current_stage'),

    /**
     * Checkpoint status when workflow is paused.
     * Used by UI to display appropriate actions.
     * @example 'data_ready', 'content_review', 'approval_pending'
     */
    checkpointStatus: text('checkpoint_status'),

    /**
     * Error message if workflow failed.
     * Contains the error that caused terminal failure.
     */
    errorMessage: text('error_message'),

    /**
     * Template version used for this workflow.
     * Useful for debugging and migration.
     */
    templateVersion: text('template_version').notNull(),

    /**
     * When the workflow record was created.
     */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    /**
     * When workflow execution actually started.
     * Set when worker picks up the job.
     */
    startedAt: timestamp('started_at', { withTimezone: true }),

    /**
     * When workflow completed (success, failure, or cancellation).
     */
    completedAt: timestamp('completed_at', { withTimezone: true }),

    /**
     * pg-boss job ID for this workflow.
     * Used to correlate with job queue.
     */
    jobId: text('job_id'),
  },
  (table) => [
    /**
     * Index for querying workflows by status.
     * Common query: find all active/pending workflows.
     */
    index('workflows_status_idx').on(table.status),

    /**
     * Index for querying workflows by type.
     * Common query: find all workflows of a specific type.
     */
    index('workflows_type_idx').on(table.type),

    /**
     * Index for querying workflows by creation time.
     * Common query: find recent workflows.
     */
    index('workflows_created_at_idx').on(table.createdAt),

    /**
     * Composite index for filtering by type and status.
     * Common query: find active workflows of a specific type.
     */
    index('workflows_type_status_idx').on(table.type, table.status),
  ],
);

// =============================================================================
// Workflow Operations Table
// =============================================================================

/**
 * Operations table storing individual operation executions.
 *
 * Each row represents a single operation within a workflow stage.
 * Operations track their own status, results, and retry attempts.
 */
export const workflowOperations = pgTable(
  'workflow_operations',
  {
    /**
     * Unique identifier for the operation instance.
     */
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * Parent workflow ID.
     * References the workflows table.
     */
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),

    /**
     * Operation type matching a registered handler.
     * @example 'gather.data', 'analyze.content'
     */
    type: text('type').notNull(),

    /**
     * Stage name this operation belongs to.
     */
    stage: text('stage').notNull(),

    /**
     * Current operation status.
     * @see OperationStatus type for possible values
     */
    status: text('status').notNull().default('pending'),

    /**
     * Operation result data (on success).
     * This data gets merged into the workflow context.
     */
    result: jsonb('result'),

    /**
     * Error message if operation failed.
     */
    errorMessage: text('error_message'),

    /**
     * Current attempt count (1-indexed).
     */
    attempts: integer('attempts').notNull().default(0),

    /**
     * Maximum allowed attempts.
     */
    maxAttempts: integer('max_attempts').notNull().default(3),

    /**
     * When the operation record was created.
     */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    /**
     * When operation execution started.
     */
    startedAt: timestamp('started_at', { withTimezone: true }),

    /**
     * When operation completed (success or failure).
     */
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    /**
     * Index for querying operations by workflow.
     * Common query: get all operations for a workflow.
     */
    index('workflow_operations_workflow_id_idx').on(table.workflowId),

    /**
     * Index for querying operations by status.
     * Common query: find pending operations.
     */
    index('workflow_operations_status_idx').on(table.status),

    /**
     * Composite index for finding operations by workflow and stage.
     * Common query: get operations for a specific stage.
     */
    index('workflow_operations_workflow_stage_idx').on(table.workflowId, table.stage),
  ],
);

// =============================================================================
// Workflow Locks Table
// =============================================================================

/**
 * Locks table for coordination and race condition prevention.
 *
 * Uses database unique constraints to ensure only one workflow
 * can hold a lock on a given entity at a time.
 *
 * @remarks
 * Lock acquisition is done via INSERT. If insert fails due to unique
 * constraint violation, another workflow holds the lock.
 */
export const workflowLocks = pgTable(
  'workflow_locks',
  {
    /**
     * Unique identifier for the lock.
     */
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * Type of entity being locked.
     * @example 'document', 'user', 'order'
     */
    entityType: text('entity_type').notNull(),

    /**
     * ID of the entity being locked.
     */
    entityId: text('entity_id').notNull(),

    /**
     * Workflow holding this lock.
     */
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),

    /**
     * When the lock was acquired.
     */
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),

    /**
     * Optional lock expiration time.
     * Allows stale locks to be cleaned up.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => [
    /**
     * Unique constraint ensuring only one lock per entity.
     * This is the core mechanism for mutual exclusion.
     */
    unique('workflow_locks_entity_unique').on(table.entityType, table.entityId),

    /**
     * Index for finding locks by workflow.
     * Used during workflow cleanup.
     */
    index('workflow_locks_workflow_id_idx').on(table.workflowId),

    /**
     * Index for finding expired locks.
     * Used by lock cleanup job.
     */
    index('workflow_locks_expires_at_idx').on(table.expiresAt),
  ],
);

// =============================================================================
// Type Exports for Drizzle
// =============================================================================

/**
 * TypeScript type for workflow table row.
 */
export type Workflow = typeof workflows.$inferSelect;

/**
 * TypeScript type for workflow insert.
 */
export type NewWorkflow = typeof workflows.$inferInsert;

/**
 * TypeScript type for operation table row.
 */
export type WorkflowOperation = typeof workflowOperations.$inferSelect;

/**
 * TypeScript type for operation insert.
 */
export type NewWorkflowOperation = typeof workflowOperations.$inferInsert;

/**
 * TypeScript type for lock table row.
 */
export type WorkflowLock = typeof workflowLocks.$inferSelect;

/**
 * TypeScript type for lock insert.
 */
export type NewWorkflowLock = typeof workflowLocks.$inferInsert;
