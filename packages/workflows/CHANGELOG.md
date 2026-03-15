# @sprqvntrs/workflows

## 0.2.4

### Patch Changes

- 3c544ee: fix(workflows): avoid passing undefined monitorStateIntervalSeconds to pg-boss

## 0.2.3

### Patch Changes

- 2eb2481: Fix: create queues after pg-boss start and add admin query methods

  Bug fixes:
  - Create all configured queues after boss.start() (pg-boss v10+ requires explicit queue creation)
  - Add ensureQueueExists() helper to create queues on-demand for templates not in initial config
  - Call ensureQueueExists() in start() method before sending jobs

  New features:
  - Add deletePendingJobs(queueName?) - Delete all pending jobs, optionally by queue
  - Add cancelPendingJobs(queueName?) - Cancel pending jobs without deleting them
  - Add purgeJobsByState(state, queueName?) - Delete jobs by state
  - Export PendingJobsResult type

## 0.2.2

### Patch Changes

- 6be5be8: Fix: start pg-boss immediately in createWorkflowOrchestrator

  pg-boss was only started in startWorker(), preventing job sending in server/worker split architectures. Now boss.start() is called in createWorkflowOrchestrator() so jobs can be queued immediately without starting a worker.

  This enables proper server/worker separation where the server can create the orchestrator and queue jobs, while workers can create the orchestrator and start processing without duplicate initialization.

## 0.2.1

### Patch Changes

- fd9da30: Fix: prevent undefined values being passed to pg-boss SendOptions

  When starting workflows without explicit priority, startAfterSeconds, or singletonKey options, undefined values were being passed to pg-boss, causing validation errors like "priority must be an integer". This fix filters out undefined values in both the orchestrator.start() method and createSendOptions() function.

  Also adds comprehensive tests to the pg-boss infrastructure module to catch this bug in the future.

## 0.2.0

### Minor Changes

- bd98567: Add pg-boss introspection queries for debugging and monitoring workflow orchestration.

  Exports `createPgBossQueries()` factory function providing:
  - `getJobs()` - Query all jobs from pgboss.job table
  - `getJobStats()` - Get job statistics grouped by queue and state
  - `getSchedules()` - Query configured recurring schedules
  - `getJobHistory()` - Get archived jobs for specific queues
  - `deleteWorkflowJobs()` - Cancel/delete jobs for a workflow ID

  Includes TypeScript types for all entities and results. Update README with usage examples.

## 0.1.1

### Patch Changes

- 76a95d8: Migrate database client from postgres.js to node-postgres (pg)
  - Replace postgres package with pg (^8.11.0) as the primary database client
  - Update Drizzle ORM imports from drizzle-orm/postgres-js to drizzle-orm/node-postgres
  - Change Database type from PostgresJsDatabase to NodePgDatabase
  - Update all documentation examples to use pg Pool instead of postgres client
  - All functionality remains identical; this is purely a client library swap for better node-postgres compatibility
