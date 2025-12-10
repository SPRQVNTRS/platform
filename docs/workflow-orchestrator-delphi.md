# Workflow Orchestration Architecture

This document describes the workflow orchestration system used in Delphi, built on pg-boss (PostgreSQL-backed job queue). This architecture overview is intended for designing a centralized workflow package.

## Table of Contents

1. [Overview](#overview)
2. [Core Components](#core-components)
3. [Workflow Templates](#workflow-templates)
4. [Orchestrator Architecture](#orchestrator-architecture)
5. [Job Queue Configuration](#job-queue-configuration)
6. [Scheduling and Recurring Jobs](#scheduling-and-recurring-jobs)
7. [Concurrency and Coordination](#concurrency-and-coordination)
8. [Error Handling](#error-handling)
9. [Data Flow](#data-flow)
10. [Pros and Cons](#pros-and-cons)
11. [Recommendations for Central Package](#recommendations-for-central-package)

---

## Overview

Delphi uses a **state-driven workflow orchestration system** built on:

- **pg-boss**: PostgreSQL-backed job queue for reliable, persistent job processing
- **Workflow Templates**: Declarative workflow definitions with stages and operations
- **Multi-Manager Orchestrator**: Facade pattern delegating to specialized managers
- **Operation Handlers**: Individual functions executing specific tasks

The system does **not use pg-cron directly**. Instead, it leverages pg-boss's built-in scheduling capabilities (`boss.schedule()`) for recurring jobs.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Application Layer                             │
│  (API Routes, UI Actions, Scheduled Triggers)                       │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     WorkflowOrchestrator                            │
│  (Public API - Facade Pattern)                                      │
│  ┌──────────────────┬──────────────────┬──────────────────────────┐ │
│  │ LifecycleManager │ StageProcessor   │ IntegrityManager         │ │
│  │ (init, start,    │ (stage/operation │ (verify, fix loops)      │ │
│  │  retry, chain)   │  execution)      │                          │ │
│  └──────────────────┴──────────────────┴──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        pg-boss Job Queue                            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────┐│
│  │orchestrate│ │write   │ │publish │ │evaluate │ │create-predictions││
│  │(5 workers)│ │(5 work)│ │(1 work)│ │(1 work) │ │(1 worker)       ││
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          PostgreSQL                                 │
│  (Job persistence, workflow state, operation state)                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. pg-boss Job Queue

**Role**: Provides reliable, persistent job processing with automatic retries.

**Key Characteristics**:

- Jobs persist in PostgreSQL (survives restarts)
- Automatic retry on failure (configurable limit)
- Multiple named queues with independent workers
- Built-in scheduling for recurring jobs
- Job expiration timeouts

**Queue Architecture**:
| Queue | Workers | Purpose |
|-------|---------|---------|
| `orchestrate` | 5 | Main workflow execution |
| `write` | 5 | Content generation operations |
| `publish` | 1 | WordPress publishing (sequential) |
| `evaluate-bets` | 1 | Scheduled betting evaluation |
| `create-predictions` | 1 | Scheduled automation |

### 2. Workflow Templates

**Role**: Declarative definition of workflow structure.

**Structure**:

```
WorkflowTemplate
├── workflowType (unique identifier)
├── nextWorkflowType (optional chaining)
├── queue (which pg-boss queue)
├── stages[]
│   ├── name (stage identifier)
│   └── operations[]
│       ├── type (operation identifier)
│       └── handler (function reference)
├── creationCheckpoint (pause point)
└── output (result type)
```

**Workflow Chaining**: Workflows can specify a `nextWorkflowType` to automatically trigger another workflow upon completion.

### 3. Operation Handlers

**Role**: Individual functions that execute specific tasks.

**Contract**:

```typescript
type OperationHandler = (jobArgs) => Promise<{
  status: 'completed' | 'failed';
  reason?: string;
  context?: Record<string, unknown>;
}>;
```

**Organization**:

```
operations/
├── gather/         # Data fetching
├── prepare/        # Data transformation
├── analyze/        # Analysis tasks
├── generate/       # Content generation
├── write/          # Content writing
├── translate/      # Translation tasks
├── verify/         # Integrity checks
├── fix/            # Fix operations
└── publish/        # Publishing tasks
```

---

## Orchestrator Architecture

The `WorkflowOrchestrator` uses the **Facade Pattern**, providing a simple public API while delegating to specialized managers.

### Manager Responsibilities

```
WorkflowOrchestrator (Facade)
│
├── WorkflowLifecycleManager
│   ├── Initialize workflows (create records)
│   ├── Execute workflows (process stages)
│   ├── Handle checkpoints (pause/resume)
│   └── Chain workflows (trigger next)
│
├── StageProcessor
│   ├── Create operations from templates
│   ├── Execute operations via handlers
│   ├── Handle operation errors
│   └── Coordinate concurrent operations
│
├── IntegrityManager
│   ├── Run verify stage
│   ├── Evaluate check results
│   ├── Execute fix operations
│   └── Track fix attempts (per-check)
│
└── OperationCleanupManager
    ├── Clean up on retry
    ├── Remove database records
    └── Delete external resources
```

### Key Design Decisions

1. **Single Responsibility**: Each manager handles one concern
2. **Dependency Injection**: Managers receive dependencies via constructor
3. **Callback Communication**: Cross-manager coordination via callbacks (e.g., `checkCreationCheckpoint`)
4. **Loose Coupling**: Managers don't directly reference each other

---

## Job Queue Configuration

### Worker Configuration

```typescript
const WORKER_CONFIG = {
  batchSize: 1, // Process one job at a time per worker
  retryLimit: 3, // Auto-retry failed jobs
  retryDelay: 5, // Seconds between retries
  expireInMinutes: 30, // Job timeout
};
```

### Queue-Specific Workers

Different queues have different worker counts based on:

- **Parallelism needs**: `orchestrate` and `write` need high throughput
- **Sequential requirements**: `publish` must be sequential (1 worker)
- **Resource intensity**: Scheduled tasks are single-worker

### Worker Process

The worker runs as a **separate Node.js process**:

1. Initialize pg-boss (connects to PostgreSQL)
2. Schedule recurring jobs
3. Register queue workers
4. Process jobs continuously
5. Handle graceful shutdown (SIGTERM/SIGINT)

---

## Scheduling and Recurring Jobs

### No pg-cron Required

pg-boss provides native scheduling via `boss.schedule()`:

```typescript
// Cron expression: minute hour day-of-month month day-of-week
await boss.schedule('evaluate-bets', '0 */6 * * *', {}); // Every 6 hours
await boss.schedule('create-predictions', '0 4 * * *', {}); // Daily at 4 AM
```

### Scheduling Behavior

1. **Startup**: Jobs are unscheduled then rescheduled (ensures latest config)
2. **Trigger**: When cron fires, job is enqueued to its queue
3. **Execution**: Worker picks up job from queue
4. **Persistence**: Schedule stored in PostgreSQL

### Benefits Over pg-cron

- Single system for both scheduling and execution
- Jobs benefit from same retry/timeout mechanisms
- Unified monitoring and logging
- No separate PostgreSQL extension required

---

## Concurrency and Coordination

### Encounter Coordinator

**Problem**: Multiple workflows may need the same shared data (e.g., encounter data).

**Solution**: FIFO coordination based on operation creation time.

**Mechanism**:

1. Before processing critical operations, check for older operations on same encounter
2. Wait for older operations to complete (polling with timeout)
3. Process operation
4. Next operation in queue proceeds

**Critical Operations** (require coordination):

- Data fetching (shared S3 data)
- Data preparation (encounter-scoped)
- Content generation (database writes)
- Shared content writing

### Coordination Flow

```
Operation A (created: T1) ──► Process immediately
                               │
Operation B (created: T2) ──► Wait for A ──► Process
                                             │
Operation C (created: T3) ──► Wait for B ──► Process
```

**Timeout**: 10 minutes (continues anyway if exceeded)

---

## Error Handling

### Error Boundary Pattern

Three-level hierarchy for error handling:

```
┌─────────────────────────────────────────────────┐
│             WorkflowErrorBoundary               │
│  (Terminal handler - marks workflow failed)     │
│  ┌─────────────────────────────────────────┐    │
│  │         StageErrorBoundary              │    │
│  │  (Updates creation/workflow status)     │    │
│  │  ┌─────────────────────────────────┐    │    │
│  │  │    OperationErrorBoundary       │    │    │
│  │  │  (Updates operation status,     │    │    │
│  │  │   uploads logs to S3)           │    │    │
│  │  └─────────────────────────────────┘    │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### Error Handling Principles

1. **Fail Fast**: Throw immediately for configuration/validation errors
2. **Context Enrichment**: Each boundary adds context before re-throwing
3. **Log Capture**: Operations logs are captured and uploaded to S3
4. **Non-Blocking Cleanup**: Cleanup errors are logged but don't fail workflows

### Fix-Verify Loop

For integrity issues, the system runs a fix-verify loop:

```
Run Verify Stage
       │
       ▼
Evaluate Checks ◄───────────────────┐
       │                            │
       ▼                            │
[All Passed?] ──Yes──► Complete     │
       │                            │
       No                           │
       │                            │
       ▼                            │
[Max Attempts?] ──Yes──► Fail       │
       │                            │
       No                           │
       │                            │
       ▼                            │
Run Fix Operations ─────────────────┘
```

**Limits**:

- Global fix cycles: 3
- Per-check attempts: Configurable per check type

---

## Data Flow

### Workflow State Machine

```
                    ┌──────────────────────────────────────────┐
                    │                                          │
Pending ──► Processing ──► [Checkpoint?] ──► Completed         │
                │              │                               │
                │              ▼                               │
                │         Paused (waiting for manual action)   │
                │              │                               │
                │              ▼                               │
                │         Resumed ─────────────────────────────┘
                │
                ▼
            Failed
```

### Checkpoints

Workflows can pause at defined checkpoints for manual intervention:

| Checkpoint         | Purpose                           |
| ------------------ | --------------------------------- |
| `data_ready`       | Allow editing unified player data |
| `content_ready`    | Review generated content          |
| `paragraphs_ready` | Review written paragraphs         |
| `published`        | Workflow complete                 |

### Context Propagation

- **Workflow Context**: Stored in `workflow.context` JSON column
- **Operation Context**: Passed to handlers via job arguments
- **Creation Context**: Stores integrity check results, metadata

---

## Pros and Cons

### Pros

| Aspect                 | Benefit                                                     |
| ---------------------- | ----------------------------------------------------------- |
| **Reliability**        | PostgreSQL-backed persistence survives crashes and restarts |
| **Scalability**        | Horizontal scaling via multiple workers per queue           |
| **Observability**      | All state in PostgreSQL, easy to query and monitor          |
| **Declarative**        | Workflow templates make it easy to add new workflows        |
| **Extensibility**      | New operations added via handler functions                  |
| **Error Recovery**     | Automatic retries, fix-verify loops for integrity issues    |
| **Unified Scheduling** | Single system for both jobs and cron-like scheduling        |
| **Checkpoints**        | Manual intervention points for complex workflows            |
| **Coordination**       | Race condition prevention via encounter coordinator         |
| **Cleanup**            | Automated resource cleanup on retry                         |

### Cons

| Aspect                      | Limitation                                                  |
| --------------------------- | ----------------------------------------------------------- |
| **PostgreSQL Dependency**   | Requires PostgreSQL for both app and job queue              |
| **Polling Overhead**        | Encounter coordination uses polling (not event-driven)      |
| **Single Point of Failure** | PostgreSQL availability critical for all operations         |
| **Complex Debugging**       | Multi-manager architecture can be hard to trace             |
| **Manager Coupling**        | Callbacks create implicit dependencies between managers     |
| **No Distributed Lock**     | Encounter coordination relies on FIFO ordering, not locks   |
| **Template Rigidity**       | Changes to template structure require code changes          |
| **Memory Overhead**         | Log capture in AsyncLocalStorage per operation              |
| **Sequential Verify**       | Verify stage must run sequentially (performance bottleneck) |
| **Application-Specific**    | Current implementation tightly coupled to Delphi domain     |

---

## Recommendations for Central Package

### 1. Core Abstractions to Extract

```
@org/workflow-orchestrator
├── WorkflowOrchestrator (generic facade)
├── LifecycleManager (generic workflow lifecycle)
├── StageProcessor (generic stage/operation execution)
├── ErrorBoundaries (reusable error handling)
├── LogCapture (AsyncLocalStorage-based logging)
└── Types (WorkflowTemplate, Operation, etc.)
```

### 2. Configuration-Driven Design

Make queue configuration, worker counts, and timeouts configurable:

```typescript
const orchestrator = new WorkflowOrchestrator({
  queues: [
    { name: 'orchestrate', workers: 5 },
    { name: 'write', workers: 5 },
    { name: 'publish', workers: 1 },
  ],
  retry: { limit: 3, delay: 5 },
  timeout: { minutes: 30 },
});
```

### 3. Plugin Architecture for Operations

Replace hardcoded operation registry with plugin system:

```typescript
orchestrator.registerOperations({
  'gather.data': gatherHandler,
  'process.data': processHandler,
});
```

### 4. Abstract Coordination Strategy

Make encounter coordination pluggable:

```typescript
orchestrator.setCoordinator(
  new FifoCoordinator({
    pollInterval: 5000,
    timeout: 600000,
  }),
);

// Or use distributed locks
orchestrator.setCoordinator(
  new RedisLockCoordinator({
    redis: redisClient,
  }),
);
```

### 5. Separate Domain Logic

Keep workflow-specific logic (Delphi domain) separate from orchestration core:

```
@org/workflow-orchestrator (generic)
@delphi/workflows (Delphi-specific templates, handlers)
```

### 6. Event-Driven Coordination

Consider replacing polling with event-driven coordination:

```typescript
// Instead of polling
await coordinator.waitForOperation(operationId); // Polls every 5s

// Use pub/sub
await coordinator.subscribeToCompletion(operationId); // Event-driven
```

### 7. Checkpoint Customization

Make checkpoints more flexible:

```typescript
const template: WorkflowTemplate = {
  stages: [...],
  checkpoints: {
    after: 'prepare',
    condition: (workflow) => !workflow.isAutomated,
    status: 'data_ready',
  },
};
```

### 8. Typed Operation Arguments

Use generic types for operation arguments:

```typescript
type OperationHandler<TArgs, TResult> = (args: TArgs) => Promise<OperationResult<TResult>>;
```

### 9. Monitoring Hooks

Add hooks for monitoring/metrics:

```typescript
orchestrator.on('operation:start', ({ operationId, type }) => {
  metrics.increment('operation.started', { type });
});

orchestrator.on('operation:complete', ({ operationId, duration }) => {
  metrics.histogram('operation.duration', duration);
});
```

### 10. Migration Path

Provide adapters for gradual migration from current implementation:

```typescript
// Adapter wraps existing pg-boss setup
const adapter = new PgBossAdapter(existingBoss);
const orchestrator = new WorkflowOrchestrator({ adapter });
```

---

## Summary

The Delphi workflow orchestration system is a robust, PostgreSQL-backed solution for complex, multi-stage workflows. Key strengths include:

- **Reliability** through pg-boss persistence and retries
- **Flexibility** through declarative templates and operation handlers
- **Observability** through database-backed state and log capture

For a central package, focus on:

1. Extracting generic orchestration logic from domain-specific code
2. Making configuration and coordination strategies pluggable
3. Adding event-driven alternatives to polling
4. Providing strong typing and monitoring hooks

This will create a reusable foundation that can support multiple applications while maintaining the battle-tested patterns from the Delphi implementation.
