/// <reference types="vitest/globals" />
/**
 * Integration tests for basic workflow execution.
 *
 * These tests verify that the core workflow components work together correctly
 * using mock implementations of the database layer.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createTemplateRegistry } from '../../src/templates/registry';
import { createOperationRegistry } from '../../src/operations/registry';
import { createExecutionEngine } from '../../src/engine/execution-engine';
import type { WorkflowTemplate, OperationHandler } from '../../src/types';
import type { DbState } from '../../src/infrastructure/db-state';
import type { Workflow, WorkflowOperation } from '../../src/infrastructure/schema';

// =============================================================================
// Mock DbState
// =============================================================================

interface MockDbState extends DbState {
  workflows: Map<string, Workflow>;
  operations: Map<string, WorkflowOperation>;
}

function createMockDbState(): MockDbState {
  const workflows = new Map<string, Workflow>();
  const operations = new Map<string, WorkflowOperation>();
  let operationIdCounter = 0;

  return {
    workflows,
    operations,

    async createWorkflow(data) {
      const workflow: Workflow = {
        id: `wf-${Date.now()}`,
        type: data.type,
        status: 'pending',
        context: data.context ?? {},
        currentStage: null,
        checkpointStatus: null,
        errorMessage: null,
        templateVersion: data.templateVersion,
        jobId: data.jobId ?? null,
        createdAt: new Date(),
        startedAt: null,
        completedAt: null,
      };
      workflows.set(workflow.id, workflow);
      return workflow;
    },

    async getWorkflow(id) {
      return workflows.get(id) ?? null;
    },

    async getWorkflowByJobId(jobId) {
      for (const wf of workflows.values()) {
        if (wf.jobId === jobId) return wf;
      }
      return null;
    },

    async updateWorkflowStatus(id, status, errorMessage) {
      const wf = workflows.get(id);
      if (wf) {
        wf.status = status;
        if (errorMessage) wf.errorMessage = errorMessage;
        if (status === 'active' && !wf.startedAt) wf.startedAt = new Date();
        if (status === 'completed' || status === 'failed') wf.completedAt = new Date();
      }
      return wf ?? null;
    },

    async updateWorkflowStage(id, stage) {
      const wf = workflows.get(id);
      if (wf) wf.currentStage = stage;
      return wf ?? null;
    },

    async updateWorkflowContext(id, context) {
      const wf = workflows.get(id);
      if (wf) wf.context = { ...(wf.context as object), ...context };
      return wf ?? null;
    },

    async updateWorkflowCheckpoint(id, status) {
      const wf = workflows.get(id);
      if (wf) {
        wf.checkpointStatus = status;
        if (status) wf.status = 'paused';
      }
      return wf ?? null;
    },

    async setWorkflowJobId(id, jobId) {
      const wf = workflows.get(id);
      if (wf) wf.jobId = jobId;
      return wf ?? null;
    },

    async listWorkflows() {
      return Array.from(workflows.values());
    },

    async createOperation(data) {
      const operation: WorkflowOperation = {
        id: `op-${++operationIdCounter}`,
        workflowId: data.workflowId,
        type: data.type,
        stage: data.stage,
        status: 'pending',
        result: null,
        errorMessage: null,
        attempts: 0,
        maxAttempts: data.maxAttempts,
        createdAt: new Date(),
        startedAt: null,
        completedAt: null,
      };
      operations.set(operation.id, operation);
      return operation;
    },

    async createOperations(data) {
      const created: WorkflowOperation[] = [];
      for (const op of data) {
        const operation: WorkflowOperation = {
          id: `op-${++operationIdCounter}`,
          workflowId: op.workflowId,
          type: op.type,
          stage: op.stage,
          status: 'pending',
          result: null,
          errorMessage: null,
          attempts: 0,
          maxAttempts: op.maxAttempts,
          createdAt: new Date(),
          startedAt: null,
          completedAt: null,
        };
        operations.set(operation.id, operation);
        created.push(operation);
      }
      return created;
    },

    async getOperation(id) {
      return operations.get(id) ?? null;
    },

    async getOperationsByWorkflow(workflowId) {
      return Array.from(operations.values()).filter((op) => op.workflowId === workflowId);
    },

    async getOperationsByStage(workflowId, stage) {
      return Array.from(operations.values()).filter(
        (op) => op.workflowId === workflowId && op.stage === stage
      );
    },

    async updateOperationStatus(id, status, errorMessage) {
      const op = operations.get(id);
      if (op) {
        op.status = status;
        if (errorMessage) op.errorMessage = errorMessage;
        if (status === 'active' && !op.startedAt) op.startedAt = new Date();
        if (status === 'completed' || status === 'failed' || status === 'skipped') {
          op.completedAt = new Date();
        }
      }
      return op ?? null;
    },

    async updateOperationResult(id, result) {
      const op = operations.get(id);
      if (op) {
        op.status = 'completed';
        op.result = result;
        op.completedAt = new Date();
      }
      return op ?? null;
    },

    async incrementOperationAttempts(id) {
      const op = operations.get(id);
      if (op) op.attempts++;
      return op ?? null;
    },

    async deleteOperationsByWorkflow(workflowId) {
      let count = 0;
      for (const [id, op] of operations) {
        if (op.workflowId === workflowId) {
          operations.delete(id);
          count++;
        }
      }
      return count;
    },

    // Lock methods (not used in these tests)
    async acquireLock() {
      return true;
    },
    async releaseLock() {
      return true;
    },
    async releaseLocksByWorkflow() {
      return 0;
    },
    async getLock() {
      return null;
    },
    async cleanupExpiredLocks() {
      return 0;
    },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('Basic Workflow Execution', () => {
  let dbState: ReturnType<typeof createMockDbState>;
  let templateRegistry: ReturnType<typeof createTemplateRegistry>;
  let operationRegistry: ReturnType<typeof createOperationRegistry>;
  let engine: ReturnType<typeof createExecutionEngine>;

  beforeEach(() => {
    dbState = createMockDbState();
    templateRegistry = createTemplateRegistry();
    operationRegistry = createOperationRegistry();
    engine = createExecutionEngine({
      dbState,
      templateRegistry,
      operationRegistry,
      defaultTimeout: 5000,
      defaultRetryLimit: 3,
    });
  });

  describe('Simple sequential workflow', () => {
    const simpleTemplate: WorkflowTemplate = {
      type: 'simple-workflow',
      queue: 'default',
      version: '1.0.0',
      description: 'A simple sequential workflow',
      stages: [
        {
          name: 'gather',
          operations: [{ type: 'gather.data' }],
        },
        {
          name: 'process',
          operations: [{ type: 'process.transform' }],
        },
      ],
    };

    it('should execute all stages sequentially', async () => {
      // Register template
      templateRegistry.register(simpleTemplate);

      // Register handlers
      const gatherHandler: OperationHandler = async (ctx) => {
        return {
          status: 'completed',
          data: { gatheredData: { url: ctx.initialContext.url } },
        };
      };

      const processHandler: OperationHandler = async (ctx) => {
        return {
          status: 'completed',
          data: { processedData: `Processed: ${JSON.stringify(ctx.previousResults.gatheredData)}` },
        };
      };

      operationRegistry.register('gather.data', gatherHandler);
      operationRegistry.register('process.transform', processHandler);

      // Create workflow
      const workflow = await dbState.createWorkflow({
        type: 'simple-workflow',
        context: { url: 'https://example.com' },
        templateVersion: '1.0.0',
      });

      // Execute
      const result = await engine.executeWorkflow(workflow.id);

      // Verify result
      expect(result.gatheredData).toEqual({ url: 'https://example.com' });
      expect(result.processedData).toContain('Processed:');

      // Verify workflow status
      const updatedWorkflow = await dbState.getWorkflow(workflow.id);
      expect(updatedWorkflow?.status).toBe('completed');
      expect(updatedWorkflow?.completedAt).toBeDefined();

      // Verify operations
      const operations = await dbState.getOperationsByWorkflow(workflow.id);
      expect(operations).toHaveLength(2);
      expect(operations.every((op) => op.status === 'completed')).toBe(true);
    });
  });

  describe('Parallel stage execution', () => {
    const parallelTemplate: WorkflowTemplate = {
      type: 'parallel-workflow',
      queue: 'default',
      version: '1.0.0',
      stages: [
        {
          name: 'analyze',
          parallel: true,
          operations: [
            { type: 'analyze.content' },
            { type: 'analyze.competitors' },
            { type: 'analyze.market' },
          ],
        },
      ],
    };

    it('should execute parallel operations concurrently', async () => {
      templateRegistry.register(parallelTemplate);

      const executionOrder: string[] = [];

      operationRegistry.register('analyze.content', async () => {
        executionOrder.push('content-start');
        await new Promise((r) => setTimeout(r, 50));
        executionOrder.push('content-end');
        return { status: 'completed', data: { contentScore: 85 } };
      });

      operationRegistry.register('analyze.competitors', async () => {
        executionOrder.push('competitors-start');
        await new Promise((r) => setTimeout(r, 30));
        executionOrder.push('competitors-end');
        return { status: 'completed', data: { competitorCount: 5 } };
      });

      operationRegistry.register('analyze.market', async () => {
        executionOrder.push('market-start');
        await new Promise((r) => setTimeout(r, 40));
        executionOrder.push('market-end');
        return { status: 'completed', data: { marketSize: 1000000 } };
      });

      const workflow = await dbState.createWorkflow({
        type: 'parallel-workflow',
        context: {},
        templateVersion: '1.0.0',
      });

      const result = await engine.executeWorkflow(workflow.id);

      // Verify all results merged
      expect(result.contentScore).toBe(85);
      expect(result.competitorCount).toBe(5);
      expect(result.marketSize).toBe(1000000);

      // Verify parallel execution (all starts should come before any ends complete in sequence)
      const startIndices = executionOrder
        .filter((e) => e.endsWith('-start'))
        .map((e) => executionOrder.indexOf(e));
      const endIndices = executionOrder
        .filter((e) => e.endsWith('-end'))
        .map((e) => executionOrder.indexOf(e));

      // All starts should happen before the first end
      expect(Math.max(...startIndices)).toBeLessThan(Math.min(...endIndices));
    });
  });

  describe('Workflow with checkpoint', () => {
    const checkpointTemplate: WorkflowTemplate = {
      type: 'checkpoint-workflow',
      queue: 'default',
      version: '1.0.0',
      stages: [
        {
          name: 'gather',
          operations: [{ type: 'gather.data' }],
        },
        {
          name: 'generate',
          operations: [{ type: 'generate.output' }],
        },
      ],
      checkpoints: [
        {
          after: 'gather',
          status: 'data_ready',
        },
      ],
    };

    it('should pause at checkpoint and allow resume', async () => {
      templateRegistry.register(checkpointTemplate);

      operationRegistry.register('gather.data', async () => {
        return { status: 'completed', data: { gathered: true } };
      });

      operationRegistry.register('generate.output', async () => {
        return { status: 'completed', data: { generated: true } };
      });

      const workflow = await dbState.createWorkflow({
        type: 'checkpoint-workflow',
        context: {},
        templateVersion: '1.0.0',
      });

      // First execution should pause at checkpoint
      const result1 = await engine.executeWorkflow(workflow.id);
      expect(result1.gathered).toBe(true);
      expect(result1.generated).toBeUndefined();

      const pausedWorkflow = await dbState.getWorkflow(workflow.id);
      expect(pausedWorkflow?.status).toBe('paused');
      expect(pausedWorkflow?.checkpointStatus).toBe('data_ready');
      expect(pausedWorkflow?.currentStage).toBe('gather');

      // Resume workflow
      const result2 = await engine.resumeWorkflow(workflow.id);
      expect(result2.generated).toBe(true);

      const completedWorkflow = await dbState.getWorkflow(workflow.id);
      expect(completedWorkflow?.status).toBe('completed');
    });

    it('should skip checkpoint when condition returns false', async () => {
      const conditionalCheckpointTemplate: WorkflowTemplate = {
        type: 'conditional-checkpoint',
        queue: 'default',
        version: '1.0.0',
        stages: [
          {
            name: 'gather',
            operations: [{ type: 'gather.data' }],
          },
          {
            name: 'generate',
            operations: [{ type: 'generate.output' }],
          },
        ],
        checkpoints: [
          {
            after: 'gather',
            status: 'data_ready',
            condition: (ctx) => ctx.requiresReview === true,
          },
        ],
      };

      templateRegistry.register(conditionalCheckpointTemplate);

      operationRegistry.register('gather.data', async () => {
        return { status: 'completed', data: { gathered: true } };
      });

      operationRegistry.register('generate.output', async () => {
        return { status: 'completed', data: { generated: true } };
      });

      // Without requiresReview flag, checkpoint should be skipped
      const workflow = await dbState.createWorkflow({
        type: 'conditional-checkpoint',
        context: { requiresReview: false },
        templateVersion: '1.0.0',
      });

      const result = await engine.executeWorkflow(workflow.id);

      expect(result.gathered).toBe(true);
      expect(result.generated).toBe(true);

      const completedWorkflow = await dbState.getWorkflow(workflow.id);
      expect(completedWorkflow?.status).toBe('completed');
    });
  });

  describe('Operation failure and retry', () => {
    it('should retry failed operations up to maxAttempts', async () => {
      const retryTemplate: WorkflowTemplate = {
        type: 'retry-workflow',
        queue: 'default',
        version: '1.0.0',
        stages: [
          {
            name: 'flaky',
            operations: [{ type: 'flaky.operation', maxAttempts: 3 }],
          },
        ],
      };

      templateRegistry.register(retryTemplate);

      let attempts = 0;
      operationRegistry.register('flaky.operation', async () => {
        attempts++;
        if (attempts < 3) {
          return { status: 'failed', reason: `Attempt ${attempts} failed` };
        }
        return { status: 'completed', data: { success: true, attempts } };
      });

      const workflow = await dbState.createWorkflow({
        type: 'retry-workflow',
        context: {},
        templateVersion: '1.0.0',
      });

      const result = await engine.executeWorkflow(workflow.id);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(attempts).toBe(3);
    }, 15000); // Increased timeout due to exponential backoff delays

    it('should fail workflow after all retries exhausted', async () => {
      const failTemplate: WorkflowTemplate = {
        type: 'fail-workflow',
        queue: 'default',
        version: '1.0.0',
        stages: [
          {
            name: 'always-fails',
            operations: [{ type: 'always.fail', maxAttempts: 2 }],
          },
        ],
      };

      templateRegistry.register(failTemplate);

      operationRegistry.register('always.fail', async () => {
        return { status: 'failed', reason: 'Always fails' };
      });

      const workflow = await dbState.createWorkflow({
        type: 'fail-workflow',
        context: {},
        templateVersion: '1.0.0',
      });

      await expect(engine.executeWorkflow(workflow.id)).rejects.toThrow();

      const failedWorkflow = await dbState.getWorkflow(workflow.id);
      expect(failedWorkflow?.status).toBe('failed');
      expect(failedWorkflow?.errorMessage).toBeDefined();
    }, 10000); // Increased timeout due to exponential backoff delays
  });

  describe('Conditional operations', () => {
    it('should skip operation when condition returns false', async () => {
      const conditionalTemplate: WorkflowTemplate = {
        type: 'conditional-workflow',
        queue: 'default',
        version: '1.0.0',
        stages: [
          {
            name: 'process',
            operations: [
              { type: 'always.run' },
              {
                type: 'conditional.run',
                condition: (ctx) => ctx.shouldRunConditional === true,
              },
            ],
          },
        ],
      };

      templateRegistry.register(conditionalTemplate);

      const executedOps: string[] = [];

      operationRegistry.register('always.run', async () => {
        executedOps.push('always');
        return { status: 'completed', data: { always: true } };
      });

      operationRegistry.register('conditional.run', async () => {
        executedOps.push('conditional');
        return { status: 'completed', data: { conditional: true } };
      });

      const workflow = await dbState.createWorkflow({
        type: 'conditional-workflow',
        context: { shouldRunConditional: false },
        templateVersion: '1.0.0',
      });

      const result = await engine.executeWorkflow(workflow.id);

      expect(result.always).toBe(true);
      expect(result.conditional).toBeUndefined();
      expect(executedOps).toEqual(['always']);
    });
  });

  describe('Context accumulation', () => {
    it('should accumulate context from all operations', async () => {
      const accumulatingTemplate: WorkflowTemplate = {
        type: 'accumulating-workflow',
        queue: 'default',
        version: '1.0.0',
        stages: [
          {
            name: 'stage1',
            operations: [{ type: 'op1' }],
          },
          {
            name: 'stage2',
            operations: [{ type: 'op2' }],
          },
          {
            name: 'stage3',
            operations: [{ type: 'op3' }],
          },
        ],
      };

      templateRegistry.register(accumulatingTemplate);

      operationRegistry.register('op1', async (ctx) => {
        return {
          status: 'completed',
          data: { step1: 'done', input: ctx.initialContext.input },
        };
      });

      operationRegistry.register('op2', async (ctx) => {
        // Previous results should include step1
        expect(ctx.previousResults.step1).toBe('done');
        return { status: 'completed', data: { step2: 'done' } };
      });

      operationRegistry.register('op3', async (ctx) => {
        // Previous results should include step1 and step2
        expect(ctx.previousResults.step1).toBe('done');
        expect(ctx.previousResults.step2).toBe('done');
        return { status: 'completed', data: { step3: 'done' } };
      });

      const workflow = await dbState.createWorkflow({
        type: 'accumulating-workflow',
        context: { input: 'test-input' },
        templateVersion: '1.0.0',
      });

      const result = await engine.executeWorkflow(workflow.id);

      expect(result.input).toBe('test-input');
      expect(result.step1).toBe('done');
      expect(result.step2).toBe('done');
      expect(result.step3).toBe('done');
    });
  });

  describe('Validation', () => {
    it('should validate templates have all required handlers', () => {
      const template: WorkflowTemplate = {
        type: 'validation-test',
        queue: 'default',
        version: '1.0.0',
        stages: [
          {
            name: 'test',
            operations: [{ type: 'missing.handler' }],
          },
        ],
      };

      templateRegistry.register(template);

      // Validation should fail because missing.handler isn't registered
      const errors = templateRegistry.validateAll(operationRegistry.types());
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('no handler registered'))).toBe(true);
    });

    it('should pass validation when all handlers exist', () => {
      const template: WorkflowTemplate = {
        type: 'valid-workflow',
        queue: 'default',
        version: '1.0.0',
        stages: [
          {
            name: 'test',
            operations: [{ type: 'existing.handler' }],
          },
        ],
      };

      templateRegistry.register(template);
      operationRegistry.register('existing.handler', async () => ({
        status: 'completed',
      }));

      const errors = templateRegistry.validateAll(operationRegistry.types());
      expect(errors).toHaveLength(0);
    });
  });
});
