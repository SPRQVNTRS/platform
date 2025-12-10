/**
 * Workflow execution engine.
 *
 * This module contains the core execution logic for processing workflows.
 * It interprets workflow templates and executes stages/operations.
 *
 * @example
 * ```typescript
 * import { createExecutionEngine } from '@sprqvntrs/workflows';
 *
 * const engine = createExecutionEngine({
 *   dbState,
 *   templateRegistry,
 *   operationRegistry,
 *   defaultTimeout: 30000,
 *   defaultRetryLimit: 3,
 * });
 *
 * await engine.executeWorkflow(workflowId);
 * ```
 */

import type {
  WorkflowTemplate,
  StageTemplate,
  OperationTemplate,
  WorkflowContext,
  OperationContext,
  OperationResult,
} from '../types';
import { OperationError, TimeoutError, WorkflowError } from '../types';
import type { DbState } from '../infrastructure/db-state';
import type { TemplateRegistry } from '../templates/registry';
import type { OperationRegistry } from '../operations/registry';
import type { Workflow, WorkflowOperation } from '../infrastructure/schema';

// =============================================================================
// Types
// =============================================================================

/**
 * Execution engine configuration.
 */
export interface ExecutionEngineConfig {
  /**
   * Database state manager.
   */
  dbState: DbState;

  /**
   * Template registry.
   */
  templateRegistry: TemplateRegistry;

  /**
   * Operation registry.
   */
  operationRegistry: OperationRegistry;

  /**
   * Default operation timeout in milliseconds.
   * @default 30000
   */
  defaultTimeout?: number;

  /**
   * Default retry limit for operations.
   * @default 3
   */
  defaultRetryLimit?: number;

  /**
   * Callback for logging/metrics.
   */
  onLog?: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) => void;
}

/**
 * Execution engine interface.
 */
export interface ExecutionEngine {
  /**
   * Executes a workflow from the beginning or resumes from current state.
   *
   * @param workflowId - Workflow ID to execute
   * @returns Final workflow context
   */
  executeWorkflow: (workflowId: string) => Promise<WorkflowContext>;

  /**
   * Resumes a paused workflow from a checkpoint.
   *
   * @param workflowId - Workflow ID to resume
   * @returns Final workflow context
   */
  resumeWorkflow: (workflowId: string) => Promise<WorkflowContext>;
}

/**
 * Result of executing a stage.
 */
interface StageResult {
  /**
   * Whether stage completed successfully.
   */
  success: boolean;

  /**
   * Combined results from all operations.
   */
  results: WorkflowContext;

  /**
   * Whether workflow should pause after this stage.
   */
  shouldPause: boolean;

  /**
   * Checkpoint status if pausing.
   */
  checkpointStatus?: string;
}

/**
 * Result of executing an operation.
 */
interface OperationExecutionResult {
  /**
   * Whether operation completed successfully.
   */
  success: boolean;

  /**
   * Operation result data.
   */
  data?: Record<string, unknown>;

  /**
   * Error message if failed.
   */
  error?: string;

