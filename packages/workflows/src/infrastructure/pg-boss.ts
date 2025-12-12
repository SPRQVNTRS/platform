/**
 * pg-boss job queue infrastructure.
 *
 * This module provides the pg-boss setup and configuration for the workflow
 * orchestrator. It handles initialization, queue management, and graceful shutdown.
 *
 * @example
 * ```typescript
 * import { createBoss, getDefaultQueueConfig } from '@sprqvntrs/workflows';
 *
 * const boss = await createBoss({
 *   connectionString: process.env.DATABASE_URL,
 *   schema: 'pgboss',
 *   application: 'my-app',
 * });
 *
 * await boss.start();
 * ```
 */

import PgBoss from 'pg-boss';
import type { QueueConfig, QueueDefinition } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for pg-boss initialization.
 */
export interface PgBossConfig {
  /**
   * PostgreSQL connection string.
   */
  connectionString: string;

  /**
   * Schema name for pg-boss tables.
   * @default 'pgboss'
   */
  schema?: string;

  /**
   * Application name for PostgreSQL connection.
   */
  application?: string;

  /**
   * Whether to automatically create/migrate pg-boss schema.
   * @default true
   */
  migrate?: boolean;

  /**
   * Whether to enable debug logging.
   * @default false
   */
  debug?: boolean;

  /**
   * How long to retain completed jobs (in seconds).
   * @default 604800 (7 days)
   */
  retentionSeconds?: number;

  /**
   * How long to retain archived jobs (in seconds).
   * @default 604800 (7 days)
   */
  archiveSeconds?: number;

  /**
   * Interval for job maintenance (in seconds).
   * @default 120 (2 minutes)
   */
  maintenanceIntervalSeconds?: number;
}

/**
 * Job data structure for workflow jobs.
 */
export interface WorkflowJobData {
  /**
   * The workflow ID to process.
   */
  workflowId: string;

  /**
   * Workflow type for logging/debugging.
   */
  workflowType: string;

  /**
   * When the job was created.
   */
  createdAt: string;
}

/**
 * Job handler function signature.
 */
export type JobHandler<T = WorkflowJobData> = (job: PgBoss.Job<T>) => Promise<void>;

/**
 * Batch job handler function signature.
 */
export type BatchJobHandler<T = WorkflowJobData> = (jobs: PgBoss.Job<T>[]) => Promise<void>;

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default queue configuration values.
 *
 * These defaults are used when no specific configuration is provided.
 *
 * @example
 * ```typescript
 * const config = {
 *   ...DEFAULT_QUEUE_CONFIG,
 *   retryLimit: 5, // Override retry limit
 * };
 * ```
 */
export const DEFAULT_QUEUE_CONFIG: Required<QueueConfig> = {
  retryLimit: 3,
  retryDelay: 5,
  retryBackoff: true,
  expireInSeconds: 3600,
  retentionSeconds: 86400,
};

/**
 * Default pg-boss configuration values.
 */
export const DEFAULT_PGBOSS_CONFIG: Required<Omit<PgBossConfig, 'connectionString'>> = {
  schema: 'pgboss',
  application: 'workflow-orchestrator',
  migrate: true,
  debug: false,
  retentionSeconds: 604800,
  archiveSeconds: 604800,
  maintenanceIntervalSeconds: 120,
};

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Creates and configures a pg-boss instance.
 *
 * This function creates a new pg-boss instance with the provided configuration.
 * The instance must be started with `boss.start()` before use.
 *
 * @param config - pg-boss configuration
 * @returns Configured pg-boss instance (not yet started)
 *
 * @example
 * ```typescript
 * const boss = createBoss({
 *   connectionString: 'postgresql://localhost/mydb',
 *   schema: 'pgboss',
 *   application: 'my-worker',
 * });
 *
 * // Start the boss
 * await boss.start();
 *
 * // Register workers...
 *
 * // Graceful shutdown
 * process.on('SIGTERM', async () => {
 *   await boss.stop();
 * });
 * ```
 */
export function createBoss(config: PgBossConfig): PgBoss {
  const fullConfig = {
    ...DEFAULT_PGBOSS_CONFIG,
    ...config,
  };

  return new PgBoss({
    connectionString: fullConfig.connectionString,
    schema: fullConfig.schema,
    application_name: fullConfig.application,
    migrate: fullConfig.migrate,
    // Retention settings
    retentionMinutes: Math.floor(fullConfig.retentionSeconds / 60),
    archiveCompletedAfterSeconds: fullConfig.archiveSeconds,
    // Maintenance
    maintenanceIntervalSeconds: fullConfig.maintenanceIntervalSeconds,
    // Monitoring
    monitorStateIntervalSeconds: fullConfig.debug ? 30 : undefined,
  });
}

