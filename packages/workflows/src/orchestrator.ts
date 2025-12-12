/**
 * Workflow Orchestrator - Main public API.
 *
 * This module provides the primary interface for the workflow orchestration system.
 * It combines template registration, operation handlers, job queuing, and execution
 * into a single, easy-to-use API.
 *
 * @example
 * ```typescript
 * import { createWorkflowOrchestrator } from '@sprqvntrs/workflows';
 *
 * const orchestrator = await createWorkflowOrchestrator({
 *   connectionString: process.env.DATABASE_URL,
 *   db: drizzleInstance,
 *   queues: [
 *     { name: 'default', workers: 5 },
 *     { name: 'sequential', workers: 1 },
 *   ],
 * });
 *
 * // Register templates and operations
 * orchestrator.registerTemplate(myTemplate);
 * orchestrator.registerOperation('gather.data', gatherHandler);
 *
 * // Start a workflow
 * const { workflowId } = await orchestrator.start({
 *   type: 'my-workflow',
 *   context: { documentId: '123' },
 * });
 * ```
 */

import PgBoss from 'pg-boss';
import type {
  OrchestratorConfig,
  WorkflowTemplate,
  OperationHandler,
  StartWorkflowOptions,
  StartWorkflowResult,
  ScheduleOptions,
  WorkflowContext,
  WorkflowStatusDetails,
  WorkflowRecord,
} from './types';
import { WorkflowError, TemplateError } from './types';
import {
  createBoss,
  createSendOptions,
  setupGracefulShutdown,
  setupEventListeners,
  type WorkflowJobData,
  type PgBossConfig,
} from './infrastructure/pg-boss';
import { createDbState, type DbState, type Database } from './infrastructure/db-state';
import { createTemplateRegistry, type TemplateRegistry } from './templates/registry';
import { createOperationRegistry, type OperationRegistry } from './operations/registry';
import { createExecutionEngine } from './engine/execution-engine';

// =============================================================================
// Types
// =============================================================================

/**
 * Extended orchestrator configuration with database instance.
 */
export interface CreateOrchestratorConfig extends OrchestratorConfig {
  /**
   * Drizzle database instance.
   */
  db: Database;
}

/**
 * Workflow orchestrator interface.
 *
 * The main public API for the workflow system.
 */
export interface WorkflowOrchestrator {
  // =========================================================================
  // Registration
  // =========================================================================

  /**
   * Registers a workflow template.
   *
   * @param template - Template to register
   * @throws TemplateError if template is invalid or already registered
   *
   * @example
   * ```typescript
   * orchestrator.registerTemplate({
   *   type: 'content-generation',
   *   queue: 'default',
   *   version: '1.0.0',
   *   stages: [
   *     { name: 'gather', operations: [{ type: 'gather.data' }] },
   *     { name: 'generate', operations: [{ type: 'generate.content' }] },
   *   ],
   * });
   * ```
   */
  registerTemplate: (template: WorkflowTemplate) => void;

  /**
   * Registers multiple templates at once.
   *
   * @param templates - Templates to register
   *
   * @example
   * ```typescript
   * orchestrator.registerTemplates([template1, template2, template3]);
   * ```
   */
  registerTemplates: (templates: WorkflowTemplate[]) => void;

  /**
   * Registers an operation handler.
   *
   * @param type - Operation type identifier
   * @param handler - Handler function
   *
   * @example
   * ```typescript
   * orchestrator.registerOperation('gather.data', async (context) => {
   *   const data = await fetchData(context.previousResults.url);
   *   return { status: 'completed', data: { fetchedData: data } };
   * });
   * ```
   */
  registerOperation: <TContext = Record<string, unknown>, TResult = Record<string, unknown>>(
    type: string,
    handler: OperationHandler<TContext, TResult>,
  ) => void;

  /**
   * Registers multiple operation handlers at once.
   *
   * @param handlers - Map of type to handler
   *
   * @example
   * ```typescript
   * orchestrator.registerOperations({
   *   'gather.data': gatherHandler,
   *   'analyze.content': analyzeHandler,
   *   'generate.report': generateHandler,
   * });
   * ```
   */
  registerOperations: (handlers: Record<string, OperationHandler>) => void;

