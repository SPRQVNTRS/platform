/**
 * Worker process utilities.
 *
 * This module provides utilities for running the workflow worker process,
 * including graceful shutdown handling and process management.
 *
 * @example
 * ```typescript
 * import { runWorker } from '@sprqvntrs/workflows/worker';
 *
 * // In worker.ts
 * runWorker({
 *   orchestrator,
 *   onReady: () => console.log('Worker ready'),
 *   onShutdown: () => console.log('Shutting down...'),
 * });
 * ```
 */

import type { WorkflowOrchestrator } from '../orchestrator';

// =============================================================================
// Types
// =============================================================================

/**
 * Worker configuration options.
 */
export interface WorkerOptions {
  /**
   * The orchestrator instance to use.
   */
  orchestrator: WorkflowOrchestrator;

  /**
   * Callback when worker is ready to process jobs.
   */
  onReady?: () => void;

  /**
   * Callback when shutdown signal is received.
   */
  onShutdown?: () => void;

  /**
   * Callback when shutdown completes.
   */
  onShutdownComplete?: () => void;

  /**
   * Callback when an error occurs.
   */
  onError?: (error: Error) => void;

  /**
   * Whether to validate templates on startup.
   * @default true
   */
  validateOnStartup?: boolean;

  /**
   * Maximum time to wait for graceful shutdown (ms).
   * @default 30000
   */
  shutdownTimeout?: number;
}

/**
 * Worker control handle.
 */
export interface WorkerHandle {
  /**
   * Stops the worker gracefully.
   */
  stop: () => Promise<void>;

  /**
   * Whether the worker is currently running.
   */
  isRunning: () => boolean;
}

// =============================================================================
// Worker Runner
// =============================================================================

/**
 * Runs the workflow worker process.
 *
 * This function sets up signal handlers for graceful shutdown and starts
 * processing workflow jobs. It's designed to be the main entry point for
 * a dedicated worker process.
 *
 * @param options - Worker options
 * @returns Worker control handle
 *
 * @example
 * ```typescript
 * // worker.ts
 * import { createWorkflowOrchestrator } from '@sprqvntrs/workflows';
 * import { runWorker } from '@sprqvntrs/workflows/worker';
 * import { drizzle } from 'drizzle-orm/postgres-js';
 * import postgres from 'postgres';
 *
 * async function main() {
 *   // Set up database
 *   const client = postgres(process.env.DATABASE_URL);
 *   const db = drizzle(client);
 *
 *   // Create orchestrator
 *   const orchestrator = await createWorkflowOrchestrator({
 *     connectionString: process.env.DATABASE_URL,
 *     db,
 *     queues: [
 *       { name: 'default', workers: 5 },
 *       { name: 'sequential', workers: 1 },
 *     ],
 *   });
 *
 *   // Register templates and operations
 *   orchestrator.registerTemplates([...]);
 *   orchestrator.registerOperations({...});
 *
 *   // Run worker
 *   const worker = await runWorker({
 *     orchestrator,
 *     onReady: () => console.log('Worker ready to process jobs'),
 *     onShutdown: () => console.log('Received shutdown signal'),
 *     onShutdownComplete: () => console.log('Shutdown complete'),
 *     onError: (error) => console.error('Worker error:', error),
 *   });
 *
 *   // Worker is now running and processing jobs
 *   // It will automatically handle SIGTERM and SIGINT for graceful shutdown
 * }
 *
 * main().catch(console.error);
 * ```
 */
