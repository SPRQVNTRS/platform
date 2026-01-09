import type {
  Logger,
  LogContext,
  LogEntry,
  LogLevel,
  BufferedLogger,
  BufferedLoggerOptions,
  FlushDestination,
} from '../types';

/**
 * Creates a buffered logger that wraps an existing logger
 * Logs are sent to the underlying logger AND buffered for later retrieval
 *
 * Key behavior: Child loggers share the parent's buffer
 *
 * @example
 * ```typescript
 * import { createLogger, createBufferedLogger, jsonDestination } from '@sprqvntrs/logger';
 *
 * const baseLogger = createLogger({ serviceName: 'my-service' });
 * const buffered = createBufferedLogger({ logger: baseLogger });
 *
 * buffered.info('Request started', { path: '/api/users' });
 *
 * // Child loggers contribute to parent's buffer
 * const childLogger = buffered.child({ userId: '123' });
 * childLogger.info('User action');
 *
 * // Get all logs (including child logs)
 * const logs = buffered.getBuffer();
 * // logs.length === 2
 *
 * // Flush to JSON and clear
 * const json = await buffered.flush(jsonDestination());
 * // buffered.bufferSize === 0
 * ```
 *
 * @example
 * // With auto-flush on buffer full
 * ```typescript
 * const buffered = createBufferedLogger({
 *   logger: baseLogger,
 *   maxBufferSize: 100,
 *   onBufferFull: async (entries) => {
 *     await sendToLogAggregator(entries);
 *   },
 * });
 * ```
 */
export function createBufferedLogger(options: BufferedLoggerOptions): BufferedLogger {
  const { logger, maxBufferSize, onBufferFull } = options;

  // Shared buffer that child loggers will also write to
  const buffer: LogEntry[] = [];

  // Track if we're currently flushing to prevent re-entrancy
  let isFlushing = false;

  /**
   * Adds an entry to the buffer and handles auto-flush if needed
   */
  async function addToBuffer(entry: LogEntry): Promise<void> {
    buffer.push(entry);

    // Check if we need to auto-flush
    if (maxBufferSize && buffer.length >= maxBufferSize && onBufferFull && !isFlushing) {
      isFlushing = true;
      try {
        const entriesToFlush = [...buffer];
        buffer.length = 0;
        await onBufferFull(entriesToFlush);
      } finally {
        isFlushing = false;
      }
    }
  }

  /**
   * Creates a log method that logs to the underlying logger and buffers
   */
  function createLogMethod(level: LogLevel, underlyingLogger: Logger) {
    return (message: string, context?: LogContext): void => {
      // Log to underlying logger
      underlyingLogger[level](message, context);

      // Add to shared buffer (fire and forget for sync interface)
      const entry: LogEntry = {
        level,
        message,
        context,
        timestamp: new Date(),
      };
      void addToBuffer(entry);
    };
  }

  /**
   * Creates a child buffered logger that shares the parent's buffer
   */
  function createChildBufferedLogger(
    childLogger: Logger,
    bindings: Record<string, unknown>
  ): Logger {
    // Note: Returns Logger, not BufferedLogger, because child should not
    // expose buffer manipulation methods (only parent controls the buffer)
    const child: Logger = {
      trace: (message: string, context?: LogContext): void => {
        childLogger.trace(message, context);
        void addToBuffer({
          level: 'trace',
          message,
          context: { ...bindings, ...context },
          timestamp: new Date(),
        });
      },
      debug: (message: string, context?: LogContext): void => {
        childLogger.debug(message, context);
        void addToBuffer({
          level: 'debug',
          message,
          context: { ...bindings, ...context },
          timestamp: new Date(),
        });
      },
      info: (message: string, context?: LogContext): void => {
        childLogger.info(message, context);
        void addToBuffer({
          level: 'info',
          message,
          context: { ...bindings, ...context },
          timestamp: new Date(),
        });
      },
      warn: (message: string, context?: LogContext): void => {
        childLogger.warn(message, context);
        void addToBuffer({
          level: 'warn',
          message,
          context: { ...bindings, ...context },
          timestamp: new Date(),
        });
      },
      error: (message: string, context?: LogContext): void => {
        childLogger.error(message, context);
        void addToBuffer({
          level: 'error',
          message,
          context: { ...bindings, ...context },
          timestamp: new Date(),
        });
      },
      fatal: (message: string, context?: LogContext): void => {
        childLogger.fatal(message, context);
        void addToBuffer({
          level: 'fatal',
          message,
          context: { ...bindings, ...context },
          timestamp: new Date(),
        });
      },
      child(moreBindings: Record<string, unknown>): Logger {
        const mergedBindings = { ...bindings, ...moreBindings };
        return createChildBufferedLogger(childLogger.child(moreBindings), mergedBindings);
      },
      get pino() {
        return childLogger.pino;
      },
    };
    return child;
  }

  const bufferedLogger: BufferedLogger = {
    trace: createLogMethod('trace', logger),
    debug: createLogMethod('debug', logger),
    info: createLogMethod('info', logger),
    warn: createLogMethod('warn', logger),
    error: createLogMethod('error', logger),
    fatal: createLogMethod('fatal', logger),

    child(bindings: Record<string, unknown>): Logger {
      const underlyingChild = logger.child(bindings);
      return createChildBufferedLogger(underlyingChild, bindings);
    },

    get pino() {
      return logger.pino;
    },

    getBuffer(): LogEntry[] {
      return [...buffer];
    },

    clearBuffer(): void {
      buffer.length = 0;
    },

    async flush<T>(destination: FlushDestination<T>): Promise<T> {
      const entriesToFlush = [...buffer];
      buffer.length = 0;
      return destination.flush(entriesToFlush);
    },

    get bufferSize(): number {
      return buffer.length;
    },
  };

  return bufferedLogger;
}
