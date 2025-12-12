/**
 * Database state management for workflows.
 *
 * This module provides functions for persisting and querying workflow state
 * in PostgreSQL using Drizzle ORM. It handles all CRUD operations for
 * workflows, operations, and locks.
 *
 * @example
 * ```typescript
 * import { createDbState } from '@sprqvntrs/workflows';
 *
 * const dbState = createDbState(drizzleDb);
 *
 * const workflow = await dbState.createWorkflow({
 *   type: 'my-workflow',
 *   context: { userId: '123' },
 *   templateVersion: '1.0.0',
 * });
 * ```
 */

import { eq, and, isNotNull, lt, inArray, sql, desc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  workflows,
  workflowOperations,
  workflowLocks,
  type Workflow,
  type NewWorkflow,
  type WorkflowOperation,
  type NewWorkflowOperation,
  type WorkflowLock,
} from './schema';
import type { WorkflowStatus, OperationStatus, WorkflowContext } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * Database instance type.
 * Supports any Drizzle PostgreSQL database instance using node-postgres (pg).
 */
export type Database = NodePgDatabase<Record<string, unknown>>;

/**
 * Database state manager interface.
 *
 * Provides all database operations needed by the workflow orchestrator.
 */
export interface DbState {
  // Workflow operations
  createWorkflow: (data: CreateWorkflowData) => Promise<Workflow>;
  getWorkflow: (id: string) => Promise<Workflow | null>;
  getWorkflowByJobId: (jobId: string) => Promise<Workflow | null>;
  updateWorkflowStatus: (id: string, status: WorkflowStatus, error?: string) => Promise<Workflow | null>;
  updateWorkflowStage: (id: string, stage: string) => Promise<Workflow | null>;
  updateWorkflowContext: (id: string, context: WorkflowContext) => Promise<Workflow | null>;
  updateWorkflowCheckpoint: (id: string, checkpointStatus: string | null) => Promise<Workflow | null>;
  setWorkflowJobId: (id: string, jobId: string) => Promise<Workflow | null>;
  listWorkflows: (options?: ListWorkflowsOptions) => Promise<Workflow[]>;

  // Operation operations
  createOperation: (data: CreateOperationData) => Promise<WorkflowOperation>;
  createOperations: (data: CreateOperationData[]) => Promise<WorkflowOperation[]>;
  getOperation: (id: string) => Promise<WorkflowOperation | null>;
  getOperationsByWorkflow: (workflowId: string) => Promise<WorkflowOperation[]>;
  getOperationsByStage: (workflowId: string, stage: string) => Promise<WorkflowOperation[]>;
  updateOperationStatus: (id: string, status: OperationStatus, error?: string) => Promise<WorkflowOperation | null>;
  updateOperationResult: (id: string, result: Record<string, unknown>) => Promise<WorkflowOperation | null>;
  incrementOperationAttempts: (id: string) => Promise<WorkflowOperation | null>;
  deleteOperationsByWorkflow: (workflowId: string) => Promise<number>;

  // Lock operations
  acquireLock: (entityType: string, entityId: string, workflowId: string, expiresAt?: Date) => Promise<boolean>;
  releaseLock: (entityType: string, entityId: string) => Promise<boolean>;
  releaseLocksByWorkflow: (workflowId: string) => Promise<number>;
  getLock: (entityType: string, entityId: string) => Promise<WorkflowLock | null>;
  cleanupExpiredLocks: () => Promise<number>;
}

/**
 * Data for creating a new workflow.
 */
export interface CreateWorkflowData {
  /**
   * Workflow type matching a registered template.
   */
  type: string;

  /**
   * Initial workflow context.
   */
  context: WorkflowContext;

  /**
   * Template version being used.
   */
  templateVersion: string;

  /**
   * Optional job ID if already known.
   */
  jobId?: string;
}

/**
 * Data for creating a new operation.
 */
export interface CreateOperationData {
  /**
   * Parent workflow ID.
   */
  workflowId: string;

  /**
   * Operation type.
   */
  type: string;

  /**
   * Stage name.
   */
  stage: string;

  /**
   * Maximum retry attempts.
   */
  maxAttempts: number;
}

/**
 * Options for listing workflows.
 */
export interface ListWorkflowsOptions {
  /**
   * Filter by workflow type.
   */
  type?: string;

  /**
   * Filter by status.
   */
  status?: WorkflowStatus | WorkflowStatus[];

  /**
   * Maximum number of results.
   * @default 100
   */
  limit?: number;

