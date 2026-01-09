import type { FlushDestination, LogEntry, SerializedLogEntry } from '../types';

/**
 * Options for the JSON destination
 */
export interface JsonDestinationOptions {
  /** Additional metadata to include in the output */
  metadata?: Record<string, unknown>;
  /** Pretty print the JSON output (default: false) */
  pretty?: boolean;
}

/**
 * Serializes a LogEntry to a SerializedLogEntry with ISO timestamp
 */
function serializeLogEntry(entry: LogEntry): SerializedLogEntry {
  return {
    level: entry.level,
    message: entry.message,
    context: entry.context,
    timestamp: entry.timestamp.toISOString(),
  };
}

/**
 * Creates a flush destination that returns a JSON string
 *
 * @example
 * ```typescript
 * const buffered = createBufferedLogger({ logger });
 *
 * buffered.info('Request started');
 * buffered.info('Processing', { step: 1 });
 * buffered.info('Complete');
 *
 * const json = await buffered.flush(jsonDestination());
 * // Returns: {"entries":[...], "count": 3}
 *
 * // With metadata:
 * const json = await buffered.flush(jsonDestination({
 *   metadata: { requestId: '123', userId: 'user-1' }
 * }));
 * // Returns: {"entries":[...], "count": 3, "requestId": "123", "userId": "user-1"}
 * ```
 */
export function jsonDestination(options?: JsonDestinationOptions): FlushDestination<string> {
  return {
    async flush(entries: LogEntry[]): Promise<string> {
      const serializedEntries = entries.map(serializeLogEntry);

      const output: Record<string, unknown> = {
        entries: serializedEntries,
        count: serializedEntries.length,
        ...options?.metadata,
      };

      if (options?.pretty) {
        return JSON.stringify(output, null, 2);
      }
      return JSON.stringify(output);
    },
  };
}