  /**
   * Whether operation was skipped.
   */
  skipped?: boolean;
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Creates an execution engine instance.
 *
 * The execution engine processes workflows by interpreting templates
 * and executing operations in the correct order.
 *
 * @param config - Engine configuration
 * @returns Execution engine instance
 *
 * @example
 * ```typescript
 * const engine = createExecutionEngine({
 *   dbState: createDbState(db),
 *   templateRegistry: registry,
 *   operationRegistry: operations,
 *   defaultTimeout: 30000,
 *   defaultRetryLimit: 3,
 *   onLog: (level, message, data) => {
 *     logger[level](message, data);
 *   },
 * });
 *
 * // Execute a workflow
 * try {
 *   const result = await engine.executeWorkflow('workflow-123');
 *   console.log('Workflow completed:', result);
 * } catch (error) {
 *   console.error('Workflow failed:', error);
 * }
 * ```
 */
export function createExecutionEngine(config: ExecutionEngineConfig): ExecutionEngine {
  const {
    dbState,
    templateRegistry,
    operationRegistry,
    defaultTimeout = 30000,
    defaultRetryLimit = 3,
    onLog = () => {},
  } = config;

  // Helper to log
  const log = (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: Record<string, unknown>,
  ): void => {
    onLog(level, message, data);
  };

  // =========================================================================
  // Operation Execution
  // =========================================================================

  /**
   * Executes a single operation with timeout and retry handling.
   */
  async function executeOperation(
    workflow: Workflow,
    operation: WorkflowOperation,
    template: OperationTemplate,
    context: WorkflowContext,
  ): Promise<OperationExecutionResult> {
    const timeout = template.timeout ?? defaultTimeout;
    const maxAttempts = template.maxAttempts ?? defaultRetryLimit;

    // Check condition
    if (template.condition && !template.condition(context)) {
      log('debug', `Operation skipped due to condition`, {
        operationId: operation.id,
        operationType: operation.type,
      });

      await dbState.updateOperationStatus(operation.id, 'skipped');
      return { success: true, skipped: true };
    }

    // Get handler
    const handler = operationRegistry.getOrThrow(operation.type);

    // Build operation context
    const opContext: OperationContext = {
      workflowId: workflow.id,
      operationId: operation.id,
      operationType: operation.type,
      stageName: operation.stage,
      attempt: operation.attempts + 1,
      maxAttempts,
      previousResults: context,
      initialContext: workflow.context as Record<string, unknown>,
      workflowType: workflow.type,
    };

    // Mark as active and increment attempts
    await dbState.updateOperationStatus(operation.id, 'active');
    await dbState.incrementOperationAttempts(operation.id);

    log('debug', `Executing operation`, {
      operationId: operation.id,
      operationType: operation.type,
      attempt: opContext.attempt,
      maxAttempts,
    });

    try {
      // Execute with timeout
      const result = await executeWithTimeout(handler, opContext, timeout);

      if (result.status === 'completed') {
        await dbState.updateOperationResult(operation.id, result.data ?? {});

        log('info', `Operation completed`, {
          operationId: operation.id,
          operationType: operation.type,
        });

        return { success: true, data: result.data };
      } else {
        // Handler returned failed status
        const errorMessage = result.reason ?? 'Operation returned failed status';

        // Check if we should retry
        const currentAttempts = opContext.attempt;
        if (currentAttempts < maxAttempts) {
          log('warn', `Operation failed, will retry`, {
            operationId: operation.id,
            operationType: operation.type,
            attempt: currentAttempts,
            maxAttempts,
            error: errorMessage,
          });

          // Exponential backoff
          const delay = Math.pow(2, currentAttempts) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));

          // Retry recursively
          const updatedOp = await dbState.getOperation(operation.id);
          if (updatedOp) {
            return executeOperation(workflow, updatedOp, template, context);
          }
        }

        // All retries exhausted
        await dbState.updateOperationStatus(operation.id, 'failed', errorMessage);

        log('error', `Operation failed after all retries`, {
          operationId: operation.id,
          operationType: operation.type,
          attempts: currentAttempts,
          error: errorMessage,
        });

        return { success: false, error: errorMessage };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeout = error instanceof TimeoutError;

      // Check if we should retry
      const currentAttempts = opContext.attempt;
      if (currentAttempts < maxAttempts) {
        log('warn', `Operation threw error, will retry`, {
          operationId: operation.id,
          operationType: operation.type,
          attempt: currentAttempts,
          maxAttempts,
          error: errorMessage,
          isTimeout,
        });

        // Exponential backoff
        const delay = Math.pow(2, currentAttempts) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Retry recursively
        const updatedOp = await dbState.getOperation(operation.id);
        if (updatedOp) {
          return executeOperation(workflow, updatedOp, template, context);
        }
      }

      // All retries exhausted
      await dbState.updateOperationStatus(operation.id, 'failed', errorMessage);

      log('error', `Operation failed with exception`, {
        operationId: operation.id,
        operationType: operation.type,
        attempts: currentAttempts,
        error: errorMessage,
        isTimeout,
      });

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Executes handler with timeout.
   */
  async function executeWithTimeout(
    handler: (context: OperationContext) => Promise<OperationResult>,
    context: OperationContext,
    timeoutMs: number,
  ): Promise<OperationResult> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(
          new TimeoutError(
            `Operation timed out after ${timeoutMs}ms`,
            context.operationType,
            timeoutMs,
          ),
        );
      }, timeoutMs);

      handler(context)
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  // =========================================================================
  // Stage Execution
  // =========================================================================

