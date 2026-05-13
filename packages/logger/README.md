# @sprqvntrs/logger

TypeScript logging package built on [Pino](https://github.com/pinojs/pino) with structured logging, request tracing, and testing utilities.

## Installation

```bash
pnpm add @sprqvntrs/logger
```

## Quick Start

```typescript
import { createLogger } from '@sprqvntrs/logger';

const logger = createLogger({
  serviceName: 'my-service',
  level: 'debug', // optional, defaults to LOG_LEVEL env or 'info'
});

logger.info('Server started', { port: 3000 });
logger.error('Operation failed', { error: new Error('Something went wrong') });

// Child loggers for scoped context
const requestLogger = logger.child({ requestId: '123', userId: 'user-456' });
requestLogger.info('Processing request'); // includes requestId and userId
```

## Features

- Factory function (`createLogger`) and static class (`StaticLogger`) APIs
- Type-safe structured logging with `LogContext` interface
- Child logger support for scoped logging
- AsyncLocalStorage-based request ID propagation
- HTTP middleware with path/extension exclusions
- Server lifecycle presets (start, shutdown, errors)
- Worker/job logging presets
- Mock logger and spy utilities for testing
- Automatic redaction of sensitive fields (passwords, tokens, etc.)
- Opt-in pretty printing via `pino-pretty` (consumer-installed)

## Entry Points

| Import | Description |
|--------|-------------|
| `@sprqvntrs/logger` | Main exports (createLogger, StaticLogger, types, context utils) |
| `@sprqvntrs/logger/http` | HTTP middleware (createHttpLogger) |
| `@sprqvntrs/logger/server` | Server/worker lifecycle logging |
| `@sprqvntrs/logger/testing` | Mock logger for tests |

## API Reference

### `createLogger(options)`

Creates a new logger instance.

```typescript
interface CreateLoggerOptions {
  serviceName: string;           // Required: included in all logs
  level?: LogLevel;              // 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  version?: string;              // Service version (defaults to npm_package_version)
  pretty?: boolean;              // Pretty print (default: false, requires pino-pretty installed)
  redactPaths?: string[];        // Additional paths to redact
  base?: Record<string, unknown>; // Additional base fields
  timestamp?: boolean;           // Include timestamp (default: true)
}
```

### Logger Methods

```typescript
interface Logger {
  trace(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  fatal(message: string, context?: LogContext): void;

  child(bindings: Record<string, unknown>): Logger;
  readonly pino: PinoLogger; // Access underlying Pino instance
}
```

### Static Logger (Backward Compatible)

```typescript
import Logger from '@sprqvntrs/logger';

// Configure once at startup
Logger.configure({ serviceName: 'my-service' });

// Use anywhere
Logger.info('message', { key: 'value' });
Logger.error('failed', { error: new Error('oops') });

// Create child loggers
const child = Logger.child({ component: 'auth' });
```

## HTTP Middleware

```typescript
import { createHttpLogger } from '@sprqvntrs/logger/http';
import { createLogger } from '@sprqvntrs/logger';

const logger = createLogger({ serviceName: 'api' });

const httpLogger = createHttpLogger({
  logger,                                    // Use existing logger
  excludePaths: ['/health', '/metrics'],     // Don't log these paths
  excludeExtensions: ['.js', '.css', '.png'], // Don't log static files
  customProps: (req, res) => ({              // Add custom fields
    userAgent: req.headers['user-agent'],
  }),
});

// Express
app.use(httpLogger);

// Fastify
fastify.addHook('onRequest', (req, reply, done) => {
  httpLogger(req.raw, reply.raw, done);
});
```

## Request Context Propagation

Automatically include request IDs in all logs using AsyncLocalStorage:

```typescript
import {
  withRequestContext,
  generateRequestId,
  createRequestContextMiddleware,
} from '@sprqvntrs/logger';

// Express middleware
app.use(createRequestContextMiddleware());

// Or manual context
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || generateRequestId();
  withRequestContext({ requestId }, () => next());
});

// All subsequent logs automatically include requestId
logger.info('Processing'); // { requestId: '...', msg: 'Processing' }
```

## Server Lifecycle Logging

```typescript
import { createServerLogger } from '@sprqvntrs/logger/server';

const { logger, logServerStart, logShutdown, logServerClosed } =
  createServerLogger({
    serviceName: 'api',
    registerGlobalHandlers: true, // Handle uncaughtException/unhandledRejection
  });

const server = app.listen(3000, () => {
  logServerStart(3000, { url: 'http://localhost:3000' });
});

process.on('SIGTERM', () => {
  logShutdown('SIGTERM');
  server.close(() => logServerClosed());
});
```

## Worker/Job Logging

```typescript
import { createWorkerLogger } from '@sprqvntrs/logger/server';

const { logger, logJobStart, logJobComplete, logJobFailed } =
  createWorkerLogger({ serviceName: 'background-worker' });

async function processJob(job: Job) {
  const startTime = Date.now();
  logJobStart(job.id, job.type);

  try {
    await executeJob(job);
    logJobComplete(job.id, job.type, Date.now() - startTime);
  } catch (error) {
    logJobFailed(job.id, job.type, error);
    throw error;
  }
}
```

## Testing

```typescript
import { createMockLogger } from '@sprqvntrs/logger/testing';

describe('MyService', () => {
  let logger: MockLogger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  it('logs user creation', () => {
    const service = new MyService(logger);
    service.createUser({ name: 'Test' });

    expect(logger.hasLog((log) =>
      log.level === 'info' &&
      log.message.includes('User created')
    )).toBe(true);
  });

  it('captures error context', () => {
    const service = new MyService(logger);
    service.failingOperation();

    const errorLogs = logger.getLogsByLevel('error');
    expect(errorLogs).toHaveLength(1);
    expect(errorLogs[0]?.context?.error).toBeDefined();
  });

  afterEach(() => {
    logger.clear();
  });
});
```

### Spy Logger

Wrap a real logger to capture calls while still logging:

```typescript
import { createSpyLogger, createLogger } from '@sprqvntrs/logger/testing';

const realLogger = createLogger({ serviceName: 'test' });
const { logger, getCalls } = createSpyLogger(realLogger);

logger.info('test message', { key: 'value' });

expect(getCalls('info')).toContainEqual({
  message: 'test message',
  context: { key: 'value' },
});
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Log level | `info` |
| `NODE_ENV` | Included as `env` in log base fields | - |

## Pretty Printing (Development)

Pretty output is **opt-in**. To enable it, install `pino-pretty` as a dev dependency in your application and pass `pretty: true`:

```bash
pnpm add -D pino-pretty
```

```typescript
const logger = createLogger({
  serviceName: 'my-service',
  pretty: process.env.NODE_ENV !== 'production', // your choice when to enable
});
```

Without `pretty: true`, the logger emits structured JSON regardless of `NODE_ENV` — which is what production log aggregators (Datadog, CloudWatch, Loki) expect. If you pass `pretty: true` without `pino-pretty` installed, Pino will throw at instantiation.

## Automatic Redaction

The following paths are automatically redacted from logs:

- `password`, `token`, `authorization`, `apiKey`, `api_key`, `secret`, `credential`
- Nested paths: `*.password`, `*.token`, etc.
- Headers: `headers.authorization`, `headers.cookie`

Add custom redaction paths:

```typescript
const logger = createLogger({
  serviceName: 'api',
  redactPaths: ['*.ssn', 'creditCard'],
});
```

## TypeScript

This package exports TypeScript source files directly. Configure your bundler to transpile `node_modules/@sprqvntrs/*`:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true
  }
}
```
