---
'@sprqvntrs/workflows': minor
---

Add pg-boss introspection queries for debugging and monitoring workflow orchestration.

Exports `createPgBossQueries()` factory function providing:
- `getJobs()` - Query all jobs from pgboss.job table
- `getJobStats()` - Get job statistics grouped by queue and state
- `getSchedules()` - Query configured recurring schedules
- `getJobHistory()` - Get archived jobs for specific queues
- `deleteWorkflowJobs()` - Cancel/delete jobs for a workflow ID

Includes TypeScript types for all entities and results. Update README with usage examples.
