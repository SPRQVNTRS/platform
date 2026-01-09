import type { Logger as PinoLogger, Level } from 'pino';

/**
 * Log levels supported by the logger
 */
export type LogLevel = Level;

/**
 * Context object passed to logging methods
 * Supports any additional properties for structured logging
 */
export interface LogContext {
  [key: string]: unknown;
  /** Optional error object or message */
  error?: Error | string;
  /** Optional operation/request duration in milliseconds */
  duration?: number;
  /** Optional request ID for tracing */
  requestId?: string;
}

/**
 * Options for creating a new logger instance
 */
export interface CreateLoggerOptions {
  /** Service name to include in all logs */
  serviceName: string;
  /** Log level (defaults to 'info' or LOG_LEVEL env var) */
  level?: LogLevel;
  /** Service version (defaults to npm_package_version env var) */
  version?: string;
  /** Enable pretty printing (auto-detects from NODE_ENV if not set) */
  pretty?: boolean;
  /** Additional paths to redact from logs */
  redactPaths?: string[];
  /** Additional base fields to include in all logs */
  base?: Record<string, unknown>;
  /** Enable timestamp in logs (default: true) */
  timestamp?: boolean;
}

/**
 * Logger interface that wraps Pino with a simpler API
 */
export interface Logger {
  /** Log at trace level */
  trace(message: string, context?: LogContext): void;
  /** Log at debug level */
  debug(message: string, context?: LogContext): void;
  /** Log at info level */
  info(message: string, context?: LogContext): void;
  /** Log at warn level */
  warn(message: string, context?: LogContext): void;
  /** Log at error level */
  error(message: string, context?: LogContext): void;
  /** Log at fatal level */
  fatal(message: string, context?: LogContext): void;

  /**
   * Create a child logger with additional bound context
   * All logs from the child will include the bound context
   */
  child(bindings: Record<string, unknown>): Logger;

  /** Access the underlying Pino logger instance for advanced use */
  readonly pino: PinoLogger;
}

/**
 * Options for configuring the static Logger class
 */
export interface LoggerConfigureOptions {
  /** Service name for the static logger */
  serviceName: string;
  /** Log level */
  level?: LogLevel;
  /** Enable pretty printing */
  pretty?: boolean;
  /** Additional base fields */
  base?: Record<string, unknown>;
}

/**
 * Options for HTTP logging middleware
 */
export interface HttpLoggerOptions {
  /** Logger instance to use */
  logger?: Logger;
  /** Paths to exclude from logging (e.g., ['/health', '/metrics']) */
  excludePaths?: string[];
  /** File extensions to exclude (e.g., ['.js', '.css', '.png']) */
  excludeExtensions?: string[];
  /** Whether to log request body (default: false for privacy) */
  logRequestBody?: boolean;
  /** Whether to log response body (default: false for privacy) */
  logResponseBody?: boolean;
  /** Custom properties to add to each log */
  customProps?: (req: unknown, res: unknown) => Record<string, unknown>;
  /** Custom log level function based on status code */
  customLogLevel?: (req: unknown, res: unknown, err?: Error) => LogLevel;
}

/**
 * Log entry structure used by mock logger
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: LogContext;
  timestamp: Date;
}

/**
 * Mock logger interface for testing
 */
export interface MockLogger extends Logger {
  /** Get all captured log entries */
  getLogs(): LogEntry[];
  /** Clear all captured logs */
  clear(): void;
  /** Check if any log matches the predicate */
  hasLog(predicate: (log: LogEntry) => boolean): boolean;
  /** Get logs filtered by level */
  getLogsByLevel(level: LogLevel): LogEntry[];
  /** Get logs filtered by message pattern */
  getLogsByMessage(pattern: string | RegExp): LogEntry[];
}

/**
 * Request context stored in AsyncLocalStorage
 */
export interface RequestContext {
  requestId: string;
  [key: string]: unknown;
}

/**
 * Server logger instance with lifecycle methods
 */
export interface ServerLogger {
  /** The underlying logger instance */
  logger: Logger;
  /** Log server start event */
  logServerStart(port: number, metadata?: Record<string, unknown>): void;
  /** Log shutdown signal received */
  logShutdown(signal: string): void;
  /** Log server closed */
  logServerClosed(): void;
  /** Log uncaught exception */
  logUncaughtException(error: Error): void;
  /** Log unhandled rejection */
  logUnhandledRejection(reason: unknown): void;
}

/**
 * Serialized log entry with timestamp as ISO string
 * Used for JSON output and external storage
 */
export interface SerializedLogEntry {
  level: LogLevel;
  message: string;
  context?: LogContext;
  timestamp: string;
}

/**
 * Destination for flushing buffered log entries
 */
export interface FlushDestination<T> {
  flush(entries: LogEntry[]): Promise<T>;
}

/**
 * Options for creating a buffered logger
 */
export interface BufferedLoggerOptions {
  /** Base logger to wrap (logs go here AND to buffer) */
  logger: Logger;
  /** Maximum buffer size before auto-flush (optional) */
  maxBufferSize?: number;
  /** Auto-flush callback when buffer is full (optional) */
  onBufferFull?: (entries: LogEntry[]) => Promise<void>;
}

/**
 * Logger that buffers entries while also logging normally
 * Useful for capturing logs during a request/operation for later analysis
 */
export interface BufferedLogger extends Logger {
  /** Get copy of buffered entries */
  getBuffer(): LogEntry[];
  /** Clear the buffer */
  clearBuffer(): void;
  /** Flush buffer to a destination and clear */
  flush<T>(destination: FlushDestination<T>): Promise<T>;
  /** Get current buffer size */
  readonly bufferSize: number;
}
