import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestContext } from '../types.js';

/**
 * AsyncLocalStorage instance for maintaining request context
 * across async operations
 */
const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Generates a unique request ID
 * Uses crypto.randomUUID if available, falls back to timestamp-based ID
 */
export function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older Node.js versions
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Run a function with request context
 * The context will be available to all async operations within the callback
 *
 * @example
 * ```typescript
 * // In middleware
 * app.use((req, res, next) => {
 *   withRequestContext({ requestId: generateRequestId() }, () => {
 *     next();
 *   });
 * });
 *
 * // Later in any handler or service
 * logger.info('Processing'); // requestId automatically included
 * ```
 */
export function withRequestContext<T>(context: RequestContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Run an async function with request context
 * Convenience wrapper for async functions
 *
 * @example
 * ```typescript
 * await withRequestContextAsync({ requestId: '123' }, async () => {
 *   await someAsyncOperation();
 *   logger.info('Done'); // requestId automatically included
 * });
 * ```
 */
export async function withRequestContextAsync<T>(
  context: RequestContext,
  fn: () => Promise<T>
): Promise<T> {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Get the current request context
 * Returns undefined if not running within a request context
 */
export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Get a specific value from the current request context
 */
export function getContextValue<K extends keyof RequestContext>(
  key: K
): RequestContext[K] | undefined {
  const store = asyncLocalStorage.getStore();
  return store?.[key];
}

/**
 * Get the current request ID from context
 * Convenience method for the most common use case
 */
export function getRequestId(): string | undefined {
  return getContextValue('requestId');
}

/**
 * Update the current request context
 * Merges new values with existing context
 * Only works within an active context - no-op otherwise
 */
export function updateRequestContext(updates: Partial<RequestContext>): void {
  const store = asyncLocalStorage.getStore();
  if (store) {
    Object.assign(store, updates);
  }
}

/**
 * Create a middleware-style function for Express/Koa/etc
 * that sets up request context for each request
 *
 * @example
 * ```typescript
 * // Express
 * app.use(createRequestContextMiddleware());
 *
 * // With custom ID extraction
 * app.use(createRequestContextMiddleware((req) => ({
 *   requestId: req.headers['x-request-id'] || generateRequestId(),
 *   userId: req.user?.id,
 * })));
 * ```
 */
export function createRequestContextMiddleware(
  contextExtractor?: (req: unknown) => RequestContext
): (req: unknown, res: unknown, next: () => void) => void {
  return (req, _res, next) => {
    const context = contextExtractor
      ? contextExtractor(req)
      : { requestId: generateRequestId() };

    withRequestContext(context, next);
  };
}
