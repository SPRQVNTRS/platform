/**
 * Enhanced error classes for LLM operations with rich debugging context
 */

export interface LlmErrorContext {
  /**
   * The client type that encountered the error
   */
  clientType: 'openai' | 'anthropic' | 'openrouter';

  /**
   * The model being used
   */
  model: string;

  /**
   * Time elapsed before error (in milliseconds)
   */
  elapsedMs: number;

  /**
   * Timeout configuration (in milliseconds)
   */
  timeoutMs?: number;

  /**
   * Operation that failed
   */
  operation: string;

  /**
   * Request correlation ID for tracking
   */
  requestId?: string;

  /**
   * Additional metadata
   */
  metadata?: {
    promptSize?: number;
    schemaComplexity?: string;
    attempt?: number;
    maxAttempts?: number;
    [key: string]: any;
  };
}

/**
 * Base error class for all LLM-related errors with enhanced context
 */
export class LlmError extends Error {
  public readonly context: LlmErrorContext;
  public readonly originalError?: Error;
  public readonly timestamp: string;

  constructor(message: string, context: LlmErrorContext, originalError?: Error) {
    super(message);
    this.name = 'LlmError';
    this.context = context;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    // Append original stack if available
    if (originalError?.stack) {
      this.stack = `${this.stack}\n\nCaused by: ${originalError.stack}`;
    }
  }

  /**
   * Get a formatted error message with full context
   */
  getDetailedMessage(): string {
    const lines = [
      `[${this.context.clientType.toUpperCase()}] ${this.message}`,
      `Model: ${this.context.model}`,
      `Operation: ${this.context.operation}`,
      `Elapsed: ${this.context.elapsedMs}ms`,
    ];

    if (this.context.timeoutMs) {
      lines.push(`Timeout: ${this.context.timeoutMs}ms`);
      const percentage = ((this.context.elapsedMs / this.context.timeoutMs) * 100).toFixed(1);
      lines.push(`Progress: ${percentage}% of timeout`);
    }

    if (this.context.requestId) {
      lines.push(`Request ID: ${this.context.requestId}`);
    }

    if (this.context.metadata) {
      if (this.context.metadata.attempt && this.context.metadata.maxAttempts) {
        lines.push(`Attempt: ${this.context.metadata.attempt}/${this.context.metadata.maxAttempts}`);
      }
      if (this.context.metadata.promptSize) {
        lines.push(`Prompt size: ${this.context.metadata.promptSize} chars`);
      }
    }

    if (this.originalError) {
      lines.push(`Original error: ${this.originalError.message}`);
    }

    return lines.join('\n  ');
  }

  /**
   * Get a JSON representation of the error for logging
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      timestamp: this.timestamp,
      context: this.context,
      originalError: this.originalError
        ? {
            name: this.originalError.name,
            message: this.originalError.message,
            stack: this.originalError.stack,
          }
        : undefined,
      stack: this.stack,
    };
  }
}

/**
 * Error thrown when a request times out
 */
export class LlmTimeoutError extends LlmError {
  constructor(context: LlmErrorContext, originalError?: Error) {
    const message = `Request timed out after ${context.elapsedMs}ms (timeout: ${context.timeoutMs}ms)`;
    super(message, context, originalError);
    this.name = 'LlmTimeoutError';
  }
}

/**
 * Error thrown when response validation fails
 */
export class LlmValidationError extends LlmError {
  constructor(context: LlmErrorContext, originalError?: Error) {
    const message = 'Response validation failed';
    super(message, context, originalError);
    this.name = 'LlmValidationError';
  }
}

/**
 * Error thrown when the API returns an error
 */
export class LlmApiError extends LlmError {
  public readonly statusCode?: number;

  constructor(context: LlmErrorContext, statusCode?: number, originalError?: Error) {
    const message = statusCode
      ? `API error (status ${statusCode})`
      : 'API error';
    super(message, context, originalError);
    this.name = 'LlmApiError';
    this.statusCode = statusCode;
  }
}

/**
 * Error thrown when model output is truncated due to token limits
 */
export class LlmOutputTruncatedError extends LlmError {
  public readonly contentLength: number;