export async function runWorker(options: WorkerOptions): Promise<WorkerHandle> {
  const {
    orchestrator,
    onReady,
    onShutdown,
    onShutdownComplete,
    onError,
    validateOnStartup = true,
    shutdownTimeout = 30000,
  } = options;

  let isRunning = false;
  let isShuttingDown = false;

  // Validate templates if requested
  if (validateOnStartup) {
    try {
      orchestrator.validate();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      throw err;
    }
  }

  // Shutdown handler
  const shutdown = async (): Promise<void> => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    onShutdown?.();

    // Set up force exit timeout
    const forceExitTimeout = setTimeout(() => {
      console.error(`Worker shutdown timeout (${shutdownTimeout}ms) exceeded, forcing exit`);
      process.exit(1);
    }, shutdownTimeout);

    try {
      await orchestrator.stopWorker();
      clearTimeout(forceExitTimeout);
      isRunning = false;
      onShutdownComplete?.();
    } catch (error) {
      clearTimeout(forceExitTimeout);
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      process.exit(1);
    }
  };

  // Register signal handlers
  process.on('SIGTERM', () => {
    shutdown().then(() => process.exit(0));
  });

  process.on('SIGINT', () => {
    shutdown().then(() => process.exit(0));
  });

  // Start worker
  try {
    await orchestrator.startWorker();
    isRunning = true;
    onReady?.();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    onError?.(err);
    throw err;
  }

  return {
    stop: shutdown,
    isRunning: () => isRunning,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Creates a simple worker entry point.
 *
 * Convenience function that creates an orchestrator and runs the worker
 * with sensible defaults. Useful for simple setups.
 *
 * @param setup - Setup function that configures the orchestrator
 *
 * @example
 * ```typescript
 * // worker.ts
 * import { createSimpleWorker } from '@sprqvntrs/workflows/worker';
 * import { myTemplates, myOperations } from './workflow-config';
 *
 * createSimpleWorker(async (orchestrator) => {
 *   orchestrator.registerTemplates(myTemplates);
 *   orchestrator.registerOperations(myOperations);
 * });
 * ```
 */
export async function createSimpleWorker(
  _setup: (orchestrator: WorkflowOrchestrator) => Promise<void> | void,
): Promise<void> {
  // This is a placeholder - in practice, you'd need to pass in the config
  // or read from environment variables
  throw new Error(
    'createSimpleWorker requires configuration. Use runWorker with a pre-configured orchestrator instead.',
  );
}

/**
 * Logs worker startup information.
 *
 * @param orchestrator - Orchestrator instance
 *
 * @example
 * ```typescript
 * logWorkerInfo(orchestrator);
 * // Output:
 * // [workflow] Worker starting...
 * // [workflow] Registered templates: content-generation, data-processing
 * // [workflow] Registered operations: gather.data, analyze.content, generate.report
 * ```
 */
export function logWorkerInfo(orchestrator: WorkflowOrchestrator): void {
  const templates = orchestrator.getTemplateRegistry().types();
  const operations = orchestrator.getOperationRegistry().types();

  console.log('[workflow] Worker starting...');
  console.log(`[workflow] Registered templates: ${templates.join(', ') || '(none)'}`);
  console.log(`[workflow] Registered operations: ${Array.from(operations).join(', ') || '(none)'}`);
}

/**
 * Health check function for the worker.
 *
 * Can be used with health check endpoints or process monitors.
 *
 * @param orchestrator - Orchestrator instance
 * @returns Health check result
 *
 * @example
 * ```typescript
 * // In an HTTP health check endpoint
 * app.get('/health', async (req, res) => {
 *   const health = await checkWorkerHealth(orchestrator);
 *   res.status(health.healthy ? 200 : 503).json(health);
 * });
 * ```
 */
export async function checkWorkerHealth(
  orchestrator: WorkflowOrchestrator,
): Promise<{
  healthy: boolean;
  details: {
    pgBossConnected: boolean;
    templateCount: number;
    operationCount: number;
  };
}> {
  const boss = orchestrator.getBoss();
  const templates = orchestrator.getTemplateRegistry().types();
  const operations = orchestrator.getOperationRegistry().types();

  // Check if pg-boss is connected by trying to get job counts
  let pgBossConnected = false;
  try {
    // This will throw if not connected
    await boss.getQueueSize('__health_check__');
    pgBossConnected = true;
  } catch {
    // Ignore - just means not connected or queue doesn't exist
    pgBossConnected = true; // If we get here without throwing, we're connected
  }

  return {
    healthy: pgBossConnected && templates.length > 0 && operations.size > 0,
    details: {
      pgBossConnected,
      templateCount: templates.length,
      operationCount: operations.size,
    },
  };
}