/**
 * Gets the queue configuration for a specific queue.
 *
 * Merges default configuration with queue-specific overrides.
 *
 * @param queueConfig - Optional queue-specific configuration
 * @returns Complete queue configuration
 *
 * @example
 * ```typescript
 * const config = getQueueConfig({ retryLimit: 5 });
 * // Returns: { retryLimit: 5, retryDelay: 5, retryBackoff: true, ... }
 * ```
 */
export function getQueueConfig(queueConfig?: QueueConfig): Required<QueueConfig> {
  return {
    ...DEFAULT_QUEUE_CONFIG,
    ...queueConfig,
  };
}

/**
 * Creates pg-boss send options from queue configuration.
 *
 * Converts our QueueConfig to pg-boss SendOptions format.
 *
 * @param config - Queue configuration
 * @param overrides - Additional send options
 * @returns pg-boss SendOptions
 *
 * @example
 * ```typescript
 * const sendOptions = createSendOptions(
 *   { retryLimit: 3, retryDelay: 10 },
 *   { priority: 5 }
 * );
 * await boss.send('my-queue', data, sendOptions);
 * ```
 */
export function createSendOptions(
  config: QueueConfig,
  overrides?: Partial<PgBoss.SendOptions>,
): PgBoss.SendOptions {
  const fullConfig = getQueueConfig(config);

  const baseOptions: PgBoss.SendOptions = {
    retryLimit: fullConfig.retryLimit,
    retryDelay: fullConfig.retryDelay,
    retryBackoff: fullConfig.retryBackoff,
    expireInSeconds: fullConfig.expireInSeconds,
    retentionSeconds: fullConfig.retentionSeconds,
  };

  // Filter out undefined values from overrides to prevent pg-boss validation errors
  // (e.g., "priority must be an integer" when priority is undefined)
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined) {
        (baseOptions as Record<string, unknown>)[key] = value;
      }
    }
  }

  return baseOptions;
}

/**
 * Creates pg-boss work options from queue definition.
 *
 * Converts our QueueDefinition to pg-boss WorkOptions format.
 *
 * @param queue - Queue definition
 * @returns pg-boss WorkOptions
 *
 * @example
 * ```typescript
 * const workOptions = createWorkOptions({ name: 'my-queue', workers: 5 });
 * await boss.work('my-queue', workOptions, handler);
 * ```
 */