  constructor(context: LlmErrorContext, contentLength: number) {
    const message =
      `Model output was truncated (finish_reason: length). The ${contentLength}-char response exceeded the model's ` +
      'maximum output token limit. Consider reducing input size or using a model with higher output limits.';
    super(message, context);
    this.name = 'LlmOutputTruncatedError';
    this.contentLength = contentLength;
  }
}

/**
 * Error thrown when model returns invalid JSON despite finish_reason: 'stop'.
 * This typically indicates silent truncation where the model cut off mid-response
 * without signaling via finish_reason: 'length'.
 */
export class LlmJsonParseError extends LlmError {
  public readonly rawContent: string;
  public readonly parseError: SyntaxError;

  constructor(context: LlmErrorContext, rawContent: string, parseError: SyntaxError) {
    super(
      `Model returned invalid JSON (${rawContent.length} chars, ` +
        `finish_reason: ${context.metadata?.finishReason ?? 'unknown'}): ${parseError.message}`,
      context,
    );
    this.name = 'LlmJsonParseError';
    this.rawContent = rawContent;
    this.parseError = parseError;
  }
}

/**
 * Error thrown when configuration is invalid
 */
export class LlmConfigurationError extends LlmError {
  constructor(context: LlmErrorContext, originalError?: Error) {
    const message = 'Invalid client configuration';
    super(message, context, originalError);
    this.name = 'LlmConfigurationError';
  }
}

/**
 * Helper function to generate request IDs
 */
export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Helper function to determine if an error is a timeout error
 */
export function isTimeoutError(error: unknown): boolean {
  if (error instanceof LlmTimeoutError) {
    return true;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const name = error.name?.toLowerCase() || '';
    return (
      message.includes('timeout') ||
      message.includes('timed out') ||
      name.includes('timeout') ||
      name === 'apiconnectiontimeouterror'
    );
  }

  return false;
}

/**
 * Helper function to wrap SDK errors with enhanced context.
 * Extracts additional information from SDK error objects (status codes, error types,
 * request IDs) and creates the appropriate LlmError subclass.
 */
export function wrapSdkError(
  error: unknown,
  context: LlmErrorContext,
): LlmError {
  // If already wrapped, return as-is
  if (error instanceof LlmError) {
    return error;
  }

  const originalError = error instanceof Error ? error : new Error(String(error));

  // Extract additional context from SDK errors (OpenAI, Anthropic SDKs)
  const errorCode = (error as any)?.code as string | undefined;
  const errorType = (error as any)?.type || (error as any)?.error?.type;
  const providerRequestId =
    (error as any)?.headers?.['x-request-id'] ||
    (error as any)?.headers?.get?.('x-request-id');

  // Enrich metadata with SDK error details
  if (errorCode || errorType || providerRequestId) {
    context.metadata = {
      ...context.metadata,
      ...(errorCode && { errorCode }),
      ...(errorType && { errorType }),
      ...(providerRequestId && { providerRequestId }),
    };
  }

  // Detect timeout errors
  if (isTimeoutError(error)) {
    return new LlmTimeoutError(context, originalError);
  }

  // Detect API errors (check for status codes)
  const statusCode = (error as any)?.status || (error as any)?.statusCode;
  if (statusCode) {
    return new LlmApiError(context, statusCode, originalError);
  }

  // Detect validation errors
  if (originalError.name === 'ZodError' || originalError.message.includes('validation')) {
    return new LlmValidationError(context, originalError);
  }

  // Default to generic LlmError
  return new LlmError(originalError.message, context, originalError);
}

/**
 * Determines whether an error is retryable (transient) or permanent.
 *
 * Retryable: timeouts, 5xx server errors, 429 rate limits, generic/unknown errors.
 * Non-retryable: validation errors, config errors, output truncation, JSON parse errors, 4xx client errors.
 */
export function isRetryableError(error: unknown): boolean {
  // Non-retryable error types — these won't resolve on retry
  if (error instanceof LlmConfigurationError) return false;
  if (error instanceof LlmValidationError) return false;
  if (error instanceof LlmOutputTruncatedError) return false;
  if (error instanceof LlmJsonParseError) return false;

  // API errors: retry on 5xx and 429, not on other 4xx
  if (error instanceof LlmApiError) {
    if (!error.statusCode) return true;
    if (error.statusCode === 429) return true;
    if (error.statusCode >= 500) return true;
    return false;
  }

  // Timeouts are retryable
  if (error instanceof LlmTimeoutError) return true;

  // Generic LlmError (e.g. transient "An error occurred while processing the request")
  // and unknown errors — assume retryable
  return true;
}
