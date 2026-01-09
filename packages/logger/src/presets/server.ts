import { createLogger } from '../core/logger';
import type { Logger, ServerLogger, CreateLoggerOptions, LogLevel } from '../types';

/**
 * Options for creating a server logger
 */
export interface CreateServerLoggerOptions extends Omit<CreateLoggerOptions, 'serviceName'> {
  /** Service name (required) */
  serviceName: string;
  /** Whether to register global error handlers (default: false) */
  registerGlobalHandlers?: boolean;
}

/**
 * Creates a server logger with lifecycle logging methods
 *
 * @example
 * ```typescript
 * import { createServerLogger } from '@sprqvntrs/logger/server';
 *
 * const { logger, logServerStart, logShutdown, logServerClosed } =
 *   createServerLogger({ serviceName: 'api' });
 *
 * const server = app.listen(3000, () => {
 *   logServerStart(3000, { url: 'http://localhost:3000' });
 * });
 *
 * process.on('SIGTERM', () => {
 *   logShutdown('SIGTERM');
 *   server.close(() => logServerClosed());
 * });
 * ```
 */
export function createServerLogger(options: CreateServerLoggerOptions): ServerLogger {
  const { serviceName, registerGlobalHandlers, ...loggerOptions } = options;
  const logger = createLogger({ serviceName, ...loggerOptions });

  const serverLogger: ServerLogger = {
    logger,

    logServerStart(port: number, metadata?: Record<string, unknown>): void {
      logger.info(`${serviceName} started`, {
        port,
        pid: process.pid,
        nodeVersion: process.version,
        ...metadata,
      });
    },

    logShutdown(signal: string): void {
      logger.info(`${serviceName} received shutdown signal`, { signal });
    },

    logServerClosed(): void {
      logger.info(`${serviceName} server closed`);
    },

    logUncaughtException(error: Error): void {
      logger.fatal(`${serviceName} uncaught exception`, { error });
    },

    logUnhandledRejection(reason: unknown): void {
      logger.error(`${serviceName} unhandled rejection`, {
        error: reason instanceof Error ? reason : String(reason),
      });
    },
  };

  // Optionally register global error handlers
  if (registerGlobalHandlers) {
    process.on('uncaughtException', (error) => {
      serverLogger.logUncaughtException(error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      serverLogger.logUnhandledRejection(reason);
    });
  }

  return serverLogger;
}

/**
 * Standalone server lifecycle logging functions
 * For when you want to use an existing logger
 */
export function createLifecycleLoggers(logger: Logger, serviceName: string) {
  return {
    logServerStart: (port: number, metadata?: Record<string, unknown>) => {
      logger.info(`${serviceName} started`, {
        port,
        pid: process.pid,
        nodeVersion: process.version,
        ...metadata,
      });
    },

    logShutdown: (signal: string) => {
      logger.info(`${serviceName} received shutdown signal`, { signal });
    },

    logServerClosed: () => {
      logger.info(`${serviceName} server closed`);
    },

    logUncaughtException: (error: Error) => {
      logger.fatal(`${serviceName} uncaught exception`, { error });
    },

    logUnhandledRejection: (reason: unknown) => {
      logger.error(`${serviceName} unhandled rejection`, {
        error: reason instanceof Error ? reason : String(reason),
      });
    },
  };
}

/**
 * Creates a worker/background job logger with job-specific logging
 *
 * @example
 * ```typescript
 * const { logger, logJobStart, logJobComplete, logJobFailed } =
 *   createWorkerLogger({ serviceName: 'background-worker' });
 *
 * async function processJob(job: Job) {
 *   const startTime = Date.now();
 *   logJobStart(job.id, job.type);
 *
 *   try {
 *     await executeJob(job);
 *     logJobComplete(job.id, job.type, Date.now() - startTime);
 *   } catch (error) {
 *     logJobFailed(job.id, job.type, error);
 *     throw error;
 *   }
 * }
 * ```
 */
export function createWorkerLogger(options: CreateServerLoggerOptions) {
  const { serviceName, ...loggerOptions } = options;
  const logger = createLogger({ serviceName, ...loggerOptions });

  return {
    logger,

    logJobStart: (jobId: string, jobType: string, metadata?: Record<string, unknown>) => {
      logger.info('Job started', { jobId, jobType, ...metadata });
    },

    logJobComplete: (
      jobId: string,
      jobType: string,
      durationMs: number,
      metadata?: Record<string, unknown>
    ) => {
      logger.info('Job completed', {
        jobId,
        jobType,
        duration: durationMs,
        ...metadata,
      });
    },

    logJobFailed: (
      jobId: string,
      jobType: string,
      error: unknown,
      metadata?: Record<string, unknown>
    ) => {
      logger.error('Job failed', {
        jobId,
        jobType,
        error: error instanceof Error ? error : String(error),
        ...metadata,
      });
    },

    logJobRetry: (
      jobId: string,
      jobType: string,
      attempt: number,
      maxAttempts: number,
      error: unknown
    ) => {
      logger.warn('Job retry', {
        jobId,
        jobType,
        attempt,
        maxAttempts,
        error: error instanceof Error ? error : String(error),
      });
    },
  };
}

/**
 * Log level appropriate for different HTTP status codes
 * Useful for custom log level functions
 */
export function getLogLevelForStatus(statusCode: number): LogLevel {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
}