  // =========================================================================
  // Workflow Lifecycle
  // =========================================================================

  /**
   * Starts a new workflow.
   *
   * Creates the workflow record and queues it for execution.
   *
   * @param options - Workflow start options
   * @returns Workflow ID and job ID
   *
   * @example
   * ```typescript
   * const { workflowId, jobId } = await orchestrator.start({
   *   type: 'content-generation',
   *   context: { documentId: '123', userId: 'user-456' },
   *   priority: 10,
   * });
   * console.log(`Started workflow ${workflowId}`);
   * ```
   */
  start: (options: StartWorkflowOptions) => Promise<StartWorkflowResult>;

  /**
   * Resumes a paused workflow.
   *
   * Clears the checkpoint and queues the workflow to continue execution.
   *
   * @param workflowId - Workflow to resume
   * @returns Job ID for the resume job
   *
   * @example
   * ```typescript
   * const jobId = await orchestrator.resume('workflow-123');
   * console.log(`Resumed workflow, job: ${jobId}`);
   * ```
   */
  resume: (workflowId: string) => Promise<string>;

  /**
   * Cancels a workflow.
   *
   * Marks the workflow as cancelled and releases any locks.
   *
   * @param workflowId - Workflow to cancel
   *
   * @example
   * ```typescript
   * await orchestrator.cancel('workflow-123');
   * ```
   */
  cancel: (workflowId: string) => Promise<void>;

  /**
   * Retries a failed workflow.
   *
   * Cleans up the previous attempt and queues a new execution.
   *
   * @param workflowId - Workflow to retry
   * @returns New job ID
   *
   * @example
   * ```typescript
   * const jobId = await orchestrator.retry('workflow-123');
   * ```
   */
  retry: (workflowId: string) => Promise<string>;

  // =========================================================================
  // Scheduling
  // =========================================================================

  /**
   * Schedules a recurring workflow.
   *
   * Uses pg-boss's built-in cron scheduling.
   *
   * @param options - Schedule options
   *
   * @example
   * ```typescript
   * await orchestrator.schedule({
   *   name: 'daily-cleanup',
   *   cron: '0 4 * * *', // Daily at 4 AM
   *   type: 'cleanup-workflow',
   *   context: { scope: 'all' },
   * });
   * ```
   */
  schedule: (options: ScheduleOptions) => Promise<void>;

  /**
   * Removes a scheduled recurring workflow.
   *
   * @param name - Schedule name to remove
   *
   * @example
   * ```typescript
   * await orchestrator.unschedule('daily-cleanup');
   * ```
   */
  unschedule: (name: string) => Promise<void>;

  // =========================================================================
  // Status & Queries
  // =========================================================================

  /**
   * Gets the status of a workflow.
   *
   * @param workflowId - Workflow to query
   * @returns Workflow status details
   *
   * @example
   * ```typescript
   * const status = await orchestrator.getStatus('workflow-123');
   * console.log(`Progress: ${status.progress}%`);
   * console.log(`Current stage: ${status.workflow.currentStage}`);
   * ```
   */
  getStatus: (workflowId: string) => Promise<WorkflowStatusDetails>;

  /**
   * Gets a workflow by ID.
   *
   * @param workflowId - Workflow ID
   * @returns Workflow record or null
   *
   * @example
   * ```typescript
   * const workflow = await orchestrator.getWorkflow('workflow-123');
   * if (workflow) {
   *   console.log(`Status: ${workflow.status}`);
   * }
   * ```
   */
  getWorkflow: (workflowId: string) => Promise<WorkflowRecord | null>;

  /**
   * Lists workflows with optional filtering.
   *
   * @param options - List options
   * @returns Array of workflows
   *
   * @example
   * ```typescript
   * // Get all active workflows
   * const active = await orchestrator.listWorkflows({ status: 'active' });
   *
   * // Get recent failed workflows
   * const failed = await orchestrator.listWorkflows({
   *   status: 'failed',
   *   limit: 10,
   * });
   * ```
   */
  listWorkflows: (options?: {
    type?: string;
    status?: string | string[];
    limit?: number;
    offset?: number;
  }) => Promise<WorkflowRecord[]>;