  /**
   * Offset for pagination.
   * @default 0
   */
  offset?: number;

  /**
   * Order by creation time.
   * @default 'desc'
   */
  order?: 'asc' | 'desc';
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Creates a database state manager.
 *
 * The database state manager provides all CRUD operations for workflows,
 * operations, and locks. It uses Drizzle ORM for type-safe queries.
 *
 * @param db - Drizzle database instance
 * @returns Database state manager
 *
 * @example
 * ```typescript
 * import { drizzle } from 'drizzle-orm/node-postgres';
 * import { Pool } from 'pg';
 * import { createDbState } from '@sprqvntrs/workflows';
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const db = drizzle(pool);
 * const dbState = createDbState(db);
 *
 * // Create a workflow
 * const workflow = await dbState.createWorkflow({
 *   type: 'my-workflow',
 *   context: { documentId: '123' },
 *   templateVersion: '1.0.0',
 * });
 *
 * // Update status
 * await dbState.updateWorkflowStatus(workflow.id, 'active');
 *
 * // Create operations
 * await dbState.createOperations([
 *   { workflowId: workflow.id, type: 'gather.data', stage: 'gather', maxAttempts: 3 },
 *   { workflowId: workflow.id, type: 'process.data', stage: 'process', maxAttempts: 3 },
 * ]);
 * ```
 */
export function createDbState(db: Database): DbState {
  return {
    // =========================================================================
    // Workflow Operations
    // =========================================================================

    /**
     * Creates a new workflow record.
     *
     * @param data - Workflow creation data
     * @returns Created workflow record
     */
    async createWorkflow(data: CreateWorkflowData): Promise<Workflow> {
      const [workflow] = await db
        .insert(workflows)
        .values({
          type: data.type,
          context: data.context,
          templateVersion: data.templateVersion,
          jobId: data.jobId,
          status: 'pending',
        })
        .returning();

      if (!workflow) {
        throw new Error('Failed to create workflow');
      }

      return workflow;
    },

    /**
     * Gets a workflow by ID.
     *
     * @param id - Workflow ID
     * @returns Workflow record or null
     */
    async getWorkflow(id: string): Promise<Workflow | null> {
      const [workflow] = await db.select().from(workflows).where(eq(workflows.id, id)).limit(1);

      return workflow ?? null;
    },

    /**
     * Gets a workflow by pg-boss job ID.
     *
     * @param jobId - pg-boss job ID
     * @returns Workflow record or null
     */
    async getWorkflowByJobId(jobId: string): Promise<Workflow | null> {
      const [workflow] = await db.select().from(workflows).where(eq(workflows.jobId, jobId)).limit(1);

      return workflow ?? null;
    },

    /**
     * Updates workflow status.
     *
     * Also sets startedAt/completedAt timestamps as appropriate.
     *
     * @param id - Workflow ID
     * @param status - New status
     * @param error - Optional error message (for failed status)
     * @returns Updated workflow or null
     */
    async updateWorkflowStatus(
      id: string,
      status: WorkflowStatus,
      error?: string,
    ): Promise<Workflow | null> {
      const updates: Partial<NewWorkflow> = { status };

      if (status === 'active') {
        updates.startedAt = new Date();
      }

      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        updates.completedAt = new Date();
      }

      if (error) {
        updates.errorMessage = error;
      }

      const [workflow] = await db.update(workflows).set(updates).where(eq(workflows.id, id)).returning();

      return workflow ?? null;
    },

    /**
     * Updates the current stage of a workflow.
     *
     * @param id - Workflow ID
     * @param stage - Stage name
     * @returns Updated workflow or null
     */
    async updateWorkflowStage(id: string, stage: string): Promise<Workflow | null> {
      const [workflow] = await db
        .update(workflows)
        .set({ currentStage: stage })
        .where(eq(workflows.id, id))
        .returning();

      return workflow ?? null;
    },

    /**
     * Updates workflow context with merged data.
     *
     * Uses JSONB concatenation to merge new data with existing context.
     *
     * @param id - Workflow ID
     * @param context - Context data to merge
     * @returns Updated workflow or null
     */
    async updateWorkflowContext(id: string, context: WorkflowContext): Promise<Workflow | null> {
      const [workflow] = await db
        .update(workflows)
        .set({
          context: sql`${workflows.context} || ${JSON.stringify(context)}::jsonb`,
        })
        .where(eq(workflows.id, id))
        .returning();

      return workflow ?? null;
    },

    /**
     * Updates workflow checkpoint status.
     *
     * @param id - Workflow ID
     * @param checkpointStatus - Checkpoint status or null to clear
     * @returns Updated workflow or null
     */
    async updateWorkflowCheckpoint(
      id: string,
      checkpointStatus: string | null,
    ): Promise<Workflow | null> {
      const updates: Partial<NewWorkflow> = { checkpointStatus };

      if (checkpointStatus) {
        updates.status = 'paused';
      }

      const [workflow] = await db.update(workflows).set(updates).where(eq(workflows.id, id)).returning();

      return workflow ?? null;
    },

    /**
     * Sets the pg-boss job ID for a workflow.
     *
     * @param id - Workflow ID
     * @param jobId - pg-boss job ID
     * @returns Updated workflow or null
     */
    async setWorkflowJobId(id: string, jobId: string): Promise<Workflow | null> {
      const [workflow] = await db
        .update(workflows)
        .set({ jobId })
        .where(eq(workflows.id, id))
        .returning();

      return workflow ?? null;
    },

    /**
     * Lists workflows with optional filtering.
     *
     * @param options - List options
     * @returns Array of workflows
     */
    async listWorkflows(options?: ListWorkflowsOptions): Promise<Workflow[]> {
      const { type, status, limit = 100, offset = 0, order = 'desc' } = options ?? {};

      let query = db.select().from(workflows);

      const conditions = [];

      if (type) {
        conditions.push(eq(workflows.type, type));
      }

      if (status) {
        if (Array.isArray(status)) {
          conditions.push(inArray(workflows.status, status));
        } else {
          conditions.push(eq(workflows.status, status));
        }
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      query = query.orderBy(order === 'desc' ? desc(workflows.createdAt) : workflows.createdAt) as typeof query;
      query = query.limit(limit).offset(offset) as typeof query;

      return query;
    },

    // =========================================================================
    // Operation Operations
    // =========================================================================

    /**
     * Creates a new operation record.
     *
     * @param data - Operation creation data
     * @returns Created operation record
     */
    async createOperation(data: CreateOperationData): Promise<WorkflowOperation> {
      const [operation] = await db
        .insert(workflowOperations)
        .values({
          workflowId: data.workflowId,
          type: data.type,
          stage: data.stage,
          maxAttempts: data.maxAttempts,
          status: 'pending',
        })
        .returning();

      if (!operation) {
        throw new Error('Failed to create operation');
      }

      return operation;
    },

    /**
     * Creates multiple operation records in a batch.
     *
     * @param data - Array of operation creation data
     * @returns Created operation records
     */
    async createOperations(data: CreateOperationData[]): Promise<WorkflowOperation[]> {
      if (data.length === 0) {
        return [];
      }

      const operations = await db
        .insert(workflowOperations)
        .values(
          data.map((d) => ({
            workflowId: d.workflowId,
            type: d.type,
            stage: d.stage,
            maxAttempts: d.maxAttempts,
            status: 'pending' as const,
          })),
        )
        .returning();

      return operations;
    },

    /**
     * Gets an operation by ID.
     *
     * @param id - Operation ID
     * @returns Operation record or null
     */
    async getOperation(id: string): Promise<WorkflowOperation | null> {
      const [operation] = await db
        .select()
        .from(workflowOperations)
        .where(eq(workflowOperations.id, id))
        .limit(1);

      return operation ?? null;
    },

    /**
     * Gets all operations for a workflow.
     *
     * @param workflowId - Workflow ID
     * @returns Array of operations
     */
    async getOperationsByWorkflow(workflowId: string): Promise<WorkflowOperation[]> {
      return db
        .select()
        .from(workflowOperations)
        .where(eq(workflowOperations.workflowId, workflowId))
        .orderBy(workflowOperations.createdAt);
    },

    /**
     * Gets operations for a specific stage.
     *
     * @param workflowId - Workflow ID
     * @param stage - Stage name
     * @returns Array of operations
     */
    async getOperationsByStage(workflowId: string, stage: string): Promise<WorkflowOperation[]> {
      return db
        .select()
        .from(workflowOperations)
        .where(and(eq(workflowOperations.workflowId, workflowId), eq(workflowOperations.stage, stage)))
        .orderBy(workflowOperations.createdAt);
    },

    /**
     * Updates operation status.
     *
     * Also sets startedAt/completedAt timestamps as appropriate.
     *
     * @param id - Operation ID
     * @param status - New status
     * @param error - Optional error message
     * @returns Updated operation or null
     */
    async updateOperationStatus(
      id: string,
      status: OperationStatus,
      error?: string,
    ): Promise<WorkflowOperation | null> {
      const updates: Partial<NewWorkflowOperation> = { status };

      if (status === 'active') {
        updates.startedAt = new Date();
      }

      if (status === 'completed' || status === 'failed' || status === 'skipped') {
        updates.completedAt = new Date();
      }

      if (error) {
        updates.errorMessage = error;
      }

      const [operation] = await db
        .update(workflowOperations)
        .set(updates)
        .where(eq(workflowOperations.id, id))
        .returning();

      return operation ?? null;
    },

    /**
     * Updates operation result data.
     *
     * @param id - Operation ID
     * @param result - Result data
     * @returns Updated operation or null
     */
    async updateOperationResult(
      id: string,
      result: Record<string, unknown>,
    ): Promise<WorkflowOperation | null> {
      const [operation] = await db
        .update(workflowOperations)
        .set({ result, status: 'completed', completedAt: new Date() })
        .where(eq(workflowOperations.id, id))
        .returning();

      return operation ?? null;
    },

    /**
     * Increments the attempt counter for an operation.
     *
     * @param id - Operation ID
     * @returns Updated operation or null
     */
    async incrementOperationAttempts(id: string): Promise<WorkflowOperation | null> {
      const [operation] = await db
        .update(workflowOperations)
        .set({
          attempts: sql`${workflowOperations.attempts} + 1`,
        })
        .where(eq(workflowOperations.id, id))
        .returning();

      return operation ?? null;
    },

    /**
     * Deletes all operations for a workflow.
     *
     * Used during workflow retry to clean up previous attempt.
     *
     * @param workflowId - Workflow ID
     * @returns Number of deleted operations
     */
    async deleteOperationsByWorkflow(workflowId: string): Promise<number> {
      const result = await db
        .delete(workflowOperations)
        .where(eq(workflowOperations.workflowId, workflowId))
        .returning();

      return result.length;
    },

    // =========================================================================
    // Lock Operations
    // =========================================================================

    /**
     * Attempts to acquire a lock on an entity.
     *
     * Uses database unique constraint to ensure mutual exclusion.
     *
     * @param entityType - Type of entity
     * @param entityId - Entity ID
     * @param workflowId - Workflow requesting the lock
     * @param expiresAt - Optional expiration time
     * @returns True if lock was acquired
     */
    async acquireLock(
      entityType: string,
      entityId: string,
      workflowId: string,
      expiresAt?: Date,
    ): Promise<boolean> {
      try {
        await db.insert(workflowLocks).values({
          entityType,
          entityId,
          workflowId,
          expiresAt,
        });
        return true;
      } catch (error) {
        // Unique constraint violation means lock is held by another workflow
        if (error instanceof Error && error.message.includes('unique')) {
          return false;
        }
        throw error;
      }
    },

    /**
     * Releases a lock on an entity.
     *
     * @param entityType - Type of entity
     * @param entityId - Entity ID
     * @returns True if lock was released
     */
    async releaseLock(entityType: string, entityId: string): Promise<boolean> {
      const result = await db
        .delete(workflowLocks)
        .where(and(eq(workflowLocks.entityType, entityType), eq(workflowLocks.entityId, entityId)))
        .returning();

      return result.length > 0;
    },

    /**
     * Releases all locks held by a workflow.
     *
     * @param workflowId - Workflow ID
     * @returns Number of released locks
     */
    async releaseLocksByWorkflow(workflowId: string): Promise<number> {
      const result = await db
        .delete(workflowLocks)
        .where(eq(workflowLocks.workflowId, workflowId))
        .returning();

      return result.length;
    },

    /**
     * Gets lock information for an entity.
     *
     * @param entityType - Type of entity
     * @param entityId - Entity ID
     * @returns Lock record or null
     */
    async getLock(entityType: string, entityId: string): Promise<WorkflowLock | null> {
      const [lock] = await db
        .select()
        .from(workflowLocks)
        .where(and(eq(workflowLocks.entityType, entityType), eq(workflowLocks.entityId, entityId)))
        .limit(1);

      return lock ?? null;
    },

    /**
     * Cleans up expired locks.
     *
     * Should be called periodically to release stale locks.
     *
     * @returns Number of cleaned up locks
     */
    async cleanupExpiredLocks(): Promise<number> {
      const now = new Date();
      const result = await db
        .delete(workflowLocks)
        .where(and(isNotNull(workflowLocks.expiresAt), lt(workflowLocks.expiresAt, now)))
        .returning();

      return result.length;
    },
  };
}
