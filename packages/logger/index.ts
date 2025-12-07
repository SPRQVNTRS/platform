// Main factory function
export { createLogger, StaticLogger } from './src/core/logger.js';

// Backward-compatible default export (static logger)
export { StaticLogger as default } from './src/core/logger.js';

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
} from './src/types.js';

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
} from './src/context/async-context.js';

// Serializers (for advanced customization)
export {
  errorSerializer,
  requestSerializer,
  responseSerializer,
  getSerializers,
} from './src/core/serializers.js';

// Pino config (for advanced customization)
export { createPinoConfig, createPinoInstance } from './src/core/pino-config.js';