  // =========================================================================
  // Worker Management
  // =========================================================================

  /**
   * Starts the worker to process jobs.
   *
   * This should be called in your worker process.
   *
   * @example
   * ```typescript
   * // worker.ts
   * const orchestrator = await createWorkflowOrchestrator(config);
   *
   * // Register templates and operations...
   *
   * // Validate all templates
   * orchestrator.validate();
   *
   * // Start processing
   * await orchestrator.startWorker();
   * ```
   */
  startWorker: () => Promise<void>;

  /**
   * Stops the worker gracefully.
   *
   * Waits for current jobs to complete before stopping.
   *
   * @example
   * ```typescript
   * await orchestrator.stopWorker();
   * ```
   */
  stopWorker: () => Promise<void>;

  // =========================================================================
  // Validation
  // =========================================================================

  /**
   * Validates all registered templates against registered operations.
   *
   * Should be called at worker startup to catch configuration errors early.
   *
   * @throws TemplateError if validation fails
   *
   * @example
   * ```typescript
   * // After registering all templates and operations
   * orchestrator.validate();
   * console.log('All templates validated successfully');
   * ```
   */
  validate: () => void;

  // =========================================================================
  // Advanced Access
  // =========================================================================

  /**
   * Gets the underlying pg-boss instance for advanced operations.
   *
   * Use with caution - prefer the orchestrator API when possible.
   *
   * @returns pg-boss instance
   */
  getBoss: () => PgBoss;

  /**
   * Gets the template registry for advanced operations.
   *
   * @returns Template registry
   */
  getTemplateRegistry: () => TemplateRegistry;

  /**
   * Gets the operation registry for advanced operations.
   *
   * @returns Operation registry
   */
  getOperationRegistry: () => OperationRegistry;

