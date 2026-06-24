/**
 * React Router 7 middleware adapter for `@sprqvntrs/bot-verify`.
 *
 * This is the ONLY file in this package that imports from `react-router`.
 * All other modules are framework-agnostic.
 *
 * @packageDocumentation
 */

import type { MiddlewareFunction } from 'react-router';
import { getClientIp } from '../src/client-ip.js';
import { createBotVerifier } from '../src/verify.js';
import type { BotVerifier, BotVerifierOptions } from '../src/verify.js';
import type { ClientIpOptions } from '../src/client-ip.js';

export type { BotVerifier, BotVerifierOptions } from '../src/verify.js';
export type { ClientIpOptions } from '../src/client-ip.js';

/** How the middleware should respond when it detects a spoofed bot. */
export type EnforcementMode = 'monitor' | 'enforce';

/**
 * Structured event emitted when a spoofed bot is detected.
 *
 * SECURITY NOTE: `userAgent` is attacker-controlled. Before writing it to any
 * log line that a downstream parser (e.g. CrowdSec, Fail2Ban, Splunk) consumes,
 * you MUST sanitize it — strip CR (`\r`) and LF (`\n`) characters to prevent
 * log-injection attacks. The `ip` field is derived from the verifier-resolved
 * client IP and is safe to use directly as a ban key.
 */
export interface SpoofEvent {
  /** Verifier-derived client IP (safe to use as a ban key). */
  ip: string | null;
  /**
   * Raw User-Agent value — ATTACKER-CONTROLLED. Strip CR/LF before logging
   * to any structured log parser.
   */
  userAgent: string;
  /** The Google crawler token that was falsely claimed. */
  claimedBot: string | null;
  /** URL pathname of the spoofed request. */
  path: string;
  /** HTTP method of the spoofed request (GET, POST, …). */
  httpMethod: string;
  /** How the spoof verdict was reached. */
  detectionMethod: 'ip-range' | 'rdns' | 'none';
  /** Enforcement mode active when the spoof was detected. */
  mode: EnforcementMode;
}

/** Options for {@link createVerifiedBotMiddleware}. */
export interface VerifiedBotMiddlewareOptions {
  /**
   * Whether to block spoofed requests or merely observe them.
   * - `'monitor'` (default): logs the event, lets the request through
   * - `'enforce'`: returns a 403 Forbidden response
   */
  mode?: EnforcementMode;
  /** Options passed to the client IP extractor. */
  clientIp?: ClientIpOptions;
  /**
   * Pre-created verifier instance. Takes precedence over `verifierOptions`.
   * Useful for sharing a single verifier across multiple middleware instances.
   */
  verifier?: BotVerifier;
  /**
   * Options passed to {@link createBotVerifier} when no `verifier` is supplied.
   */
  verifierOptions?: BotVerifierOptions;
  /**
   * Called when a spoofed bot is detected, in both `monitor` and `enforce` modes.
   * Errors thrown by this callback are swallowed to prevent spoofed traffic from
   * crashing legitimate request handling.
   *
   * The `event.userAgent` field is ATTACKER-CONTROLLED — sanitize it (strip
   * CR/LF) before passing it to any structured log parser.
   */
  onSpoof?: (event: SpoofEvent) => void;
  /**
   * Factory for the 403 response returned in `enforce` mode.
   * Defaults to `new Response('Forbidden', { status: 403 })`.
   */
  forbiddenResponse?: () => Response;
  /**
   * Optional pre-filter. When provided and returns `false`, the middleware
   * skips bot verification entirely and calls `next()`. Useful for excluding
   * static assets, health-check endpoints, etc.
   */
  shouldCheck?: (request: Request) => boolean;
}

/**
 * Creates a React Router 7 middleware that detects and optionally blocks
 * spoofed Google crawler requests.
 *
 * Usage in a route file:
 * ```typescript
 * import { createVerifiedBotMiddleware } from '@sprqvntrs/bot-verify/react-router';
 *
 * export const middleware = [
 *   createVerifiedBotMiddleware({ mode: 'enforce', onSpoof: (e) => console.warn(e) }),
 * ];
 * ```
 *
 * @param opts - Middleware configuration
 */
export function createVerifiedBotMiddleware(
  opts?: VerifiedBotMiddlewareOptions,
): MiddlewareFunction {
  const mode = opts?.mode ?? 'monitor';
  const verifier = opts?.verifier ?? createBotVerifier(opts?.verifierOptions);
  const forbiddenResponse = opts?.forbiddenResponse ?? (() => new Response('Forbidden', { status: 403 }));
  const onSpoof = opts?.onSpoof;
  const shouldCheck = opts?.shouldCheck;
  const clientIpOpts = opts?.clientIp;

  return async (args, next) => {
    const { request } = args;

    // Pre-filter: skip verification if caller says so
    if (shouldCheck && !shouldCheck(request)) {
      return next();
    }

    const userAgent = request.headers.get('user-agent') ?? '';
    const ip = getClientIp(request.headers, clientIpOpts);

    const result = await verifier.verify({ userAgent, ip });

    if (result.verdict !== 'spoofed') {
      return next();
    }

    const url = new URL(request.url);
    const event: SpoofEvent = {
      ip: result.ip,
      userAgent,
      claimedBot: result.claimedBot,
      path: url.pathname,
      httpMethod: request.method,
      detectionMethod: result.method,
      mode,
    };

    if (onSpoof) {
      try {
        onSpoof(event);
      } catch {
        // Swallow logger errors — do not let spoofed traffic crash request handling
      }
    }

    if (mode === 'enforce') {
      return forbiddenResponse();
    }

    return next();
  };
}
