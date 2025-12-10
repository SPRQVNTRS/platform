/**
 * Operation handler registry.
 *
 * This module provides registration and lookup of operation handlers.
 * Handlers must be registered before workflows using them can be executed.
 *
 * @example
 * ```typescript
 * import { createOperationRegistry } from '@sprqvntrs/workflows';
 *
 * const registry = createOperationRegistry();
 *
 * registry.register('gather.data', async (context) => {
 *   const data = await fetchData(context.previousResults.url);
 *   return { status: 'completed', data: { fetchedData: data } };
 * });
 *
 * const handler = registry.get('gather.data');
 * ```
 */

import type { OperationHandler, OperationContext, OperationResult } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * Operation registry interface.
 *
 * Provides methods for registering and retrieving operation handlers.
 */
export interface OperationRegistry {
  /**
   * Registers an operation handler.
   *
   * @param type - Operation type identifier
   * @param handler - Handler function
   * @throws Error if handler already registered
   */
  register: <TContext = Record<string, unknown>, TResult = Record<string, unknown>>(
    type: string,
    handler: OperationHandler<TContext, TResult>,
  ) => void;

  /**
   * Registers multiple handlers at once.
   *
   * @param handlers - Map of type to handler
   */
  registerMany: (handlers: Record<string, OperationHandler>) => void;

  /**
   * Gets a handler by type.
   *
   * @param type - Operation type
   * @returns Handler or undefined
   */
  get: (type: string) => OperationHandler | undefined;

  /**
   * Gets a handler by type, throwing if not found.
   *
   * @param type - Operation type
   * @returns Handler
   * @throws Error if handler not found
   */
  getOrThrow: (type: string) => OperationHandler;

  /**
   * Checks if a handler is registered.
   *
   * @param type - Operation type
   * @returns True if handler exists
   */
  has: (type: string) => boolean;

  /**
   * Gets all registered operation types.
   *
   * @returns Set of operation types
   */
  types: () => Set<string>;

  /**
   * Unregisters a handler.
   *
   * @param type - Operation type to remove
   * @returns True if handler was removed
   */
  unregister: (type: string) => boolean;

  /**
   * Clears all registered handlers.
   */
  clear: () => void;
}

// =============================================================================
// Registry Factory
// =============================================================================

/**
 * Creates a new operation registry.
 *
 * The registry stores operation handlers and provides type-safe lookup.
 *
 * @returns Operation registry instance
 *
 * @example
 * ```typescript
 * const registry = createOperationRegistry();
 *
 * // Register individual handlers
 * registry.register('gather.data', async (context) => {
 *   const url = context.previousResults.url as string;
 *   const data = await fetch(url).then(r => r.json());
 *   return { status: 'completed', data: { fetchedData: data } };
 * });
 *
 * // Register multiple handlers at once
 * registry.registerMany({
 *   'analyze.content': analyzeContentHandler,
 *   'analyze.market': analyzeMarketHandler,
 *   'generate.report': generateReportHandler,
 * });
 *
 * // Get handler
 * const handler = registry.getOrThrow('gather.data');
 *
 * // Check available types
 * const types = registry.types();
 * console.log('Registered operations:', Array.from(types));
 * ```
 */
export function createOperationRegistry(): OperationRegistry {
  const handlers = new Map<string, OperationHandler>();

  return {
    register<TContext = Record<string, unknown>, TResult = Record<string, unknown>>(
      type: string,
      handler: OperationHandler<TContext, TResult>,
    ): void {
      if (handlers.has(type)) {
        throw new Error(`Operation handler "${type}" is already registered`);
      }
      handlers.set(type, handler as OperationHandler);
    },

    registerMany(handlersMap: Record<string, OperationHandler>): void {
      // Check for duplicates first
      for (const type of Object.keys(handlersMap)) {
        if (handlers.has(type)) {
          throw new Error(`Operation handler "${type}" is already registered`);
        }
      }

      // Register all
      for (const [type, handler] of Object.entries(handlersMap)) {
        handlers.set(type, handler);
      }
    },

    get(type: string): OperationHandler | undefined {
      return handlers.get(type);
    },

    getOrThrow(type: string): OperationHandler {
      const handler = handlers.get(type);
      if (!handler) {
        throw new Error(`Operation handler "${type}" not found`);
      }
      return handler;
    },

    has(type: string): boolean {
      return handlers.has(type);
    },

    types(): Set<string> {
      return new Set(handlers.keys());
    },

    unregister(type: string): boolean {
      return handlers.delete(type);
    },

    clear(): void {
      handlers.clear();
    },
  };
}

// =============================================================================
// Handler Utilities
// =============================================================================

/**
 * Wraps an operation handler with timeout handling.
 *
 * Creates a new handler that will reject after the specified timeout.
 *
 * @param handler - Original handler
 * @param timeoutMs - Timeout in milliseconds
 * @returns Wrapped handler with timeout
 *
 * @example
 * ```typescript
 * const handler = withTimeout(originalHandler, 30000);
 * // Handler will reject after 30 seconds
 * ```
 */