  /**
   * Gets the database state manager for advanced operations.
   *
   * @returns Database state manager
   */
  getDbState: () => DbState;
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Creates a workflow orchestrator instance.
 *
 * This is the main entry point for the workflow package. It sets up all
 * the necessary components and returns a unified API.
 *
 * @param config - Orchestrator configuration
 * @returns Workflow orchestrator instance
 *
 * @example
 * ```typescript
 * import { createWorkflowOrchestrator } from '@sprqvntrs/workflows';
 * import { drizzle } from 'drizzle-orm/node-postgres';
 * import { Pool } from 'pg';
 *
 * // Create database connection
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const db = drizzle(pool);
 *
 * // Create orchestrator
 * const orchestrator = await createWorkflowOrchestrator({
 *   connectionString: process.env.DATABASE_URL,
 *   db,
 *   queues: [
 *     { name: 'default', workers: 5 },
 *     { name: 'heavy', workers: 2 },
 *     { name: 'sequential', workers: 1 },
 *   ],
 *   defaultTimeout: 30000,
 *   defaultRetryLimit: 3,
 *   debug: process.env.NODE_ENV === 'development',
 * });
 *
 * // Register templates
 * orchestrator.registerTemplate({
 *   type: 'content-generation',
 *   queue: 'default',
 *   version: '1.0.0',
 *   stages: [
 *     { name: 'gather', operations: [{ type: 'gather.data' }] },
 *     { name: 'analyze', parallel: true, operations: [
 *       { type: 'analyze.content' },
 *       { type: 'analyze.market' },
 *     ]},
 *     { name: 'generate', operations: [{ type: 'generate.report' }] },
 *   ],
 *   checkpoints: [
 *     { after: 'gather', status: 'data_ready' },
 *   ],
 * });
 *
 * // Register operation handlers
 * orchestrator.registerOperations({
 *   'gather.data': async (ctx) => {
 *     // Fetch data...
 *     return { status: 'completed', data: { fetchedData: {} } };
 *   },
 *   'analyze.content': async (ctx) => {
 *     // Analyze...
 *     return { status: 'completed', data: { analysis: {} } };
 *   },
 *   // ... more handlers
 * });
 *
 * // In your API handler
 * app.post('/workflows', async (req, res) => {
 *   const { workflowId } = await orchestrator.start({
 *     type: 'content-generation',
 *     context: req.body,
 *   });
 *   res.json({ workflowId });
 * });
 *
 * // In your worker process
 * // worker.ts
 * orchestrator.validate();
 * await orchestrator.startWorker();
 * ```
 */
export async function createWorkflowOrchestrator(
  config: CreateOrchestratorConfig,
): Promise<WorkflowOrchestrator> {
  const {
    connectionString,
    db,
    queues,
    defaultTimeout = 30000,
    defaultRetryLimit = 3,
    defaultRetryDelay = 5,
    schema = 'pgboss',
    debug = false,
    application = 'workflow-orchestrator',
  } = config;

  // Create pg-boss instance
  const bossConfig: PgBossConfig = {
    connectionString,
    schema,
    application,
    debug,
  };
  const boss = createBoss(bossConfig);

  // Create registries
  const templateRegistry = createTemplateRegistry();
  const operationRegistry = createOperationRegistry();

  // Create database state manager
  const dbState = createDbState(db);

  // Create execution engine
  const engine = createExecutionEngine({
    dbState,
    templateRegistry,
    operationRegistry,
    defaultTimeout,
    defaultRetryLimit,
    onLog: debug
      ? (level, message, data) => {
          console[level](`[workflow] ${message}`, data ?? '');
        }
      : undefined,
  });

  // Start pg-boss immediately so jobs can be sent without starting the worker
  // This is essential for server/worker split architectures where the server
  // needs to queue jobs but doesn't run the worker
  await boss.start();

  if (debug) {
    console.log('[workflow] pg-boss started');
  }

  // Create all configured queues (pg-boss v10+ requires explicit queue creation)
  const createdQueues = new Set<string>();
  for (const queue of queues) {
    await boss.createQueue(queue.name);
    createdQueues.add(queue.name);
    if (debug) {
      console.log(`[workflow] Created queue: ${queue.name}`);
    }
  }

  // Track if worker is running (separate from boss being started)
  let workerStarted = false;

  // =========================================================================
  // Helper Functions
  // =========================================================================

  /**
   * Ensures a queue exists, creating it if necessary.
   * This is idempotent - calling multiple times is safe.
   */
  async function ensureQueueExists(queueName: string): Promise<void> {
    if (!createdQueues.has(queueName)) {
      await boss.createQueue(queueName);
      createdQueues.add(queueName);
      if (debug) {
        console.log(`[workflow] Created queue on-demand: ${queueName}`);
      }
    }
  }

  /**
   * Processes a workflow job.
   */
  async function processWorkflowJob(job: PgBoss.Job<WorkflowJobData>): Promise<void> {
    const { workflowId, workflowType } = job.data;

    if (debug) {
      console.log(`[workflow] Processing job for workflow ${workflowId} (${workflowType})`);
    }

    try {
      await engine.executeWorkflow(workflowId);
    } catch (error) {
      // Error is already logged and workflow status updated by engine
      // Re-throw to let pg-boss handle retry
      throw error;
    }
  }

  // =========================================================================
  // Public API
  // =========================================================================

  const orchestrator: WorkflowOrchestrator = {
    // Registration
    registerTemplate(template: WorkflowTemplate): void {
      templateRegistry.register(template);
    },

    registerTemplates(templates: WorkflowTemplate[]): void {
      templateRegistry.registerMany(templates);
    },

    registerOperation<TContext = Record<string, unknown>, TResult = Record<string, unknown>>(
      type: string,
      handler: OperationHandler<TContext, TResult>,
    ): void {
      operationRegistry.register(type, handler);
    },

    registerOperations(handlers: Record<string, OperationHandler>): void {
      operationRegistry.registerMany(handlers);
    },

    // Workflow Lifecycle
    async start(options: StartWorkflowOptions): Promise<StartWorkflowResult> {
      const { type, context, priority, startAfterSeconds, singletonKey } = options;

      // Validate template exists
      const template = templateRegistry.getOrThrow(type);

      // Ensure the template's queue exists (handles queues not in initial config)
      await ensureQueueExists(template.queue);

      // Create workflow record
      const workflow = await dbState.createWorkflow({
        type,
        context,
        templateVersion: template.version,
      });

      // Get queue config
      const queueConfig = template.queueConfig ?? {};
      const sendOptions = createSendOptions(
        {
          retryLimit: queueConfig.retryLimit ?? defaultRetryLimit,
          retryDelay: queueConfig.retryDelay ?? defaultRetryDelay,
          retryBackoff: queueConfig.retryBackoff ?? true,
          expireInSeconds: queueConfig.expireInSeconds ?? 3600,
        },
        {
          ...(priority !== undefined && { priority }),
          ...(startAfterSeconds !== undefined && { startAfter: startAfterSeconds }),
          ...(singletonKey !== undefined && { singletonKey }),
        },
      );

      // Queue job
      const jobData: WorkflowJobData = {
        workflowId: workflow.id,
        workflowType: type,
        createdAt: new Date().toISOString(),
      };

      const jobId = await boss.send(template.queue, jobData, sendOptions);

      if (!jobId) {
        // pg-boss returns null when:
        // 1. A job with the same singletonKey already exists (expected behavior)
        // 2. The queue doesn't exist (unusual)
        // 3. Database connection issues
        const reason = singletonKey
          ? `A job with singletonKey '${singletonKey}' may already exist in queue '${template.queue}'`
          : `Unknown reason - check pg-boss logs and database connection`;
        throw new WorkflowError(
          `Failed to queue workflow job: ${reason}`,
          'QUEUE_ERROR',
        );
      }

      // Update workflow with job ID
      await dbState.setWorkflowJobId(workflow.id, jobId);

      return {
        workflowId: workflow.id,
        jobId,
      };
    },

    async resume(workflowId: string): Promise<string> {
      const workflow = await dbState.getWorkflow(workflowId);
      if (!workflow) {
        throw new WorkflowError(`Workflow ${workflowId} not found`, 'NOT_FOUND');
      }

      if (workflow.status !== 'paused') {
        throw new WorkflowError(
          `Cannot resume workflow in status ${workflow.status}`,
          'INVALID_STATUS',
        );
      }

      const template = templateRegistry.getOrThrow(workflow.type);

      // Queue resume job
      const jobData: WorkflowJobData = {
        workflowId,
        workflowType: workflow.type,
        createdAt: new Date().toISOString(),
      };

      const jobId = await boss.send(template.queue, jobData);

      if (!jobId) {
        throw new WorkflowError('Failed to queue resume job', 'QUEUE_ERROR');
      }

      return jobId;
    },

    async cancel(workflowId: string): Promise<void> {
      const workflow = await dbState.getWorkflow(workflowId);
      if (!workflow) {
        throw new WorkflowError(`Workflow ${workflowId} not found`, 'NOT_FOUND');
      }

      if (workflow.status === 'completed' || workflow.status === 'cancelled') {
        return; // Already in terminal state
      }

      const template = templateRegistry.get(workflow.type);

      // Cancel pg-boss job if pending
      if (workflow.jobId && template) {
        await boss.cancel(template.queue, workflow.jobId);
      }

      // Update status
      await dbState.updateWorkflowStatus(workflowId, 'cancelled');

      // Release any locks
      await dbState.releaseLocksByWorkflow(workflowId);
    },

    async retry(workflowId: string): Promise<string> {
      const workflow = await dbState.getWorkflow(workflowId);
      if (!workflow) {
        throw new WorkflowError(`Workflow ${workflowId} not found`, 'NOT_FOUND');
      }

      if (workflow.status !== 'failed') {
        throw new WorkflowError(
          `Cannot retry workflow in status ${workflow.status}`,
          'INVALID_STATUS',
        );
      }

      const template = templateRegistry.getOrThrow(workflow.type);

      // Clean up previous attempt
      await dbState.deleteOperationsByWorkflow(workflowId);
      await dbState.releaseLocksByWorkflow(workflowId);

      // Reset workflow state
      await dbState.updateWorkflowStatus(workflowId, 'pending');

      // Queue new job
      const jobData: WorkflowJobData = {
        workflowId,
        workflowType: workflow.type,
        createdAt: new Date().toISOString(),
      };

      const jobId = await boss.send(template.queue, jobData);

      if (!jobId) {
        throw new WorkflowError('Failed to queue retry job', 'QUEUE_ERROR');
      }

      await dbState.setWorkflowJobId(workflowId, jobId);

      return jobId;
    },

    // Scheduling
    async schedule(options: ScheduleOptions): Promise<void> {
      const { name, cron, type, context = {}, timezone = 'UTC' } = options;

      // Validate template exists
      templateRegistry.getOrThrow(type);

      // Unschedule first to ensure latest config
      await boss.unschedule(name);

      // Schedule with pg-boss
      await boss.schedule(
        name,
        cron,
        {
          workflowType: type,
          context,
        },
        { tz: timezone },
      );
    },

    async unschedule(name: string): Promise<void> {
      await boss.unschedule(name);
    },

    // Status & Queries
    async getStatus(workflowId: string): Promise<WorkflowStatusDetails> {
      const workflow = await dbState.getWorkflow(workflowId);
      if (!workflow) {
        throw new WorkflowError(`Workflow ${workflowId} not found`, 'NOT_FOUND');
      }

      const operations = await dbState.getOperationsByWorkflow(workflowId);
      const template = templateRegistry.get(workflow.type);

      // Calculate progress
      let progress = 0;
      let message = '';

      if (workflow.status === 'completed') {
        progress = 100;
        message = 'Workflow completed successfully';
      } else if (workflow.status === 'failed') {
        message = workflow.errorMessage ?? 'Workflow failed';
      } else if (workflow.status === 'cancelled') {
        message = 'Workflow was cancelled';
      } else if (workflow.status === 'paused') {
        message = `Paused at checkpoint: ${workflow.checkpointStatus}`;
        // Estimate progress based on completed stages
        if (template) {
          const stageIndex = template.stages.findIndex((s) => s.name === workflow.currentStage);
          progress = Math.round(((stageIndex + 1) / template.stages.length) * 100);
        }
      } else if (workflow.status === 'active') {
        const completed = operations.filter((o) => o.status === 'completed').length;
        const total = operations.length || 1;
        progress = Math.round((completed / total) * 100);
        message = `Processing: ${workflow.currentStage ?? 'starting'}`;
      } else {
        message = 'Waiting to start';
      }

      return {
        workflow: {
          id: workflow.id,
          type: workflow.type,
          status: workflow.status as WorkflowRecord['status'],
          context: workflow.context as WorkflowContext,
          currentStage: workflow.currentStage,
          checkpointStatus: workflow.checkpointStatus,
          errorMessage: workflow.errorMessage,
          createdAt: workflow.createdAt,
          startedAt: workflow.startedAt,
          completedAt: workflow.completedAt,
          templateVersion: workflow.templateVersion,
        },
        operations: operations.map((o) => ({
          id: o.id,
          workflowId: o.workflowId,
          type: o.type,
          stage: o.stage,
          status: o.status as 'pending' | 'active' | 'completed' | 'failed' | 'skipped',
          result: o.result as Record<string, unknown> | null,
          errorMessage: o.errorMessage,
          attempts: o.attempts,
          maxAttempts: o.maxAttempts,
          createdAt: o.createdAt,
          startedAt: o.startedAt,
          completedAt: o.completedAt,
        })),
        progress,
        message,
      };
    },

    async getWorkflow(workflowId: string): Promise<WorkflowRecord | null> {
      const workflow = await dbState.getWorkflow(workflowId);
      if (!workflow) {
        return null;
      }

      return {
        id: workflow.id,
        type: workflow.type,
        status: workflow.status as WorkflowRecord['status'],
        context: workflow.context as WorkflowContext,
        currentStage: workflow.currentStage,
        checkpointStatus: workflow.checkpointStatus,
        errorMessage: workflow.errorMessage,
        createdAt: workflow.createdAt,
        startedAt: workflow.startedAt,
        completedAt: workflow.completedAt,
        templateVersion: workflow.templateVersion,
      };
    },

    async listWorkflows(options?: {
      type?: string;
      status?: string | string[];
      limit?: number;
      offset?: number;
    }): Promise<WorkflowRecord[]> {
      const workflows = await dbState.listWorkflows({
        type: options?.type,
        status: options?.status as any,
        limit: options?.limit,
        offset: options?.offset,
      });

      return workflows.map((w) => ({
        id: w.id,
        type: w.type,
        status: w.status as WorkflowRecord['status'],
        context: w.context as WorkflowContext,
        currentStage: w.currentStage,
        checkpointStatus: w.checkpointStatus,
        errorMessage: w.errorMessage,
        createdAt: w.createdAt,
        startedAt: w.startedAt,
        completedAt: w.completedAt,
        templateVersion: w.templateVersion,
      }));
    },

    // Worker Management
    async startWorker(): Promise<void> {
      if (workerStarted) {
        throw new WorkflowError('Worker already started', 'ALREADY_STARTED');
      }

      // pg-boss is already started in createWorkflowOrchestrator()

      // Set up graceful shutdown
      setupGracefulShutdown(boss, {
        onShutdown: () => {
          if (debug) {
            console.log('[workflow] Shutting down worker...');
          }
        },
        onComplete: () => {
          if (debug) {
            console.log('[workflow] Worker shutdown complete');
          }
        },
      });

      // Set up event listeners
      setupEventListeners(boss, {
        onError: (error) => {
          console.error('[workflow] pg-boss error:', error);
        },
      });

      // Register workers for each queue
      const registeredQueues = new Set<string>();

      for (const queue of queues) {
        if (registeredQueues.has(queue.name)) {
          continue;
        }

        await boss.work<WorkflowJobData>(
          queue.name,
          {
            batchSize: queue.batchSize ?? 1,
            pollingIntervalSeconds: Math.floor((queue.pollingIntervalMs ?? 2000) / 1000),
          },
          async ([job]) => {
            if (job) {
              await processWorkflowJob(job);
            }
          },
        );

        registeredQueues.add(queue.name);

        if (debug) {
          console.log(`[workflow] Registered worker for queue: ${queue.name}`);
        }
      }

      // Also register for any template queues not in config
      for (const template of templateRegistry.all()) {
        if (!registeredQueues.has(template.queue)) {
          await boss.work<WorkflowJobData>(template.queue, { batchSize: 1 }, async ([job]) => {
            if (job) {
              await processWorkflowJob(job);
            }
          });

          registeredQueues.add(template.queue);

          if (debug) {
            console.log(`[workflow] Registered worker for template queue: ${template.queue}`);
          }
        }
      }

      workerStarted = true;

      if (debug) {
        console.log('[workflow] Worker started');
      }
    },

    async stopWorker(): Promise<void> {
      if (!workerStarted) {
        return;
      }

      await boss.stop({ graceful: true });
      workerStarted = false;

      if (debug) {
        console.log('[workflow] Worker stopped');
      }
    },

    // Validation
    validate(): void {
      const operationTypes = operationRegistry.types();
      const errors = templateRegistry.validateAll(operationTypes);

      if (errors.length > 0) {
        const errorMessages = errors
          .map((e) => `${e.workflowType}:${e.path}: ${e.message}`)
          .join('\n');
        throw new TemplateError(`Template validation failed:\n${errorMessages}`, { errors });
      }

      if (debug) {
        console.log('[workflow] All templates validated successfully');
        console.log(`[workflow] Registered templates: ${templateRegistry.types().join(', ')}`);
        console.log(`[workflow] Registered operations: ${Array.from(operationTypes).join(', ')}`);
      }
    },

    // Advanced Access
    getBoss(): PgBoss {
      return boss;
    },

    getTemplateRegistry(): TemplateRegistry {
      return templateRegistry;
    },

    getOperationRegistry(): OperationRegistry {
      return operationRegistry;
    },

    getDbState(): DbState {
      return dbState;
    },
  };

  return orchestrator;
}
