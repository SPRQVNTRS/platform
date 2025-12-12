/**
 * pg-boss introspection queries.
 *
 * This module provides utility functions for querying pg-boss internal tables
 * directly, useful for debugging, monitoring, and administration without
 * needing a separate database client.
 *
 * @example
 * ```typescript
 * import { createPgBossQueries } from '@sprqvntrs/workflows';
 * import { Pool } from 'pg';
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const queries = createPgBossQueries(pool);
 *
 * // Get job statistics
 * const stats = await queries.getJobStats();
 * console.log(stats);
 *
 * // Get all schedules
 * const schedules = await queries.getSchedules();
 *
 * // Get recent job history for specific queues
 * const history = await queries.getJobHistory(['content-generation', 'data-sync']);
 * ```
 */

import type { Pool, PoolClient } from 'pg';

// =============================================================================
// Types
// =============================================================================

/**
 * pg-boss job states.
 */
export type PgBossJobState = 'created' | 'active' | 'retry' | 'completed' | 'failed' | 'cancelled';

/**
 * pg-boss archive job states (terminal states).
 */
export type PgBossArchiveState = 'completed' | 'failed' | 'expired' | 'cancelled';

/**
 * Simplified job item from pgboss.job table.
 */
export interface PgBossJobItem {
  id: string;
  name: string;
  state: PgBossJobState;
}

/**
 * Job statistics grouped by queue name and state.
 */
export interface PgBossJobStats {
  name: string;
  state: PgBossJobState;
  count: number;
}

/**
 * Schedule item from pgboss.schedule table.
 */
export interface PgBossScheduleItem {
  name: string;
  cron: string;
  timezone: string | null;
  data: Record<string, unknown> | null;
  created_on: Date;
  updated_on: Date;
}

/**
 * Archive item from pgboss.archive table.
 */
export interface PgBossArchiveItem {
  id: string;
  name: string;
  state: PgBossArchiveState;
  output: Record<string, unknown> | null;
  completed_on: Date;
}

/**
 * Result of deleting workflow jobs.
 */
export interface DeleteWorkflowJobsResult {
  cancelledCount: number;
  deletedCount: number;
}

/**
 * pg-boss query interface.
 */
export interface PgBossQueries {
  /**
   * Gets all jobs from pgboss.job table.
   * Returns simplified job items with id, name, and state.
   */
  getJobs: () => Promise<PgBossJobItem[]>;

  /**
   * Gets job statistics grouped by queue name and state.
   * Useful for monitoring job distribution across queues.
   */
  getJobStats: () => Promise<PgBossJobStats[]>;

  /**
   * Gets all schedules from pgboss.schedule table.
   * Returns schedules sorted by creation time (newest first).
   */
  getSchedules: () => Promise<PgBossScheduleItem[]>;

  /**
   * Gets job history from pgboss.archive for given queue names.
   * Returns up to 50 most recent archived jobs.
   *
   * @param names - Queue names to filter by
   */
  getJobHistory: (names: string[]) => Promise<PgBossArchiveItem[]>;

  /**
   * Cancels and deletes all jobs associated with a workflow ID.
   * Searches jobs where data.workflowId matches the given ID.
   *
   * @param workflowId - Workflow ID to cancel/delete jobs for
   */
  deleteWorkflowJobs: (workflowId: string) => Promise<DeleteWorkflowJobsResult>;
}

/**
 * Configuration for pg-boss queries.
 */
export interface PgBossQueriesConfig {
  /**
   * pg-boss schema name.
   * @default 'pgboss'
   */
  schema?: string;
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Creates a pg-boss queries instance.
 *
 * Provides utility functions for introspecting pg-boss internal tables
 * directly via raw SQL queries. Useful for debugging and monitoring.
 *
 * @param pool - PostgreSQL connection pool
 * @param config - Optional configuration
 * @returns pg-boss queries interface
 *
 * @example
 * ```typescript
 * import { createPgBossQueries } from '@sprqvntrs/workflows';
 * import { Pool } from 'pg';
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const queries = createPgBossQueries(pool);
 *
 * // Monitor active jobs
 * const stats = await queries.getJobStats();
 * const activeJobs = stats.filter(s => s.state === 'active');
 * console.log('Active jobs by queue:', activeJobs);
 *
 * // Check schedules
 * const schedules = await queries.getSchedules();
 * console.log('Configured schedules:', schedules.map(s => s.name));
 *
 * // View recent failures for a queue
 * const history = await queries.getJobHistory(['my-workflow-queue']);
 * const failures = history.filter(h => h.state === 'failed');
 * console.log('Recent failures:', failures);
 *
 * // Clean up jobs for a cancelled workflow
 * const result = await queries.deleteWorkflowJobs('workflow-123');
 * console.log(`Cancelled ${result.cancelledCount}, deleted ${result.deletedCount} jobs`);
 * ```
 */
export function createPgBossQueries(
  pool: Pool | PoolClient,
  config?: PgBossQueriesConfig,
): PgBossQueries {
  const schema = config?.schema ?? 'pgboss';

  return {
    async getJobs(): Promise<PgBossJobItem[]> {
      const result = await pool.query<PgBossJobItem>(
        `SELECT id, name, state FROM ${schema}.job ORDER BY createdon DESC`,
      );
      return result.rows;
    },

    async getJobStats(): Promise<PgBossJobStats[]> {
      const result = await pool.query<PgBossJobStats>(
        `SELECT name, state, COUNT(*)::int as count
         FROM ${schema}.job
         GROUP BY name, state
         ORDER BY name, state`,
      );
      return result.rows;
    },

    async getSchedules(): Promise<PgBossScheduleItem[]> {
      const result = await pool.query<PgBossScheduleItem>(
        `SELECT name, cron, timezone, data, created_on, updated_on
         FROM ${schema}.schedule
         ORDER BY created_on DESC`,
      );
      return result.rows;
    },

    async getJobHistory(names: string[]): Promise<PgBossArchiveItem[]> {
      if (names.length === 0) {
        return [];
      }

      const result = await pool.query<PgBossArchiveItem>(
        `SELECT id, name, state, output, completedon as completed_on
         FROM ${schema}.archive
         WHERE name = ANY($1::text[])
         ORDER BY completedon DESC
         LIMIT 50`,
        [names],
      );
      return result.rows;
    },

    async deleteWorkflowJobs(workflowId: string): Promise<DeleteWorkflowJobsResult> {
      // Cancel active/pending jobs for this workflow
      const cancelResult = await pool.query(
        `UPDATE ${schema}.job
         SET state = 'cancelled'
         WHERE data::jsonb ? 'workflowId'
         AND (data::jsonb->>'workflowId') = $1
         AND state NOT IN ('completed', 'failed', 'cancelled')
         RETURNING id`,
        [workflowId],
      );

      // Delete all jobs for this workflow (including completed/failed ones)
      const deleteResult = await pool.query(
        `DELETE FROM ${schema}.job
         WHERE data::jsonb ? 'workflowId'
         AND (data::jsonb->>'workflowId') = $1
         RETURNING id`,
        [workflowId],
      );

      return {
        cancelledCount: cancelResult.rowCount ?? 0,
        deletedCount: deleteResult.rowCount ?? 0,
      };
    },
  };
}
