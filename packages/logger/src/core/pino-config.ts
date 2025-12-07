import pino from 'pino';
import type { CreateLoggerOptions } from '../types.js';
import { getSerializers } from './serializers.js';

/** Default paths to redact from logs */
const DEFAULT_REDACT_PATHS = [
  'password',
  'token',
  'authorization',
  'apiKey',
  'api_key',
  'secret',
  'credential',
  '*.password',
  '*.token',
  '*.authorization',
  '*.apiKey',
  '*.api_key',
  '*.secret',
  '*.credential',
  'headers.authorization',
  'headers.cookie',
];

/**
 * Determines if we're in development mode
 */
function isDevelopment(): boolean {
  return process.env['NODE_ENV'] === 'development';
}

/**
 * Gets the log level from options or environment
 */
function getLogLevel(options: CreateLoggerOptions): string {
  return options.level ?? process.env['LOG_LEVEL'] ?? 'info';
}

/**
 * Creates the transport configuration for pretty printing
 */
function createPrettyTransport(): pino.TransportSingleOptions {
  return {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'UTC:yyyy-mm-dd HH:MM:ss.l',
      ignore: 'pid,hostname',
      messageFormat: '{msg}',
    },
  };
}

/**
 * Creates a Pino logger configuration from options
 */
export function createPinoConfig(options: CreateLoggerOptions): pino.LoggerOptions {
  const shouldPrettyPrint = options.pretty ?? isDevelopment();
  const logLevel = getLogLevel(options);
  const redactPaths = [...DEFAULT_REDACT_PATHS, ...(options.redactPaths ?? [])];

  const config: pino.LoggerOptions = {
    level: logLevel,
    base: {
      service: options.serviceName,
      version: options.version ?? process.env['npm_package_version'],
      env: process.env['NODE_ENV'],
      ...options.base,
    },
    timestamp: options.timestamp !== false ? pino.stdTimeFunctions.isoTime : false,
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => {
        // In production, keep hostname and pid; in dev, they're ignored by pino-pretty
        return bindings;
      },
    },
    redact: {
      paths: redactPaths,
      censor: '[REDACTED]',
    },
    serializers: getSerializers(),
  };

  // Only add transport in development mode with pretty printing
  if (shouldPrettyPrint) {
    config.transport = createPrettyTransport();
  }

  return config;
}

/**
 * Creates a configured Pino logger instance
 */
export function createPinoInstance(options: CreateLoggerOptions): pino.Logger {
  const config = createPinoConfig(options);
  return pino(config);
}
