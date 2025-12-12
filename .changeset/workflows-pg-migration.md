---
"@sprqvntrs/workflows": patch
---

Migrate database client from postgres.js to node-postgres (pg)

- Replace postgres package with pg (^8.11.0) as the primary database client
- Update Drizzle ORM imports from drizzle-orm/postgres-js to drizzle-orm/node-postgres
- Change Database type from PostgresJsDatabase to NodePgDatabase
- Update all documentation examples to use pg Pool instead of postgres client
- All functionality remains identical; this is purely a client library swap for better node-postgres compatibility