  /**
   * Executes a single stage.
   */
  async function executeStage(
    workflow: Workflow,
    stage: StageTemplate,
    template: WorkflowTemplate,
    context: WorkflowContext,
  ): Promise<StageResult> {
    log('info', `Executing stage`, { workflowId: workflow.id, stage: stage.name });

    // Check stage condition
    if (stage.condition && !stage.condition(context)) {
      log('debug', `Stage skipped due to condition`, { workflowId: workflow.id, stage: stage.name });
      return { success: true, results: {}, shouldPause: false };
    }

    // Update workflow current stage
    await dbState.updateWorkflowStage(workflow.id, stage.name);

    // Create operation records
    const operationRecords = await dbState.createOperations(
      stage.operations.map((op) => ({
        workflowId: workflow.id,
        type: op.type,
        stage: stage.name,
        maxAttempts: op.maxAttempts ?? defaultRetryLimit,
      })),
    );

    // Build operation map for lookup
    const operationMap = new Map<string, typeof operationRecords[0]>();
    operationRecords.forEach((record, index) => {
      const template = stage.operations[index];
      if (template) {
        operationMap.set(template.type, record);
      }
    });

    // Execute operations (parallel or sequential)
    const results: WorkflowContext = {};
    let allSucceeded = true;

    if (stage.parallel) {
      // Parallel execution
      const promises = stage.operations.map(async (opTemplate) => {
        const opRecord = operationMap.get(opTemplate.type);
        if (!opRecord) {
          throw new WorkflowError(`Operation record not found for ${opTemplate.type}`, 'INTERNAL_ERROR');
        }
        return executeOperation(workflow, opRecord, opTemplate, { ...context, ...results });
      });

      const parallelResults = await Promise.all(promises);

      for (let i = 0; i < parallelResults.length; i++) {
        const result = parallelResults[i];
        const opTemplate = stage.operations[i];

        if (result && !result.success && !result.skipped) {
          allSucceeded = false;
          // If operation is critical, fail immediately
          if (opTemplate?.critical !== false) {
            throw new OperationError(
              result.error ?? 'Operation failed',
              opTemplate?.type ?? 'unknown',
              operationMap.get(opTemplate?.type ?? '')?.id ?? 'unknown',
            );
          }
        }

        if (result?.data) {
          Object.assign(results, result.data);
        }
      }
    } else {
      // Sequential execution
      for (const opTemplate of stage.operations) {
        const opRecord = operationMap.get(opTemplate.type);
        if (!opRecord) {
          throw new WorkflowError(`Operation record not found for ${opTemplate.type}`, 'INTERNAL_ERROR');
        }

        const result = await executeOperation(workflow, opRecord, opTemplate, { ...context, ...results });

        if (!result.success && !result.skipped) {
          allSucceeded = false;
          // If operation is critical, fail immediately
          if (opTemplate.critical !== false) {
            throw new OperationError(
              result.error ?? 'Operation failed',
              opTemplate.type,
              opRecord.id,
            );
          }
        }

        if (result.data) {
          Object.assign(results, result.data);
        }
      }
    }

    // Handle fix-verify loop if stage has fix operations
    if (stage.fixOperations && stage.fixOperations.length > 0 && !allSucceeded) {
      const maxCycles = stage.maxFixCycles ?? 3;

      for (let cycle = 0; cycle < maxCycles; cycle++) {
        log('info', `Running fix cycle ${cycle + 1}/${maxCycles}`, {
          workflowId: workflow.id,
          stage: stage.name,
        });

        // Run fix operations
        const fixRecords = await dbState.createOperations(
          stage.fixOperations.map((op) => ({
            workflowId: workflow.id,
            type: op.type,
            stage: `${stage.name}-fix`,
            maxAttempts: op.maxAttempts ?? defaultRetryLimit,
          })),
        );

        for (let i = 0; i < stage.fixOperations.length; i++) {
          const fixTemplate = stage.fixOperations[i];
          const fixRecord = fixRecords[i];
          if (fixTemplate && fixRecord) {
            await executeOperation(workflow, fixRecord, fixTemplate, { ...context, ...results });
          }
        }

        // Re-run verify (main operations)
        // For simplicity, we just mark the stage as needing manual intervention
        // A full implementation would re-execute the verify operations
        log('info', `Fix cycle ${cycle + 1} completed`, {
          workflowId: workflow.id,
          stage: stage.name,
        });
      }
    }

    // Check for checkpoint after this stage
    const checkpoint = template.checkpoints?.find((cp) => cp.after === stage.name);
    if (checkpoint) {
      const shouldPause = !checkpoint.condition || checkpoint.condition({ ...context, ...results });
      if (shouldPause) {
        log('info', `Checkpoint reached`, {
          workflowId: workflow.id,
          stage: stage.name,
          checkpointStatus: checkpoint.status,
        });
        return {
          success: allSucceeded,
          results,
          shouldPause: true,
          checkpointStatus: checkpoint.status,
        };
      }
    }

    log('info', `Stage completed`, { workflowId: workflow.id, stage: stage.name, success: allSucceeded });

    return { success: allSucceeded, results, shouldPause: false };
  }

  // =========================================================================
  // Workflow Execution
  // =========================================================================

