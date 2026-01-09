// Main factory function
export { createLogger, StaticLogger } from './src/core/logger';

// Backward-compatible default export (static logger)
export { StaticLogger as default } from './src/core/logger';

// Buffered logger
export { createBufferedLogger } from './src/core/buffered-logger';

// Flush destinations
export { jsonDestination } from './src/core/destinations';
export type { JsonDestinationOptions } from './src/core/destinations';

// Types
export type {
  Logger,
  LogLevel,
  LogContext,
  LogEntry,
  MockLogger,
  CreateLoggerOptions,
  LoggerConfigureOptions,
  HttpLoggerOptions,
  RequestContext,
  ServerLogger,
  BufferedLogger,
  BufferedLoggerOptions,
  FlushDestination,
  SerializedLogEntry,
} from './src/types';

// Context utilities for request tracing
export {
  withRequestContext,
  withRequestContextAsync,
  getRequestContext,
  getRequestId,
  getContextValue,
  updateRequestContext,
  generateRequestId,
  createRequestContextMiddleware,
} from './src/context/async-context';

// Serializers (for advanced customization)
export {
  errorSerializer,
  requestSerializer,
  responseSerializer,
  getSerializers,
} from './src/core/serializers';

// Pino config (for advanced customization)
export { createPinoConfig, createPinoInstance } from './src/core/pino-config';
