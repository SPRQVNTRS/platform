# Workflow Orchestration Architecture

This document explains the workflow orchestration system used in this project. The system provides a declarative, template-driven approach to executing multi-stage background workflows with PostgreSQL-backed persistence and job queuing.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Components](#core-components)
4. [Data Flow](#data-flow)
5. [State Management](#state-management)
6. [Error Handling & Retries](#error-handling--retries)
7. [Concurrency Control](#concurrency-control)
8. [Adding New Workflows](#adding-new-workflows)
9. [Pros & Cons](#pros--cons)
10. [Recommendations](#recommendations)

---

## Overview

The workflow orchestration system enables background processing of complex, multi-stage tasks. It follows a **template-driven** approach where workflows are defined declaratively, and a general-purpose execution engine interprets and runs them.

### Key Characteristics

- **PostgreSQL-backed**: All state is persisted to PostgreSQL, providing durability and queryability
- **Job Queue**: Uses [pg-boss](https://github.com/timgit/pg-boss) for reliable job queuing with automatic retries
- **Template-driven**: Workflows are defined as configuration objects, not procedural code
- **Separate Worker Process**: Background jobs run in a standalone worker process, decoupled from the web server
- **Context Accumulation**: Results flow forward through stages, building up a complete picture

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENT / API                               │
│                    (triggers workflow via endpoint)                  │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       WorkflowOrchestrator                           │
│                                                                      │
│   • initPremiumValuation()  - Creates records, acquires lock, queues │
│   • startWorkflow()         - Entry point called by worker           │
│   • retryWorkflow()         - Re-queue failed workflows              │
│   • cancelWorkflow()        - Mark as cancelled, release locks       │
│   • getWorkflowStatus()     - Query current state                    │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                      ┌────────────┴────────────┐
                      │                         │
                      ▼                         ▼
┌──────────────────────────────┐  ┌────────────────────────────────────┐
│         pg-boss Queue        │  │         PostgreSQL Database         │
│                              │  │                                     │
│  • premium-valuation queue   │  │  • workflows table                  │
│  • Retry/backoff config      │  │  • workflow_operations table        │
│  • Job expiration            │  │  • workflow_locks table             │
│  • Job retention             │  │  • appraisals table (results)       │
└──────────────┬───────────────┘  └─────────────────────────────────────┘
               │
               │  (Worker polls for jobs)
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Worker Process                                │
│                                                                      │
│   • Standalone Node.js process (worker.ts)                           │
│   • Validates templates on startup                                   │
│   • Listens on pg-boss queues                                        │
│   • Graceful shutdown handling                                       │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        ExecutionEngine                               │
│                                                                      │
│   • executeWorkflow()   - Runs all stages sequentially               │
│   • executeStage()      - Runs operations (parallel or sequential)   │
│   • executeOperation()  - Runs single operation with retry           │
│   • finalizeWorkflow()  - Persists final results                     │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
               ┌───────────────────┼───────────────────┐
               │                   │                   │
               ▼                   ▼                   ▼
┌──────────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐
│      Templates       │ │   Operations    │ │    DB State Manager     │
│                      │ │                 │ │                         │
│  • WorkflowTemplate  │ │  • Handlers     │ │  • createWorkflow()     │
│  • StageTemplate     │ │  • Registry     │ │  • updateWorkflowStatus │
│  • OperationTemplate │ │  • Validation   │ │  • updateContext()      │
└──────────────────────┘ └─────────────────┘ └─────────────────────────┘
```

---

## Core Components

### 1. WorkflowOrchestrator (`orchestrator.ts`)

The **public API** for the workflow system. It handles:

- **Initialization**: Creates database records, captures initial state, acquires locks
- **Queuing**: Submits jobs to pg-boss with appropriate configuration
- **Lifecycle Management**: Start, retry, cancel, cleanup workflows
- **Status Queries**: Retrieve workflow state and operation details

```typescript
// Example: Starting a workflow
const { workflow, appraisalId } = await workflowOrchestrator.initPremiumValuation({
  userId: user.id,
  websiteId: website.id,
});
```

### 2. ExecutionEngine (`execution-engine.ts`)

The **execution core** that interprets templates and runs operations:

- Executes stages **sequentially** (one after another)
- Executes operations within a stage **parallel or sequential** (configurable per stage)
- Handles **operation-level retries** with exponential backoff
- Manages **timeout enforcement** per operation
- Supports **fix/verify loops** for data quality (extensible)

### 3. Templates (`templates/`)

Declarative workflow definitions:

```typescript
const WORKFLOW_TEMPLATE: WorkflowTemplate = {
  type: 'premium-valuation',
  queue: 'premium-valuation',
  description: 'Comprehensive website valuation workflow',
  version: '1.0.0',
  estimatedDurationSeconds: 60,

  queueConfig: {
    retryLimit: 3,
    retryDelay: 10,
    retryBackoff: true,
    expireInSeconds: 3600,
  },

  stages: [
    {
      name: 'scrape',
      description: 'Gather website data',
      operations: [{ type: 'scrape.website', timeout: 60000, maxAttempts: 3 }],
    },
    {
      name: 'analyze',
      description: 'Run analyses',
      parallel: true, // These run concurrently
      operations: [
        { type: 'analyze.competitors', timeout: 120000 },
        { type: 'analyze.market', timeout: 120000 },
        { type: 'analyze.financials', timeout: 60000 },
      ],
    },
    {
      name: 'verify',
      description: 'Verify data integrity',
      operations: [{ type: 'verify.data-integrity', timeout: 30000, maxAttempts: 1 }],
    },
    {
      name: 'generate',
      description: 'Generate final report',
      operations: [{ type: 'generate.report', timeout: 120000 }],
    },
  ],
};
```

### 4. Operations (`operations/`)

Individual task handlers that implement business logic:

```typescript
export const scrapeWebsite: OperationHandler = async (context): Promise<OperationResult> => {
  // context.previousResults contains all accumulated data from prior operations
  // context.workflowId, context.operationId for tracking
  // context.websiteId, context.userId for business logic

  const data = await performScraping(context.previousResults.websiteUrl);

  return {
    status: 'completed', // or 'failed'
    data: { scrapedData: data }, // Merged into workflow context
  };
};
```

### 5. Infrastructure

#### pg-boss (`infrastructure/pg-boss.ts`)

PostgreSQL-backed job queue providing:

- Persistent job storage
- Automatic retries with configurable backoff
- Job expiration and retention
- Isolated schema (`pgboss`)

#### DB State (`infrastructure/db-state.ts`)

Database operations for workflow state:

- Create/read/update workflows and operations
- Lock acquisition and release
- Appraisal status updates

### 6. Worker Process (`worker.ts`)

Standalone process that:

- Validates all templates on startup
- Connects to pg-boss and listens for jobs
- Processes jobs one at a time (configurable)
- Handles graceful shutdown with signal handlers

---

## Data Flow

### Workflow Lifecycle

```
1. TRIGGER
   └── User clicks button → API endpoint called

2. INITIALIZE (WorkflowOrchestrator.initPremiumValuation)
   ├── Create appraisal record (status: pending)
   ├── Capture website snapshot
   ├── Create workflow record with initial context
   ├── Acquire lock on entity
   └── Queue job to pg-boss

3. QUEUE (pg-boss)
   └── Job persisted to PostgreSQL, waiting for worker

4. PROCESS (Worker)
   ├── Worker picks up job
   ├── Calls orchestrator.startWorkflow(workflowId)
   └── Updates appraisal status → processing

5. EXECUTE (ExecutionEngine.executeWorkflow)
   ├── Load workflow and template
   ├── Update workflow status → active
   ├── For each stage:
   │   ├── Update currentStage
   │   ├── Create operation records
   │   ├── Execute operations (parallel or sequential)
   │   └── Merge results into workflow context
   └── Finalize (update appraisal with results)

6. COMPLETE
   ├── Update workflow status → completed
   ├── Update appraisal status → completed
   └── Release lock
```

### Context Accumulation

The workflow context grows as operations complete:

```
Initial Context:
{
  websiteUrl: "https://example.com",
  websiteId: 123,
  appraisalId: 456
}

After scrape.website:
{
  websiteUrl: "...",
  websiteId: 123,
  appraisalId: 456,
  scrapedData: { title: "...", techStack: [...], seoMetrics: {...} }
}

After analyze.* (parallel):
{
  ...previousContext,
  competitorAnalysis: { competitors: [...], marketPosition: "..." },
  marketAnalysis: { trends: [...], opportunities: [...] },
  financialAnalysis: { projections: {...}, riskScore: 42 }
}

After generate.report:
{
  ...previousContext,
  report: { executiveSummary: "...", recommendations: [...] },
  finalValuation: { valueLow: 10000, valueMid: 15000, valueHigh: 20000 }
}
```

---

## State Management

### Database Schema

#### `workflows` table

| Column       | Type      | Description                                   |
| ------------ | --------- | --------------------------------------------- |
| id           | UUID      | Primary key                                   |
| type         | TEXT      | Workflow type (e.g., 'premium-valuation')     |
| status       | TEXT      | pending, active, completed, failed, cancelled |
| userId       | INTEGER   | Owner of the workflow                         |
| appraisalId  | INTEGER   | Associated appraisal                          |
| context      | JSONB     | Accumulated workflow data                     |
| currentStage | TEXT      | Currently executing stage                     |
| errorMessage | TEXT      | Error details if failed                       |
| startedAt    | TIMESTAMP | When execution began                          |
| completedAt  | TIMESTAMP | When execution finished                       |

#### `workflow_operations` table

| Column       | Type    | Description                             |
| ------------ | ------- | --------------------------------------- |
| id           | UUID    | Primary key                             |
| workflowId   | UUID    | Parent workflow                         |
| type         | TEXT    | Operation type (e.g., 'scrape.website') |
| stage        | TEXT    | Stage name                              |
| status       | TEXT    | pending, active, completed, failed      |
| result       | JSONB   | Operation output                        |
| errorMessage | TEXT    | Error details if failed                 |
| attempts     | INTEGER | Current attempt count                   |
| maxAttempts  | INTEGER | Maximum retry attempts                  |

#### `workflow_locks` table

| Column     | Type | Description               |
| ---------- | ---- | ------------------------- |
| entityType | TEXT | Type of locked entity     |
| entityId   | TEXT | ID of locked entity       |
| workflowId | UUID | Workflow holding the lock |

---

## Error Handling & Retries

### Multi-Level Retry Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    LEVEL 1: Operation Retries               │
│                                                             │
│   • Handled by ExecutionEngine                              │
│   • Exponential backoff: 2^attempt × 1000ms                 │
│   • maxAttempts configurable per operation (default: 3)     │
│   • Tracks attempts in workflow_operations.attempts         │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ If all operation retries exhausted
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    LEVEL 2: Queue Retries                   │
│                                                             │
│   • Handled by pg-boss                                      │
│   • retryLimit: 3 (configurable in template)                │
│   • retryDelay: 5-10 seconds with exponential backoff       │
│   • Entire workflow re-attempted                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ If all queue retries exhausted
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    LEVEL 3: Manual Retry                    │
│                                                             │
│   • Handled by WorkflowOrchestrator.retryWorkflow()         │
│   • Cleans up previous attempt (operations, locks)          │
│   • Resets status and re-queues                             │
│   • Triggered by admin or user action                       │
└─────────────────────────────────────────────────────────────┘
```

### Timeout Handling

- Each operation has a configurable timeout (default: 30 seconds)
- Implemented via `Promise.race()` with a timeout promise
- Timeout triggers retry (counts as failed attempt)
- Job-level timeout via pg-boss `expireInSeconds` (default: 1 hour)

### Error Propagation

1. **Operation Error** → Logged, retried up to maxAttempts, then thrown to stage
2. **Stage Error** → Workflow marked as failed, appraisal marked as failed
3. **Error Details** → Stored in `workflows.errorMessage` and `appraisals.errorMessage`

---

## Concurrency Control

### Entity Locking

Prevents multiple workflows from processing the same entity simultaneously:

```typescript
// Acquire lock before processing
const lockAcquired = await acquireLock('appraisal', String(appraisalId), workflowId);
if (!lockAcquired) {
  throw new Error('Another workflow is already processing this appraisal');
}

// Release lock in finally block
await releaseLock('appraisal', String(appraisalId));
```

The lock is implemented via a unique index on `(entityType, entityId)` in the `workflow_locks` table. Insert failures indicate the lock is already held.

### Worker Configuration

- Jobs processed one at a time (`batchSize: 1`)
- Polling interval: 2 seconds
- Graceful shutdown waits for current job to complete

---

## Adding New Workflows

### Step-by-Step Guide

1. **Create the template** (`templates/your-workflow.ts`)

```typescript
export const YOUR_WORKFLOW_TEMPLATE: WorkflowTemplate = {
  type: 'your-workflow',
  queue: QUEUES.YOUR_QUEUE,
  description: 'What this workflow does',
  stages: [
    /* ... */
  ],
};
```

2. **Register the template** (`templates/index.ts`)

```typescript
const templateRegistry: Record<string, WorkflowTemplate> = {
  'premium-valuation': PREMIUM_VALUATION_TEMPLATE,
  'your-workflow': YOUR_WORKFLOW_TEMPLATE, // Add here
};
```

3. **Create operation handlers** (`operations/your-stage/your-operation.ts`)

```typescript
export const yourOperation: OperationHandler = async (context) => {
  // Implement business logic
  return {
    status: 'completed',
    data: {
      /* results */
    },
  };
};
```

4. **Register handlers** (`operations/index.ts`)

```typescript
const operationRegistry: Record<string, OperationHandler> = {
  // ...existing
  'your-stage.your-operation': yourOperation,
};
```

5. **Add initialization logic** (`orchestrator.ts`)

```typescript
async initYourWorkflow(params: {...}): Promise<InitWorkflowResult> {
  // Create necessary records
  // Acquire locks
  // Queue the job
}
```

6. **Add the queue** (`infrastructure/pg-boss.ts`)

```typescript
export const QUEUES = {
  PREMIUM_VALUATION: 'premium-valuation',
  YOUR_QUEUE: 'your-workflow', // Add here
} as const;
```

7. **Register worker handler** (`worker.ts`)

```typescript
await boss.work<{ workflowId: string }>(QUEUES.YOUR_QUEUE, { batchSize: 1 }, async (jobs) => {
  // Handle jobs
});
```

---

## Pros & Cons

### Pros

| Benefit                  | Details                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| **Durability**           | All state persisted to PostgreSQL. Survives process crashes and restarts.                |
| **Reliability**          | pg-boss provides battle-tested job queuing with transactional guarantees.                |
| **Visibility**           | Full audit trail via database. Easy to query workflow status, debug issues.              |
| **Declarative**          | Templates separate "what" from "how". Easy to understand workflow structure at a glance. |
| **Extensible**           | Adding new workflows/operations is straightforward. No changes to core engine needed.    |
| **Testable**             | Operations are pure functions. Can test independently or mock in workflow tests.         |
| **Parallel Execution**   | Stages can run operations in parallel when they don't depend on each other.              |
| **Graceful Degradation** | Multi-level retry strategy handles transient failures automatically.                     |
| **Decoupled**            | Worker process separate from web server. Can scale independently.                        |
| **Type-safe**            | Full TypeScript throughout. Templates and contexts are typed.                            |
| **Startup Validation**   | Templates validated at worker startup. Catches config errors early.                      |

### Cons

| Drawback                  | Details                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| **PostgreSQL Dependency** | Requires PostgreSQL. Not suitable if you need a different database.                          |
| **Polling-based**         | pg-boss uses polling (configurable interval). Not true real-time push.                       |
| **Single Database**       | Workflow state and application data share the same database. Could be a bottleneck at scale. |
| **No Visual Editor**      | Workflows defined in code. No drag-and-drop workflow builder.                                |
| **Limited Branching**     | Current design is linear stages. No built-in conditional branching or complex DAG support.   |
| **No Event Sourcing**     | State is mutable. No event log to replay workflow history.                                   |
| **Context Growth**        | JSONB context accumulates all data. Large workflows could hit JSON size limits.              |
| **Lock Granularity**      | Simple entity-level locking. More complex coordination patterns not supported.               |
| **No Sub-workflows**      | Can't easily compose workflows from smaller workflows.                                       |
| **Manual Worker Scaling** | Must manually run multiple worker instances for horizontal scaling.                          |

---

## Recommendations

### For Porting to a New Package

1. **Extract the Core**
   - Keep the three-layer architecture: Orchestrator → Engine → Operations
   - Make templates and operations pluggable (dependency injection)
   - Abstract the database layer (currently Drizzle + PostgreSQL)

2. **Queue Abstraction**
   - Create an interface for the job queue
   - pg-boss is great, but allow other adapters (BullMQ, etc.)
   - Keep queue config in templates

3. **State Store Abstraction**
   - Interface for workflow state persistence
   - Support different backends: PostgreSQL, Redis, MongoDB
   - Consider event sourcing for complete audit trail

4. **Improve Branching**
   - Add conditional stages (if/else based on context)
   - Support DAG-style workflows (not just linear)
   - Consider adopting a workflow DSL

5. **Sub-workflow Support**
   - Allow workflows to trigger other workflows
   - Support wait-for-completion semantics
   - Enable workflow composition

6. **Better Observability**
   - Add structured logging hooks
   - OpenTelemetry integration for tracing
   - Metrics export (operation duration, retry rates, etc.)

7. **Configuration Improvements**
   - Support loading templates from files (YAML/JSON)
   - Hot-reload templates without restart
   - Template versioning with migration support

8. **Consider These Patterns**
   - **Saga Pattern**: For distributed transactions with compensation
   - **Outbox Pattern**: For reliable event publishing
   - **Idempotency Keys**: For safe operation retries

### Architecture Decisions to Revisit

| Decision            | Current                    | Consider                                 |
| ------------------- | -------------------------- | ---------------------------------------- |
| Context storage     | Single JSONB column        | Separate results table or event store    |
| Operation results   | Merged into context        | Keep separate, reference by operation ID |
| Lock mechanism      | Database unique constraint | Redis/distributed lock for multi-node    |
| Worker discovery    | Manual process start       | Service discovery / orchestration (K8s)  |
| Template validation | Startup assertion          | Also validate at template registration   |

### Production Hardening

- [ ] Add circuit breakers for external service calls in operations
- [ ] Implement dead letter queue for permanently failed jobs
- [ ] Add workflow archival for completed workflows (move to cold storage)
- [ ] Implement rate limiting per workflow type
- [ ] Add webhook notifications for workflow state changes
- [ ] Create admin UI for workflow monitoring and manual intervention

---

## Quick Reference

### Commands

```bash
# Run worker (production)
pnpm worker

# Run worker (development with hot reload)
pnpm worker:dev

# Run web server + worker together
pnpm dev
```

### Key Files

| File                                       | Purpose                                        |
| ------------------------------------------ | ---------------------------------------------- |
| `app/workflows/index.ts`                   | Public API exports                             |
| `app/workflows/orchestrator.ts`            | Workflow lifecycle management                  |
| `app/workflows/execution-engine.ts`        | Stage/operation execution                      |
| `app/workflows/types.ts`                   | Type definitions                               |
| `app/workflows/templates/*.ts`             | Workflow templates                             |
| `app/workflows/operations/**/*.ts`         | Operation handlers                             |
| `app/workflows/infrastructure/pg-boss.ts`  | Job queue setup                                |
| `app/workflows/infrastructure/db-state.ts` | Database operations                            |
| `worker.ts`                                | Worker process entry point                     |
| `drizzle/schema.ts`                        | Database schema (workflows, operations, locks) |

### Status Values

**Workflow Status**: `pending` → `active` → `completed` | `failed` | `cancelled`

**Operation Status**: `pending` → `active` → `completed` | `failed`
