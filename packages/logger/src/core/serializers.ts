import pino from 'pino';

/**
 * Standard error serializer that handles Error objects
 * and extracts useful information including cause chain
 */
export function errorSerializer(error: unknown): Record<string, unknown> | unknown {
  if (error instanceof Error) {
    return {
      type: error.constructor.name,
      message: error.message,
      stack: error.stack,
      ...(error.cause !== undefined && { cause: errorSerializer(error.cause) }),
      // Include any additional properties on the error
      ...Object.fromEntries(
        Object.entries(error).filter(
          ([key]) => !['message', 'stack', 'cause'].includes(key)
        )
      ),
    };
  }
  return error;
}

/**
 * Request serializer for HTTP requests
 * Extracts commonly needed fields while excluding sensitive data
 */
export function requestSerializer(req: {
  id?: string;
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  remoteAddress?: string;
}): Record<string, unknown> {
  return {
    id: req.id,
    method: req.method,
    url: req.url,
    // Only include non-sensitive headers
    headers: req.headers
      ? {
          'user-agent': req.headers['user-agent'],
          'content-type': req.headers['content-type'],
          'content-length': req.headers['content-length'],
          host: req.headers['host'],
        }
      : undefined,
    remoteAddress: req.remoteAddress,
  };
}

/**
 * Response serializer for HTTP responses
 */
export function responseSerializer(res: {
  statusCode?: number;
  headers?: Record<string, string>;
}): Record<string, unknown> {
  return {
    statusCode: res.statusCode,
    headers: res.headers
      ? {
          'content-type': res.headers['content-type'],
          'content-length': res.headers['content-length'],
        }
      : undefined,
  };
}

/**
 * Get all custom serializers
 */
export function getSerializers(): pino.LoggerOptions['serializers'] {
  return {
    err: pino.stdSerializers.err,
    error: errorSerializer,
    req: requestSerializer,
    res: responseSerializer,
  };
}
