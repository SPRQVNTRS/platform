import pinoHttp from 'pino-http';
import type { Options as PinoHttpOptions } from 'pino-http';
import type { HttpLoggerOptions, LogLevel } from '../types.js';
import { createLogger } from '../core/logger.js';
import {
  withRequestContext,
  generateRequestId,
} from '../context/async-context.js';

/**
 * Common static file extensions to exclude from logging
 */
const DEFAULT_EXCLUDE_EXTENSIONS = [
  '.js',
  '.css',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.svg',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.map',
];

/**
 * Common paths to exclude from logging
 */
const DEFAULT_EXCLUDE_PATHS = ['/health', '/healthz', '/ready', '/metrics', '/favicon.ico'];

/**
 * Determines log level based on response status code
 */
function defaultCustomLogLevel(
  _req: unknown,
  res: { statusCode?: number },
  err?: Error
): LogLevel {
  if (err || (res.statusCode && res.statusCode >= 500)) {
    return 'error';
  }
  if (res.statusCode && res.statusCode >= 400) {
    return 'warn';
  }
  return 'info';
}

/**
 * Check if a path should be excluded from logging
 */
function shouldExcludePath(url: string, excludePaths: string[]): boolean {
  // Remove query string for path matching
  const pathname = url.split('?')[0] ?? url;
  return excludePaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Check if a URL has an excluded extension
 */
function shouldExcludeExtension(url: string, excludeExtensions: string[]): boolean {
  const pathname = url.split('?')[0] ?? url;
  return excludeExtensions.some((ext) => pathname.endsWith(ext));
}

interface HttpRequest {
  id?: string;
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
}

interface HttpResponse {
  statusCode?: number;
}

/**
 * Creates HTTP logging middleware using pino-http
 *
 * @example
 * ```typescript
 * import { createHttpLogger } from '@sprqvntrs/logger/http';
 * import { createLogger } from '@sprqvntrs/logger';
 *
 * const logger = createLogger({ serviceName: 'api' });
 * const httpLogger = createHttpLogger({
 *   logger,
 *   excludePaths: ['/health', '/metrics'],
 * });
 *
 * // Express
 * app.use(httpLogger);
 *
 * // Fastify
 * fastify.addHook('onRequest', (req, reply, done) => {
 *   httpLogger(req.raw, reply.raw, done);
 * });
 * ```
 */
export function createHttpLogger(options: HttpLoggerOptions = {}) {
  const excludePaths = [...DEFAULT_EXCLUDE_PATHS, ...(options.excludePaths ?? [])];
  const excludeExtensions = [
    ...DEFAULT_EXCLUDE_EXTENSIONS,
    ...(options.excludeExtensions ?? []),
  ];

  // Use provided logger or create a default one
  const logger =
    options.logger ??
    createLogger({
      serviceName: 'http',
    });

  const customLogLevel = options.customLogLevel ?? defaultCustomLogLevel;

  const pinoHttpOptions: PinoHttpOptions = {
    logger: logger.pino,

    // Generate request ID if not present
    genReqId: (req) => {
      const httpReq = req as HttpRequest;
      const existingId = httpReq.headers?.['x-request-id'];
      if (typeof existingId === 'string') {
        return existingId;
      }
      return generateRequestId();
    },

    // Control auto-logging based on path/extension exclusions
    autoLogging: {
      ignore: (req) => {
        const httpReq = req as HttpRequest;
        const url = httpReq.url ?? '';
        return (
          shouldExcludePath(url, excludePaths) ||
          shouldExcludeExtension(url, excludeExtensions)
        );
      },
    },

    // Custom serializers for request/response
    serializers: {
      req: (req) => {
        const httpReq = req as HttpRequest;
        return {
          id: httpReq.id,
          method: httpReq.method,
          url: httpReq.url,
          // Only include safe headers
          headers: httpReq.headers
            ? {
                'user-agent': httpReq.headers['user-agent'],
                'content-type': httpReq.headers['content-type'],
                'content-length': httpReq.headers['content-length'],
                host: httpReq.headers['host'],
              }
            : undefined,
        };
      },
      res: (res) => {
        const httpRes = res as HttpResponse;
        return {
          statusCode: httpRes.statusCode,
        };
      },
    },

    // Status-based log level
    customLogLevel: (req, res, err) => {
      return customLogLevel(req, res as HttpResponse, err);
    },

    // Custom success message
    customSuccessMessage: (req, res) => {
      const httpReq = req as HttpRequest;
      const httpRes = res as HttpResponse;
      return `${httpReq.method} ${httpReq.url} ${httpRes.statusCode}`;
    },

    // Custom error message
    customErrorMessage: (req, res, err) => {
      const httpReq = req as HttpRequest;
      const httpRes = res as HttpResponse;
      return `${httpReq.method} ${httpReq.url} ${httpRes.statusCode} - ${err.message}`;
    },

    // Add custom properties to each log
    customProps: options.customProps
      ? (req, res) => options.customProps!(req, res)
      : undefined,
  };

  const middleware = pinoHttp(pinoHttpOptions);

  // Wrap middleware to set up request context
  return (req: unknown, res: unknown, next: () => void) => {
    const httpReq = req as HttpRequest;
    const requestId =
      (typeof httpReq.headers?.['x-request-id'] === 'string'
        ? httpReq.headers['x-request-id']
        : undefined) ?? generateRequestId();

    // Set request ID on request object
    (req as { id?: string }).id = requestId;

    // Run in request context so all logs include requestId
    withRequestContext({ requestId }, () => {
      middleware(req as Parameters<typeof middleware>[0], res as Parameters<typeof middleware>[1], next);
    });
  };
}

/**
 * Extract request ID from incoming request headers
 * Falls back to generating a new ID
 */
export function extractRequestId(req: HttpRequest): string {
  const headerValue = req.headers?.['x-request-id'];
  if (typeof headerValue === 'string') {
    return headerValue;
  }
  return generateRequestId();
}
