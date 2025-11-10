/**
 * Debug logging utility for LLM clients
 */

export interface DebugConfig {
  /**
   * Enable debug logging
   * - If true: always log debug messages
   * - If false: never log debug messages
   * - If undefined: auto-detect based on NODE_ENV (enabled in development)
   */
  enabled?: boolean;
}

export class DebugLogger {
  private enabled: boolean;
  private clientName: string;

  constructor(clientName: string, config?: DebugConfig) {
    this.clientName = clientName;

    // Auto-detect debug mode based on NODE_ENV if not explicitly set
    if (config?.enabled !== undefined) {
      this.enabled = config.enabled;
    } else {
      this.enabled = process.env.NODE_ENV === 'development';
    }
  }

  /**
   * Log a debug message
   */
  log(message: string, data?: Record<string, any>): void {
    if (!this.enabled) return;

    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${this.clientName}] ${message}`);

    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  /**
   * Log execution time if it exceeds the threshold
   */
  logExecutionTime(operation: string, timeMs: number, threshold: number = 20000): void {
    if (!this.enabled) return;

    if (timeMs > threshold) {
      this.log(`⚠️  Long execution time for ${operation}: ${timeMs}ms`);
    } else {
      this.log(`✓ ${operation} completed in ${timeMs}ms`);
    }
  }

  /**
   * Log API usage information
   */
  logUsage(usage: Record<string, any>): void {
    if (!this.enabled) return;

    this.log('API Usage', usage);
  }

  /**
   * Log response preview
   */
  logResponsePreview(response: string, maxLength: number = 500): void {
    if (!this.enabled) return;

    this.log('Response Preview', {
      length: response.length,
      preview: response.substring(0, maxLength) + (response.length > maxLength ? '...' : ''),
    });
  }

  /**
   * Check if debug logging is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
