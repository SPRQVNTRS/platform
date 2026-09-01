# @sprqvntrs/workflows

PostgreSQL-backed workflow orchestration with pg-boss job queuing.

## Overview

This package provides a declarative, template-driven approach to executing multi-stage background workflows with reliable persistence and job processing. Built on [pg-boss](https://github.com/timgit/pg-boss), it offers:

- **Declarative Templates** - Define workflows as configuration objects
- **Parallel Execution** - Run operations concurrently within stages
- **Checkpoints** - Pause workflows for manual intervention
- **Workflow Chaining** - Trigger follow-up workflows on completion
- **Fix-Verify Loops** - Automatic retry cycles for data integrity
- **Entity Locking** - Prevent race conditions between workflows
- **Type Safety** - Full TypeScript support with generics

## Installation

```bash
pnpm add @sprqvntrs/workflows
```

### Peer Dependencies

```bash
pnpm add drizzle-orm pg
```

## Quick Start

### 1. Set Up the Orchestrator

```typescript
import { createWorkflowOrchestrator } from '@sprqvntrs/workflows';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

// Create database connection
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool);

// Create orchestrator
const orchestrator = await createWorkflowOrchestrator({
  connectionString: process.env.DATABASE_URL!,
  db,
  queues: [
    { name: 'default', workers: 5 },
    { name: 'heavy', workers: 2 },
    { name: 'sequential', workers: 1 },
  ],
  defaultTimeout: 30000,
  defaultRetryLimit: 3,
});
```

### 2. Define a Workflow Template

```typescript
import type { WorkflowTemplate } from '@sprqvntrs/workflows';

const contentGenerationTemplate: WorkflowTemplate = {
  type: 'content-generation',
  queue: 'default',
  version: '1.0.0',
  description: 'Generate content from a URL',

  stages: [
    {
      name: 'gather',
      description: 'Fetch data from URL',
      operations: [
        { type: 'gather.scrape', timeout: 60000, maxAttempts: 3 },
      ],
    },
    {
      name: 'analyze',
      description: 'Analyze the gathered data',
      parallel: true, // Run these operations concurrently
      operations: [
        { type: 'analyze.content', timeout: 120000 },
        { type: 'analyze.competitors', timeout: 120000 },
        { type: 'analyze.market', timeout: 120000 },
      ],
    },
    {
      name: 'generate',
      description: 'Generate the final report',
      operations: [
        { type: 'generate.report', timeout: 180000 },
      ],
    },
  ],

  // Optional: pause for review after gathering
  checkpoints: [
    {
      after: 'gather',
      status: 'data_ready',
      condition: (ctx) => !ctx.isAutomated,
    },
  ],
};

orchestrator.registerTemplate(contentGenerationTemplate);
```

### 3. Implement Operation Handlers

```typescript
import type { OperationHandler } from '@sprqvntrs/workflows';

// Define handler with typed context
const scrapeHandler: OperationHandler<{ url: string }, { scrapedData: unknown }> = async (ctx) => {
  const { url } = ctx.previousResults;

  try {
    const data = await scrapeWebsite(url);
    return {
      status: 'completed',
      data: { scrapedData: data },
    };
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : 'Scraping failed',
    };
  }
};

// Register handlers
orchestrator.registerOperations({
  'gather.scrape': scrapeHandler,
  'analyze.content': analyzeContentHandler,
  'analyze.competitors': analyzeCompetitorsHandler,
  'analyze.market': analyzeMarketHandler,
  'generate.report': generateReportHandler,
});
```

### 4. Start a Workflow

```typescript
// In your API route
app.post('/workflows/content', async (req, res) => {
  const { workflowId, jobId } = await orchestrator.start({
    type: 'content-generation',
    context: {
      url: req.body.url,
      userId: req.user.id,
      isAutomated: req.body.automated ?? false,
    },
  });

  res.json({ workflowId, jobId });
});
```

### 5. Run the Worker

```typescript
// worker.ts
import { runWorker } from '@sprqvntrs/workflows/worker';

async function main() {
  const orchestrator = await createWorkflowOrchestrator({
    // ... config
  });

  // Register all templates and operations
  orchestrator.registerTemplates([...]);
  orchestrator.registerOperations({...});

  // Start processing
  await runWorker({
    orchestrator,
    onReady: () => console.log('Worker ready'),
    onShutdown: () => console.log('Shutting down...'),
    onError: (err) => console.error('Worker error:', err),
  });
}

main().catch(console.error);
```

## Database Schema

Add the workflow tables to your Drizzle schema:

```typescript
// schema.ts
import { workflows, workflowOperations, workflowLocks } from '@sprqvntrs/workflows/schema';

export { workflows, workflowOperations, workflowLocks };
```

Then run your migrations to create the tables.

## API Reference

### `createWorkflowOrchestrator(config)`

Creates the main orchestrator instance.

```typescript
const orchestrator = await createWorkflowOrchestrator({
  // Required
  connectionString: string,    // PostgreSQL connection string
  db: Database,                // Drizzle database instance
  queues: QueueDefinition[],   // Queue configurations

  // Optional
  defaultTimeout?: number,     // Default operation timeout (ms), default: 30000
  defaultRetryLimit?: number,  // Default retry attempts, default: 3
  defaultRetryDelay?: number,  // Default retry delay (s), default: 5
  schema?: string,             // pg-boss schema name, default: 'pgboss'
  application?: string,        // Application name for monitoring
  debug?: boolean,             // Enable debug logging
});
```

### Orchestrator Methods

#### Registration

```typescript
// Register a single template
orchestrator.registerTemplate(template: WorkflowTemplate): void

// Register multiple templates
orchestrator.registerTemplates(templates: WorkflowTemplate[]): void

// Register a single operation handler
orchestrator.registerOperation(type: string, handler: OperationHandler): void

// Register multiple operation handlers
orchestrator.registerOperations(handlers: Record<string, OperationHandler>): void
```

#### Workflow Lifecycle

```typescript
// Start a new workflow
const { workflowId, jobId } = await orchestrator.start({
  type: string,              // Workflow type (matches template)
  context: WorkflowContext,  // Initial context data
  priority?: number,         // Job priority (higher = more urgent)
  startAfterSeconds?: number,// Delay before starting
  singletonKey?: string,     // Prevent duplicates
});

// Resume a paused workflow
const jobId = await orchestrator.resume(workflowId: string);

// Cancel a workflow
await orchestrator.cancel(workflowId: string);

// Retry a failed workflow
const jobId = await orchestrator.retry(workflowId: string);
```

#### Scheduling

```typescript
// Schedule a recurring workflow
await orchestrator.schedule({
  name: string,       // Unique schedule name
  cron: string,       // Cron expression
  type: string,       // Workflow type to start
  context?: object,   // Context for each instance
  timezone?: string,  // Timezone, default: 'UTC'
});

// Remove a schedule
await orchestrator.unschedule(name: string);
```

#### Queries

```typescript
// Get workflow status with operations
const status = await orchestrator.getStatus(workflowId);
// Returns: { workflow, operations, progress, message }

// Get just the workflow record
const workflow = await orchestrator.getWorkflow(workflowId);

// List workflows with filtering
const workflows = await orchestrator.listWorkflows({
  type?: string,
  status?: string | string[],
  limit?: number,
  offset?: number,
});
```

#### Worker Management

```typescript
// Start processing jobs
await orchestrator.startWorker();

// Stop gracefully
await orchestrator.stopWorker();

// Validate all templates have handlers
orchestrator.validate(); // Throws if validation fails
```

### pg-boss Introspection

Query pg-boss internal tables directly for debugging and monitoring:

```typescript
import { createPgBossQueries } from '@sprqvntrs/workflows';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const queries = createPgBossQueries(pool);

// Get all current jobs (id, name, state)
const jobs = await queries.getJobs();

// Get job statistics grouped by queue and state
const stats = await queries.getJobStats();
// Returns: [{ name: 'content-generation', state: 'active', count: 5 }, ...]

// Get all configured schedules
const schedules = await queries.getSchedules();
// Returns: [{ name: 'daily-sync', cron: '0 0 * * *', timezone: 'UTC', ... }, ...]

// Get job history for specific queues (from archive table)
const history = await queries.getJobHistory(['content-generation', 'data-sync']);
// Returns up to 50 most recent archived jobs

// Cancel and delete all jobs for a workflow
const result = await queries.deleteWorkflowJobs('workflow-123');
console.log(`Cancelled ${result.cancelledCount}, deleted ${result.deletedCount} jobs`);
```

#### Custom Schema

If you use a custom pg-boss schema:

```typescript
const queries = createPgBossQueries(pool, { schema: 'my_pgboss' });
```

### Template Structure

```typescript
interface WorkflowTemplate {
  type: string;                    // Unique identifier
  queue: string;                   // pg-boss queue name
  version: string;                 // Semantic version
  description?: string;            // Human-readable description
  estimatedDurationSeconds?: number;

  stages: StageTemplate[];         // Ordered list of stages
  checkpoints?: CheckpointTemplate[];
  nextWorkflow?: string;           // Chain to another workflow
  coordination?: CoordinationConfig;
  queueConfig?: QueueConfig;
}

interface StageTemplate {
  name: string;                    // Unique within workflow
  description?: string;
  operations: OperationTemplate[];
  parallel?: boolean;              // Run operations concurrently
  fixOperations?: OperationTemplate[]; // For fix-verify loops
  maxFixCycles?: number;
  condition?: (context) => boolean; // Skip if returns false
}

interface OperationTemplate {
  type: string;                    // Maps to handler
  timeout?: number;                // Milliseconds
  maxAttempts?: number;
  critical?: boolean;              // Fail workflow if operation fails
  condition?: (context) => boolean;
}
```

### Operation Handlers

```typescript
type OperationHandler<TContext, TResult> = (
  context: OperationContext<TContext>
) => Promise<OperationResult<TResult>>;

interface OperationContext<T> {
  workflowId: string;
  operationId: string;
  operationType: string;
  stageName: string;
  attempt: number;
  maxAttempts: number;
  previousResults: T;           // Accumulated from prior operations
  initialContext: object;       // Original workflow context
  workflowType: string;
  signal?: AbortSignal;
}

interface OperationResult<T> {
  status: 'completed' | 'failed';
  data?: T;                     // Merged into workflow context
  reason?: string;              // Error message if failed
  metadata?: object;
}
```

### Handler Utilities

```typescript
import { withTimeout, withRetry, withErrorBoundary, compose } from '@sprqvntrs/workflows';

// Add timeout to a handler
const timedHandler = withTimeout(myHandler, 30000);

// Add retry logic
const retryHandler = withRetry(myHandler, {
  maxAttempts: 3,
  baseDelayMs: 1000,
  backoffMultiplier: 2,
});

// Catch exceptions and return failed result
const safeHandler = withErrorBoundary(myHandler);

// Combine wrappers
const robustHandler = compose(
  myHandler,
  (h) => withErrorBoundary(h),
  (h) => withTimeout(h, 30000),
);
```

### Entity Locking

```typescript
import { createLockManager, withLock } from '@sprqvntrs/workflows';

const lockManager = createLockManager(orchestrator.getDbState());

// Manual locking
const acquired = await lockManager.acquire('document', docId, workflowId, {
  ttlMs: 600000, // 10 minute TTL
});

if (acquired) {
  try {
    await processDocument();
  } finally {
    await lockManager.release('document', docId);
  }
}

// Or use the helper
const result = await withLock(
  lockManager,
  'document',
  docId,
  workflowId,
  async () => {
    return await processDocument();
  },
  { ttlMs: 600000 }
);
```

## Testing

```typescript
import {
  createMockContext,
  createSuccessResult,
  createFailureResult,
  testHandler,
  assertSuccess,
} from '@sprqvntrs/workflows/testing';

// Test a handler
const result = await testHandler(myHandler, {
  previousResults: { url: 'https://example.com' },
});

assertSuccess(result);
expect(result.data?.fetchedData).toBeDefined();

// Create mock context manually
const context = createMockContext({
  operationType: 'gather.scrape',
  attempt: 2,
  previousResults: { url: 'https://example.com' },
});
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Application                                │
│                    (API Routes, UI Actions)                          │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     WorkflowOrchestrator                             │
│                     (Public API Facade)                              │
│   • start/resume/cancel/retry workflows                             │
│   • schedule recurring workflows                                     │
│   • query workflow status                                            │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       ExecutionEngine                                │
│   • Interprets workflow templates                                    │
│   • Executes stages (sequential) and operations (parallel/seq)      │
│   • Handles retries, timeouts, checkpoints                          │
└─────────────────────────────────────────────────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
┌───────────────────┐ ┌─────────────────┐ ┌───────────────────┐
│   pg-boss Queue   │ │   PostgreSQL    │ │    Operations     │
│                   │ │                 │ │                   │
│ • Job persistence │ │ • workflows     │ │ • Handlers        │
│ • Retry/timeout   │ │ • operations    │ │ • Registry        │
│ • Scheduling      │ │ • locks         │ │ • Validation      │
└───────────────────┘ └─────────────────┘ └───────────────────┘
```

## Best Practices

### 1. Keep Handlers Idempotent

Operations may be retried. Design handlers to be safely re-run:

```typescript
const processDocument: OperationHandler = async (ctx) => {
  // Check if already processed
  const existing = await db.query.results.findFirst({
    where: eq(results.documentId, ctx.previousResults.documentId),
  });

  if (existing) {
    return { status: 'completed', data: { result: existing } };
  }

  // Process and store result
  const result = await process();
  await db.insert(results).values({ documentId, result });

  return { status: 'completed', data: { result } };
};
```

### 2. Use Checkpoints for Long Workflows

Pause for human review at critical points:

```typescript
const template: WorkflowTemplate = {
  // ...
  checkpoints: [
    {
      after: 'gather',
      status: 'data_ready',
      condition: (ctx) => ctx.requiresReview,
    },
  ],
};
```

### 3. Use Entity Locking for Shared Resources

Prevent race conditions when multiple workflows access the same data:

```typescript
const handler: OperationHandler = async (ctx) => {
  const lockManager = createLockManager(dbState);

  return withLock(
    lockManager,
    'account',
    ctx.previousResults.accountId,
    ctx.workflowId,
    async () => {
      // Safe to modify account
      await updateAccount();
      return { status: 'completed', data: {} };
    }
  );
};
```

### 4. Validate at Startup

Catch configuration errors early:

```typescript
// In worker.ts
orchestrator.registerTemplates([...]);
orchestrator.registerOperations({...});

// Throws if any template references missing handlers
orchestrator.validate();

await orchestrator.startWorker();
```

### 5. Use Typed Handlers

Leverage TypeScript for better IDE support:

```typescript
interface GatherContext {
  url: string;
}

interface GatherResult {
  scrapedData: ScrapedData;
  fetchedAt: string;
}

const gatherHandler: OperationHandler<GatherContext, GatherResult> = async (ctx) => {
  // ctx.previousResults.url is typed as string
  const data = await scrape(ctx.previousResults.url);

  return {
    status: 'completed',
    data: {
      scrapedData: data,
      fetchedAt: new Date().toISOString(),
    },
  };
};
```

## Raw TypeScript

This package ships raw TypeScript (`main` and `types` point at `index.ts`), so a Vite
consumer (Vite, React Router, Remix) must add the scope to `ssr.noExternal`:
`ssr: { noExternal: [/^@sprqvntrs\//] }`.

## License

MIT
