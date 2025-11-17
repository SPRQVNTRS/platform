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
 * Helper function to wrap SDK errors with enhanced context
 */
export function wrapSdkError(
  error: unknown,
  context: LlmErrorContext,
): LlmError {
  const originalError = error instanceof Error ? error : new Error(String(error));

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
