# @sprqvntrs/workflows

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