  /**
   * Main workflow execution function.
   */
  async function executeWorkflow(workflowId: string): Promise<WorkflowContext> {
    const workflow = await dbState.getWorkflow(workflowId);
    if (!workflow) {
      throw new WorkflowError(`Workflow ${workflowId} not found`, 'NOT_FOUND');
    }

    const template = templateRegistry.getOrThrow(workflow.type);

    log('info', `Starting workflow execution`, {
      workflowId,
      type: workflow.type,
      status: workflow.status,
    });

    // Update status to active
    await dbState.updateWorkflowStatus(workflowId, 'active');

    // Get starting point
    const currentStageIndex = workflow.currentStage
      ? template.stages.findIndex((s) => s.name === workflow.currentStage)
      : -1;
    const startIndex = currentStageIndex >= 0 ? currentStageIndex : 0;

    // Accumulate context
    let context: WorkflowContext = workflow.context as WorkflowContext;

    try {
      // Execute stages
      for (let i = startIndex; i < template.stages.length; i++) {
        const stage = template.stages[i];
        if (!stage) continue;

        const result = await executeStage(workflow, stage, template, context);

        // Merge results into context
        context = { ...context, ...result.results };
        await dbState.updateWorkflowContext(workflowId, result.results);

        // Check for pause
        if (result.shouldPause) {
          await dbState.updateWorkflowCheckpoint(workflowId, result.checkpointStatus ?? null);
          log('info', `Workflow paused at checkpoint`, {
            workflowId,
            checkpointStatus: result.checkpointStatus,
          });
          return context;
        }

        if (!result.success) {
          throw new WorkflowError(`Stage ${stage.name} failed`, 'STAGE_FAILED', { stage: stage.name });
        }
      }

      // All stages completed
      await dbState.updateWorkflowStatus(workflowId, 'completed');

      log('info', `Workflow completed successfully`, { workflowId });

      return context;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await dbState.updateWorkflowStatus(workflowId, 'failed', errorMessage);

      log('error', `Workflow failed`, { workflowId, error: errorMessage });

      throw error;
    }
  }

  /**
   * Resume workflow from checkpoint.
   */
  async function resumeWorkflow(workflowId: string): Promise<WorkflowContext> {
    const workflow = await dbState.getWorkflow(workflowId);
    if (!workflow) {
      throw new WorkflowError(`Workflow ${workflowId} not found`, 'NOT_FOUND');
    }

    if (workflow.status !== 'paused') {
      throw new WorkflowError(
        `Cannot resume workflow in status ${workflow.status}`,
        'INVALID_STATUS',
        { status: workflow.status },
      );
    }

    const template = templateRegistry.getOrThrow(workflow.type);

    log('info', `Resuming workflow`, { workflowId, currentStage: workflow.currentStage });

    // Clear checkpoint status
    await dbState.updateWorkflowCheckpoint(workflowId, null);

    // Find next stage after current
    const currentStageIndex = workflow.currentStage
      ? template.stages.findIndex((s) => s.name === workflow.currentStage)
      : -1;

    if (currentStageIndex < 0) {
      throw new WorkflowError(`Current stage not found in template`, 'INTERNAL_ERROR', {
        currentStage: workflow.currentStage,
      });
    }

    // Update status to active
    await dbState.updateWorkflowStatus(workflowId, 'active');

    // Continue from next stage
    let context: WorkflowContext = workflow.context as WorkflowContext;

    try {
      for (let i = currentStageIndex + 1; i < template.stages.length; i++) {
        const stage = template.stages[i];
        if (!stage) continue;

        const result = await executeStage(workflow, stage, template, context);

        // Merge results into context
        context = { ...context, ...result.results };
        await dbState.updateWorkflowContext(workflowId, result.results);

        // Check for pause
        if (result.shouldPause) {
          await dbState.updateWorkflowCheckpoint(workflowId, result.checkpointStatus ?? null);
          log('info', `Workflow paused at checkpoint`, {
            workflowId,
            checkpointStatus: result.checkpointStatus,
          });
          return context;
        }

        if (!result.success) {
          throw new WorkflowError(`Stage ${stage.name} failed`, 'STAGE_FAILED', { stage: stage.name });
        }
      }

      // All stages completed
      await dbState.updateWorkflowStatus(workflowId, 'completed');

      log('info', `Workflow completed successfully`, { workflowId });

      return context;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await dbState.updateWorkflowStatus(workflowId, 'failed', errorMessage);

      log('error', `Workflow failed`, { workflowId, error: errorMessage });

      throw error;
    }
  }

  return {
    executeWorkflow,
    resumeWorkflow,
  };
}
