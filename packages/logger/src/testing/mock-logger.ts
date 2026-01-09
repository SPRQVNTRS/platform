import pino from 'pino';
import type { Logger, MockLogger, LogEntry, LogLevel, LogContext } from '../types';

/**
 * Creates a mock logger for testing purposes
 * Captures all log entries for assertion
 *
 * @example
 * ```typescript
 * import { createMockLogger } from '@sprqvntrs/logger/testing';
 *
 * describe('MyService', () => {
 *   let logger: MockLogger;
 *
 *   beforeEach(() => {
 *     logger = createMockLogger();
 *   });
 *
 *   it('logs user creation', () => {
 *     const service = new MyService(logger);
 *     service.createUser({ name: 'Test' });
 *
 *     expect(logger.hasLog((log) =>
 *       log.level === 'info' &&
 *       log.message.includes('User created')
 *     )).toBe(true);
 *   });
 *
 *   it('logs errors with context', () => {
 *     const service = new MyService(logger);
 *     service.failingOperation();
 *
 *     const errorLogs = logger.getLogsByLevel('error');
 *     expect(errorLogs).toHaveLength(1);
 *     expect(errorLogs[0]?.context?.error).toBeDefined();
 *   });
 * });
 * ```
 */
export function createMockLogger(): MockLogger {
  const logs: LogEntry[] = [];

  // Create a silent pino instance for the pino property
  const silentPino = pino({ level: 'silent' });

  function createLogMethod(level: LogLevel) {
    return (message: string, context?: LogContext) => {
      logs.push({
        level,
        message,
        context,
        timestamp: new Date(),
      });
    };
  }

  const mockLogger: MockLogger = {
    trace: createLogMethod('trace'),
    debug: createLogMethod('debug'),
    info: createLogMethod('info'),
    warn: createLogMethod('warn'),
    error: createLogMethod('error'),
    fatal: createLogMethod('fatal'),

    child(bindings: Record<string, unknown>): Logger {
      // Create a child mock that merges bindings into context
      const childLogs: LogEntry[] = [];

      function createChildLogMethod(level: LogLevel) {
        return (message: string, context?: LogContext) => {
          const entry: LogEntry = {
            level,
            message,
            context: { ...bindings, ...context },
            timestamp: new Date(),
          };
          childLogs.push(entry);
          // Also add to parent logs
          logs.push(entry);
        };
      }

      // Return a simplified child (not full MockLogger to avoid complexity)
      return {
        trace: createChildLogMethod('trace'),
        debug: createChildLogMethod('debug'),
        info: createChildLogMethod('info'),
        warn: createChildLogMethod('warn'),
        error: createChildLogMethod('error'),
        fatal: createChildLogMethod('fatal'),
        child: (moreBindings) =>
          mockLogger.child({ ...bindings, ...moreBindings }),
        pino: silentPino,
      };
    },

    get pino() {
      return silentPino;
    },

    // Test utility methods
    getLogs(): LogEntry[] {
      return [...logs];
    },

    clear(): void {
      logs.length = 0;
    },

    hasLog(predicate: (log: LogEntry) => boolean): boolean {
      return logs.some(predicate);
    },

    getLogsByLevel(level: LogLevel): LogEntry[] {
      return logs.filter((log) => log.level === level);
    },

    getLogsByMessage(pattern: string | RegExp): LogEntry[] {
      if (typeof pattern === 'string') {
        return logs.filter((log) => log.message.includes(pattern));
      }
      return logs.filter((log) => pattern.test(log.message));
    },
  };

  return mockLogger;
}

/**
 * Creates a spy logger that wraps a real logger and captures calls
 * Useful when you want real logging behavior but also want to assert on calls
 *
 * @example
 * ```typescript
 * const realLogger = createLogger({ serviceName: 'test' });
 * const { logger, getCalls } = createSpyLogger(realLogger);
 *
 * // Use logger normally - it will log AND capture calls
 * logger.info('test message');
 *
 * // Assert on calls
 * expect(getCalls('info')).toContainEqual({
 *   message: 'test message',
 *   context: undefined,
 * });
 * ```
 */
export function createSpyLogger(realLogger: Logger) {
  const calls: Record<LogLevel, Array<{ message: string; context?: LogContext }>> = {
    trace: [],
    debug: [],
    info: [],
    warn: [],
    error: [],
    fatal: [],
  };

  function createSpyMethod(level: LogLevel) {
    return (message: string, context?: LogContext) => {
      calls[level].push({ message, context });
      realLogger[level](message, context);
    };
  }

  const spyLogger: Logger = {
    trace: createSpyMethod('trace'),
    debug: createSpyMethod('debug'),
    info: createSpyMethod('info'),
    warn: createSpyMethod('warn'),
    error: createSpyMethod('error'),
    fatal: createSpyMethod('fatal'),
    child: (bindings) => createSpyLogger(realLogger.child(bindings)).logger,
    pino: realLogger.pino,
  };

  return {
    logger: spyLogger,
    getCalls: (level: LogLevel) => [...calls[level]],
    getAllCalls: () => ({ ...calls }),
    clearCalls: () => {
      Object.keys(calls).forEach((key) => {
        calls[key as LogLevel] = [];
      });
    },
  };
}

/**
 * Assertion helpers for testing log output
 */
export const logAssertions = {
  /**
   * Check if logs contain a message at a specific level
   */
  hasLogAtLevel(logs: LogEntry[], level: LogLevel, messagePattern: string | RegExp): boolean {
    return logs.some((log) => {
      if (log.level !== level) return false;
      if (typeof messagePattern === 'string') {
        return log.message.includes(messagePattern);
      }
      return messagePattern.test(log.message);
    });
  },

  /**
   * Check if any log contains specific context properties
   */
  hasLogWithContext(
    logs: LogEntry[],
    contextMatcher: Partial<LogContext>
  ): boolean {
    return logs.some((log) => {
      if (!log.context) return false;
      return Object.entries(contextMatcher).every(
        ([key, value]) => log.context![key] === value
      );
    });
  },

  /**
   * Get the most recent log at a specific level
   */
  getLastLogAtLevel(logs: LogEntry[], level: LogLevel): LogEntry | undefined {
    const filtered = logs.filter((log) => log.level === level);
    return filtered[filtered.length - 1];
  },

  /**
   * Count logs at a specific level
   */
  countLogsAtLevel(logs: LogEntry[], level: LogLevel): number {
    return logs.filter((log) => log.level === level).length;
  },
};
