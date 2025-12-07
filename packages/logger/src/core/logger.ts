import type { Logger as PinoLogger } from 'pino';
import { createPinoInstance } from './pino-config.js';
import { getRequestContext } from '../context/async-context.js';
import type {
  Logger,
  LogContext,
  CreateLoggerOptions,
  LoggerConfigureOptions,
} from '../types.js';

/**
 * Wraps a Pino logger instance with our Logger interface
 */
function wrapPinoLogger(pinoLogger: PinoLogger): Logger {
  /**
   * Merges context with any request context from AsyncLocalStorage
   */
  function mergeContext(context?: LogContext): LogContext | undefined {
    const requestContext = getRequestContext();
    if (!requestContext && !context) {
      return undefined;
    }
    return {
      ...requestContext,
      ...context,
    };
  }

  const logger: Logger = {
    trace(message: string, context?: LogContext): void {
      const merged = mergeContext(context);
      if (merged) {
        pinoLogger.trace(merged, message);
      } else {
        pinoLogger.trace(message);
      }
    },

    debug(message: string, context?: LogContext): void {
      const merged = mergeContext(context);
      if (merged) {
        pinoLogger.debug(merged, message);
      } else {
        pinoLogger.debug(message);
      }
    },

    info(message: string, context?: LogContext): void {
      const merged = mergeContext(context);
      if (merged) {
        pinoLogger.info(merged, message);
      } else {
        pinoLogger.info(message);
      }
    },

    warn(message: string, context?: LogContext): void {
      const merged = mergeContext(context);
      if (merged) {
        pinoLogger.warn(merged, message);
      } else {
        pinoLogger.warn(message);
      }
    },

    error(message: string, context?: LogContext): void {
      const merged = mergeContext(context);
      if (merged) {
        pinoLogger.error(merged, message);
      } else {
        pinoLogger.error(message);
      }
    },

    fatal(message: string, context?: LogContext): void {
      const merged = mergeContext(context);
      if (merged) {
        pinoLogger.fatal(merged, message);
      } else {
        pinoLogger.fatal(message);
      }
    },

    child(bindings: Record<string, unknown>): Logger {
      return wrapPinoLogger(pinoLogger.child(bindings));
    },

    get pino(): PinoLogger {
      return pinoLogger;
    },
  };

  return logger;
}

/**
 * Creates a new logger instance with the given options
 *
 * @example
 * ```typescript
 * const logger = createLogger({
 *   serviceName: 'my-service',
 *   level: 'debug',
 * });
 *
 * logger.info('Server started', { port: 3000 });
 *
 * // Create a child logger with bound context
 * const requestLogger = logger.child({ requestId: '123' });
 * requestLogger.info('Processing request');
 * ```
 */
export function createLogger(options: CreateLoggerOptions): Logger {
  const pinoLogger = createPinoInstance(options);
  return wrapPinoLogger(pinoLogger);
}

/**
 * Static Logger class for backward compatibility
 * Provides a singleton logger that can be configured once
 *
 * @example
 * ```typescript
 * // Configure once at startup
 * Logger.configure({ serviceName: 'my-service' });
 *
 * // Use anywhere
 * Logger.info('message', { key: 'value' });
 * ```
 */
export class StaticLogger {
  private static instance: Logger | null = null;

  /**
   * Configure the static logger
   * Should be called once at application startup
   */
  static configure(options: LoggerConfigureOptions): void {
    StaticLogger.instance = createLogger({
      serviceName: options.serviceName,
      level: options.level,
      pretty: options.pretty,
      base: options.base,
    });
  }

  /**
   * Get the configured logger instance
   * Creates a default logger if not configured
   */
  private static getLogger(): Logger {
    if (!StaticLogger.instance) {
      // Create a default logger with a warning
      StaticLogger.instance = createLogger({
        serviceName: 'unconfigured',
      });
      StaticLogger.instance.warn(
        'Logger used before configure() was called. Call Logger.configure() at application startup.'
      );
    }
    return StaticLogger.instance;
  }

  static trace(message: string, context?: LogContext): void {
    StaticLogger.getLogger().trace(message, context);
  }

  static debug(message: string, context?: LogContext): void {
    StaticLogger.getLogger().debug(message, context);
  }

  static info(message: string, context?: LogContext): void {
    StaticLogger.getLogger().info(message, context);
  }

  static warn(message: string, context?: LogContext): void {
    StaticLogger.getLogger().warn(message, context);
  }

  static error(message: string, context?: LogContext): void {
    StaticLogger.getLogger().error(message, context);
  }

  static fatal(message: string, context?: LogContext): void {
    StaticLogger.getLogger().fatal(message, context);
  }

  /**
   * Create a child logger with bound context
   */
  static child(bindings: Record<string, unknown>): Logger {
    return StaticLogger.getLogger().child(bindings);
  }

  /**
   * Get the underlying Pino instance
   */
  static get pino(): PinoLogger {
    return StaticLogger.getLogger().pino;
  }

  /**
   * Reset the static logger (useful for testing)
   */
  static reset(): void {
    StaticLogger.instance = null;
  }
}
