/**
 * Lock manager for workflow coordination.
 *
 * This module provides entity locking to prevent race conditions when
 * multiple workflows operate on the same entity.
 *
 * @example
 * ```typescript
 * import { createLockManager } from '@sprqvntrs/workflows';
 *
 * const lockManager = createLockManager(dbState);
 *
 * // Acquire lock before processing
 * const acquired = await lockManager.acquire('document', '123', workflowId);
 * if (!acquired) {
 *   throw new Error('Entity is locked by another workflow');
 * }
 *
 * try {
 *   // Process entity...
 * } finally {
 *   await lockManager.release('document', '123');
 * }
 * ```
 */

import type { DbState } from '../infrastructure/db-state';
import { CoordinationError } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * Lock manager interface.
 */
export interface LockManager {
  /**
   * Acquires a lock on an entity.
   *
   * @param entityType - Type of entity (e.g., 'document', 'user')
   * @param entityId - Entity identifier
   * @param workflowId - Workflow requesting the lock
   * @param options - Lock options
   * @returns True if lock was acquired
   *
   * @example
   * ```typescript
   * const acquired = await lockManager.acquire('document', '123', workflowId, {
   *   ttlMs: 600000, // 10 minute TTL
   * });
   * ```
   */
  acquire: (
    entityType: string,
    entityId: string,
    workflowId: string,
    options?: LockOptions,
  ) => Promise<boolean>;

  /**
   * Releases a lock on an entity.
   *
   * @param entityType - Type of entity
   * @param entityId - Entity identifier
   * @returns True if lock was released
   *
   * @example
   * ```typescript
   * await lockManager.release('document', '123');
   * ```
   */
  release: (entityType: string, entityId: string) => Promise<boolean>;

  /**
   * Releases all locks held by a workflow.
   *
   * @param workflowId - Workflow ID
   * @returns Number of locks released
   *
   * @example
   * ```typescript
   * const count = await lockManager.releaseAll(workflowId);
   * console.log(`Released ${count} locks`);
   * ```
   */
  releaseAll: (workflowId: string) => Promise<number>;

  /**
   * Checks if an entity is locked.
   *
   * @param entityType - Type of entity
   * @param entityId - Entity identifier
   * @returns Lock info or null if not locked
   *
   * @example
   * ```typescript
   * const lock = await lockManager.check('document', '123');
   * if (lock) {
   *   console.log(`Locked by workflow ${lock.workflowId}`);
   * }
   * ```
   */
  check: (entityType: string, entityId: string) => Promise<LockInfo | null>;

  /**
   * Waits for a lock to become available.
   *
   * @param entityType - Type of entity
   * @param entityId - Entity identifier
   * @param workflowId - Workflow requesting the lock
   * @param options - Wait options
   * @returns True if lock was acquired
   *
   * @example
   * ```typescript
   * const acquired = await lockManager.waitAndAcquire('document', '123', workflowId, {
   *   timeoutMs: 30000,
   *   pollIntervalMs: 1000,
   * });
   * ```
   */
  waitAndAcquire: (
    entityType: string,
    entityId: string,
    workflowId: string,
    options?: WaitOptions,
  ) => Promise<boolean>;

  /**
   * Cleans up expired locks.
   *
   * Should be called periodically to release stale locks.
   *
   * @returns Number of locks cleaned up
   */
  cleanup: () => Promise<number>;
}

/**
 * Options for acquiring a lock.
 */
export interface LockOptions {
  /**
   * Time-to-live for the lock in milliseconds.
   * If not provided, lock has no expiration.
   */
  ttlMs?: number;
}

/**
 * Options for waiting for a lock.
 */
export interface WaitOptions extends LockOptions {
  /**
   * Maximum time to wait in milliseconds.
   * @default 60000 (1 minute)
   */
  timeoutMs?: number;

  /**
   * Interval between lock checks in milliseconds.
   * @default 1000 (1 second)
   */
  pollIntervalMs?: number;
}

/**
 * Information about a held lock.
 */
export interface LockInfo {
  /**
   * Type of locked entity.
   */
  entityType: string;

  /**
   * ID of locked entity.
   */
  entityId: string;

  /**
   * Workflow holding the lock.
   */
  workflowId: string;

  /**
   * When lock was acquired.
   */
  acquiredAt: Date;