export function withTimeout<TContext = Record<string, unknown>, TResult = Record<string, unknown>>(
  handler: OperationHandler<TContext, TResult>,
  timeoutMs: number,
): OperationHandler<TContext, TResult> {
  return async (context: OperationContext<TContext>): Promise<OperationResult<TResult>> => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return Promise.race([handler(context), timeoutPromise]);
  };
}

/**
 * Wraps an operation handler with retry logic.
 *
 * Creates a new handler that will retry on failure with exponential backoff.
 *
 * @param handler - Original handler
 * @param options - Retry options
 * @returns Wrapped handler with retry
 *
 * @example
 * ```typescript
 * const handler = withRetry(originalHandler, {
 *   maxAttempts: 3,
 *   baseDelayMs: 1000,
 *   backoffMultiplier: 2,
 * });
 * ```
 */
export function withRetry<TContext = Record<string, unknown>, TResult = Record<string, unknown>>(
  handler: OperationHandler<TContext, TResult>,
  options: {
    /**
     * Maximum number of attempts.
     * @default 3
     */
    maxAttempts?: number;
    /**
     * Base delay between retries in milliseconds.
     * @default 1000
     */
    baseDelayMs?: number;
    /**
     * Multiplier for exponential backoff.
     * @default 2
     */
    backoffMultiplier?: number;
    /**
     * Function to determine if error should be retried.
     * @default () => true
     */
    shouldRetry?: (error: Error) => boolean;
  } = {},
): OperationHandler<TContext, TResult> {
  const { maxAttempts = 3, baseDelayMs = 1000, backoffMultiplier = 2, shouldRetry = () => true } = options;

  return async (context: OperationContext<TContext>): Promise<OperationResult<TResult>> => {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await handler(context);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxAttempts || !shouldRetry(lastError)) {
          return {
            status: 'failed',
            reason: lastError.message,
          };
        }

        // Exponential backoff
        const delay = baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return {
      status: 'failed',
      reason: lastError?.message ?? 'Unknown error',
    };
  };
}

/**
 * Wraps an operation handler to catch exceptions and convert to failed result.
 *
 * Ensures handler never throws, returning a failed result instead.
 *
 * @param handler - Original handler
 * @returns Safe handler that never throws
 *
 * @example
 * ```typescript
 * const handler = withErrorBoundary(originalHandler);
 * // Exceptions are caught and converted to { status: 'failed', reason: '...' }
 * ```
 */
export function withErrorBoundary<TContext = Record<string, unknown>, TResult = Record<string, unknown>>(
  handler: OperationHandler<TContext, TResult>,
): OperationHandler<TContext, TResult> {
  return async (context: OperationContext<TContext>): Promise<OperationResult<TResult>> => {
    try {
      return await handler(context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: 'failed',
        reason: message,
      };
    }
  };
}

/**
 * Combines multiple handler wrappers.
 *
 * Applies wrappers from right to left (innermost to outermost).
 *
 * @param handler - Original handler
 * @param wrappers - Array of wrapper functions
 * @returns Handler with all wrappers applied
 *
 * @example
 * ```typescript
 * const handler = compose(
 *   originalHandler,
 *   (h) => withErrorBoundary(h),
 *   (h) => withTimeout(h, 30000),
 *   (h) => withRetry(h, { maxAttempts: 3 }),
 * );
 * ```
 */
export function compose<TContext = Record<string, unknown>, TResult = Record<string, unknown>>(
  handler: OperationHandler<TContext, TResult>,
  ...wrappers: Array<(h: OperationHandler<TContext, TResult>) => OperationHandler<TContext, TResult>>
): OperationHandler<TContext, TResult> {
  return wrappers.reduceRight((h, wrapper) => wrapper(h), handler);
}

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Type helper for defining operation handlers with typed context.
 *
 * @example
 * ```typescript
 * interface GatherContext {
 *   url: string;
 *   userId: string;
 * }
 *
 * interface GatherResult {
 *   data: unknown;
 *   fetchedAt: string;
 * }
 *
 * const gatherHandler: TypedOperationHandler<GatherContext, GatherResult> = async (ctx) => {
 *   // ctx.previousResults.url is typed as string
 *   return {
 *     status: 'completed',
 *     data: { data: {}, fetchedAt: new Date().toISOString() },
 *   };
 * };
 * ```
 */
export type TypedOperationHandler<TContext, TResult> = OperationHandler<TContext, TResult>;

/**
 * Creates a typed handler with proper inference.
 *
 * Helper function for better TypeScript inference when creating handlers.
 *
 * @param handler - Handler function
 * @returns The same handler with proper typing
 *
 * @example
 * ```typescript
 * const gatherHandler = defineHandler<{ url: string }, { data: unknown }>(async (ctx) => {
 *   const response = await fetch(ctx.previousResults.url);
 *   return { status: 'completed', data: { data: await response.json() } };
 * });
 * ```
 */
export function defineHandler<TContext = Record<string, unknown>, TResult = Record<string, unknown>>(
  handler: OperationHandler<TContext, TResult>,
): OperationHandler<TContext, TResult> {
  return handler;
}