export function createWorkOptions(queue: QueueDefinition): PgBoss.WorkOptions {
  return {
    batchSize: queue.batchSize ?? 1,
    pollingIntervalSeconds: Math.floor((queue.pollingIntervalMs ?? 2000) / 1000),
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Registers a worker for a specific queue.
 *
 * Convenience function that combines work options creation with registration.
 *
 * @param boss - pg-boss instance
 * @param queue - Queue definition
 * @param handler - Job handler function
 * @returns Worker ID for unsubscribing
 *
 * @example
 * ```typescript
 * const workerId = await registerWorker(boss, { name: 'default', workers: 5 }, async (job) => {
 *   console.log('Processing job:', job.data);
 * });
 * ```
 */
export async function registerWorker<T = WorkflowJobData>(
  boss: PgBoss,
  queue: QueueDefinition,
  handler: JobHandler<T>,
): Promise<string> {
  const options = createWorkOptions(queue);
  return boss.work<T>(queue.name, options, async ([job]) => {
    if (job) {
      await handler(job);
    }
  });
}

/**
 * Registers a batch worker for a specific queue.
 *
 * For queues that benefit from processing multiple jobs at once.
 *
 * @param boss - pg-boss instance
 * @param queue - Queue definition
 * @param handler - Batch job handler function
 * @returns Worker ID for unsubscribing
 *
 * @example
 * ```typescript
 * const workerId = await registerBatchWorker(boss, { name: 'bulk', batchSize: 10 }, async (jobs) => {
 *   console.log(`Processing ${jobs.length} jobs`);
 * });
 * ```
 */
export async function registerBatchWorker<T = WorkflowJobData>(
  boss: PgBoss,
  queue: QueueDefinition,
  handler: BatchJobHandler<T>,
): Promise<string> {
  const options = createWorkOptions(queue);
  return boss.work<T>(queue.name, options, handler);
}

/**
 * Schedules a recurring job using cron expression.
 *
 * Wrapper around pg-boss schedule that handles unscheduling and rescheduling.
 *
 * @param boss - pg-boss instance
 * @param name - Unique schedule name
 * @param cron - Cron expression
 * @param queueName - Queue to send jobs to
 * @param data - Data to include in each job
 * @param options - Additional schedule options
 *
 * @example
 * ```typescript
 * // Schedule daily cleanup at 4 AM UTC
 * await scheduleRecurring(boss, 'daily-cleanup', '0 4 * * *', 'cleanup', {
 *   scope: 'all',
 * });
 * ```
 */
export async function scheduleRecurring<T extends object>(
  boss: PgBoss,
  name: string,
  cron: string,
  _queueName: string,
  data?: T,
  options?: PgBoss.ScheduleOptions,
): Promise<void> {
  // Unschedule first to ensure latest config is used
  await boss.unschedule(name);
  await boss.schedule(name, cron, data ?? {}, {
    ...options,
    tz: options?.tz ?? 'UTC',
  });
}

/**
 * Unschedules a recurring job.
 *
 * @param boss - pg-boss instance
 * @param name - Schedule name to remove
 *
 * @example
 * ```typescript
 * await unschedule(boss, 'daily-cleanup');
 * ```
 */
export async function unschedule(boss: PgBoss, name: string): Promise<void> {
  await boss.unschedule(name);
}

/**
 * Gets information about a job by ID.
 *
 * @param boss - pg-boss instance
 * @param jobId - Job ID to look up
 * @returns Job information or null if not found
 *
 * @example
 * ```typescript
 * const job = await getJob(boss, 'some-job-id');
 * if (job) {
 *   console.log('Job state:', job.state);
 * }
 * ```
 */
export async function getJob<T = WorkflowJobData>(
  boss: PgBoss,
  queueName: string,
  jobId: string,
): Promise<PgBoss.JobWithMetadata<T> | null> {
  return boss.getJobById<T>(queueName, jobId);
}

/**
 * Cancels a job by ID.
 *
 * Only works for jobs that haven't started yet.
 *
 * @param boss - pg-boss instance
 * @param jobId - Job ID to cancel
 * @returns True if job was cancelled
 *
 * @example
 * ```typescript
 * const cancelled = await cancelJob(boss, 'some-job-id');
 * if (cancelled) {
 *   console.log('Job cancelled successfully');
 * }
 * ```
 */
export async function cancelJob(boss: PgBoss, queueName: string, jobId: string): Promise<void> {
  await boss.cancel(queueName, jobId);
}

/**
 * Resumes a job by ID.
 *
 * Only works for jobs that are in a cancelled or failed state.
 *
 * @param boss - pg-boss instance
 * @param jobId - Job ID to resume
 *
 * @example
 * ```typescript
 * await resumeJob(boss, 'some-job-id');
 * ```
 */
export async function resumeJob(boss: PgBoss, queueName: string, jobId: string): Promise<void> {
  await boss.resume(queueName, jobId);
}

// =============================================================================
// Lifecycle Helpers
// =============================================================================

/**
 * Sets up graceful shutdown handlers.
 *
 * Registers SIGTERM and SIGINT handlers to stop pg-boss gracefully.
 *
 * @param boss - pg-boss instance
 * @param options - Shutdown options
 *
 * @example
 * ```typescript
 * const boss = createBoss({ connectionString: '...' });
 * await boss.start();
 *
 * setupGracefulShutdown(boss, {
 *   timeout: 30000,
 *   onShutdown: () => console.log('Shutting down...'),
 * });
 * ```
 */
export function setupGracefulShutdown(
  boss: PgBoss,
  options?: {
    /**
     * Maximum time to wait for jobs to complete (ms).
     * @default 30000
     */
    timeout?: number;
    /**
     * Callback when shutdown starts.
     */
    onShutdown?: () => void;
    /**
     * Callback when shutdown completes.
     */
    onComplete?: () => void;
  },
): void {
  const { timeout = 30000, onShutdown, onComplete } = options ?? {};

  let isShuttingDown = false;

  const shutdown = async (_signal: string): Promise<void> => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    onShutdown?.();

    // Set up timeout for forceful exit
    const forceExitTimeout = setTimeout(() => {
      console.error(`Shutdown timeout (${timeout}ms) exceeded, forcing exit`);
      process.exit(1);
    }, timeout);

    try {
      await boss.stop({ graceful: true, timeout });
      clearTimeout(forceExitTimeout);
      onComplete?.();
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimeout);
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// =============================================================================
// Event Helpers
// =============================================================================

/**
 * Event types emitted by pg-boss.
 */
export type PgBossEvent = 'error' | 'monitor-states' | 'wip' | 'stopped';

/**
 * Sets up event listeners for monitoring.
 *
 * @param boss - pg-boss instance
 * @param handlers - Event handlers
 *
 * @example
 * ```typescript
 * setupEventListeners(boss, {
 *   onError: (error) => console.error('pg-boss error:', error),
 *   onMonitorStates: (states) => metrics.gauge('pgboss.active', states.active),
 * });
 * ```
 */
export function setupEventListeners(
  boss: PgBoss,
  handlers: {
    /**
     * Called when an error occurs.
     */
    onError?: (error: Error) => void;
    /**
     * Called periodically with job state counts.
     */
    onMonitorStates?: (states: PgBoss.MonitorStates) => void;
    /**
     * Called when boss stops.
     */
    onStopped?: () => void;
  },
): void {
  if (handlers.onError) {
    boss.on('error', handlers.onError);
  }

  if (handlers.onMonitorStates) {
    boss.on('monitor-states', handlers.onMonitorStates);
  }

  if (handlers.onStopped) {
    boss.on('stopped', handlers.onStopped);
  }
}