  /**
   * When lock expires (if TTL was set).
   */
  expiresAt: Date | null;
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Creates a lock manager instance.
 *
 * The lock manager provides entity-level locking to prevent race conditions
 * when multiple workflows operate on the same entity.
 *
 * @param dbState - Database state manager
 * @returns Lock manager instance
 *
 * @example
 * ```typescript
 * const lockManager = createLockManager(dbState);
 *
 * // In your workflow operation
 * async function processDocument(context: OperationContext) {
 *   const { workflowId, previousResults } = context;
 *   const documentId = previousResults.documentId as string;
 *
 *   // Acquire lock with TTL
 *   const acquired = await lockManager.acquire('document', documentId, workflowId, {
 *     ttlMs: 600000, // 10 minutes
 *   });
 *
 *   if (!acquired) {
 *     return { status: 'failed', reason: 'Document is being processed by another workflow' };
 *   }
 *
 *   try {
 *     // Process document...
 *     return { status: 'completed', data: { processed: true } };
 *   } finally {
 *     // Always release in finally block
 *     await lockManager.release('document', documentId);
 *   }
 * }
 * ```
 */
export function createLockManager(dbState: DbState): LockManager {
  return {
    async acquire(
      entityType: string,
      entityId: string,
      workflowId: string,
      options?: LockOptions,
    ): Promise<boolean> {
      const expiresAt = options?.ttlMs ? new Date(Date.now() + options.ttlMs) : undefined;

      return dbState.acquireLock(entityType, entityId, workflowId, expiresAt);
    },

    async release(entityType: string, entityId: string): Promise<boolean> {
      return dbState.releaseLock(entityType, entityId);
    },

    async releaseAll(workflowId: string): Promise<number> {
      return dbState.releaseLocksByWorkflow(workflowId);
    },

    async check(entityType: string, entityId: string): Promise<LockInfo | null> {
      const lock = await dbState.getLock(entityType, entityId);
      if (!lock) {
        return null;
      }

      return {
        entityType: lock.entityType,
        entityId: lock.entityId,
        workflowId: lock.workflowId,
        acquiredAt: lock.acquiredAt,
        expiresAt: lock.expiresAt,
      };
    },

    async waitAndAcquire(
      entityType: string,
      entityId: string,
      workflowId: string,
      options?: WaitOptions,
    ): Promise<boolean> {
      const { timeoutMs = 60000, pollIntervalMs = 1000, ttlMs } = options ?? {};
      const deadline = Date.now() + timeoutMs;

      while (Date.now() < deadline) {
        // Try to acquire
        const expiresAt = ttlMs ? new Date(Date.now() + ttlMs) : undefined;
        const acquired = await dbState.acquireLock(entityType, entityId, workflowId, expiresAt);

        if (acquired) {
          return true;
        }

        // Check if existing lock has expired
        const existingLock = await dbState.getLock(entityType, entityId);
        if (existingLock?.expiresAt && existingLock.expiresAt < new Date()) {
          // Lock has expired, clean it up and try again
          await dbState.releaseLock(entityType, entityId);
          continue;
        }

        // Wait before next attempt
        if (Date.now() + pollIntervalMs < deadline) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        } else {
          break;
        }
      }

      return false;
    },

    async cleanup(): Promise<number> {
      return dbState.cleanupExpiredLocks();
    },
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Executes a function with a lock, automatically releasing on completion.
 *
 * This helper ensures the lock is always released, even if the function throws.
 *
 * @param lockManager - Lock manager instance
 * @param entityType - Type of entity to lock
 * @param entityId - Entity identifier
 * @param workflowId - Workflow ID
 * @param fn - Function to execute while holding the lock
 * @param options - Lock options
 * @returns Result of the function
 * @throws CoordinationError if lock cannot be acquired
 *
 * @example
 * ```typescript
 * const result = await withLock(
 *   lockManager,
 *   'document',
 *   '123',
 *   workflowId,
 *   async () => {
 *     // This runs while holding the lock
 *     return await processDocument();
 *   },
 *   { ttlMs: 300000 }
 * );
 * ```
 */
export async function withLock<T>(
  lockManager: LockManager,
  entityType: string,
  entityId: string,
  workflowId: string,
  fn: () => Promise<T>,
  options?: LockOptions,
): Promise<T> {
  const acquired = await lockManager.acquire(entityType, entityId, workflowId, options);

  if (!acquired) {
    throw new CoordinationError(`Failed to acquire lock on ${entityType}:${entityId}`, {
      entityType,
      entityId,
      workflowId,
    });
  }

  try {
    return await fn();
  } finally {
    await lockManager.release(entityType, entityId);
  }
}

/**
 * Executes a function with a lock, waiting if necessary.
 *
 * Like `withLock`, but waits for the lock to become available.
 *
 * @param lockManager - Lock manager instance
 * @param entityType - Type of entity to lock
 * @param entityId - Entity identifier
 * @param workflowId - Workflow ID
 * @param fn - Function to execute while holding the lock
 * @param options - Wait options
 * @returns Result of the function
 * @throws CoordinationError if lock cannot be acquired within timeout
 *
 * @example
 * ```typescript
 * const result = await withLockWait(
 *   lockManager,
 *   'document',
 *   '123',
 *   workflowId,
 *   async () => {
 *     return await processDocument();
 *   },
 *   { timeoutMs: 60000, ttlMs: 300000 }
 * );
 * ```
 */
export async function withLockWait<T>(
  lockManager: LockManager,
  entityType: string,
  entityId: string,
  workflowId: string,
  fn: () => Promise<T>,
  options?: WaitOptions,
): Promise<T> {
  const acquired = await lockManager.waitAndAcquire(entityType, entityId, workflowId, options);

  if (!acquired) {
    throw new CoordinationError(
      `Timed out waiting for lock on ${entityType}:${entityId}`,
      {
        entityType,
        entityId,
        workflowId,
        timeoutMs: options?.timeoutMs,
      },
    );
  }

  try {
    return await fn();
  } finally {
    await lockManager.release(entityType, entityId);
  }
}
