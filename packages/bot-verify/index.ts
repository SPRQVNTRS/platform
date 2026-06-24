/**
 * @sprqvntrs/bot-verify
 *
 * Detect spoofed search-engine crawlers by verifying the source IP against
 * Google's published CIDR ranges and/or reverse-DNS.
 *
 * Framework-agnostic core. The React Router 7 middleware adapter is available
 * at the `@sprqvntrs/bot-verify/react-router` subpath.
 *
 * @packageDocumentation
 */

// =============================================================================
// Types
// =============================================================================

export type { BotVerdict, VerifyInput, VerifyResult } from './src/types.js';

// =============================================================================
// User-Agent detection
// =============================================================================

export { detectClaimedCrawler, GOOGLE_CRAWLER_TOKENS } from './src/ua.js';
export type { GoogleCrawlerToken } from './src/ua.js';

// =============================================================================
// CIDR / IP utilities
// =============================================================================

export { ipInCidr, ipInAnyCidr, normalizeIp } from './src/cidr.js';

// =============================================================================
// IP range store
// =============================================================================

export { parsePrefixes, RangeStore, GOOGLE_RANGE_URLS } from './src/ranges.js';
export type { RangeStoreOptions } from './src/ranges.js';

// =============================================================================
// Reverse-DNS verification
// =============================================================================

export { reverseDnsVerify } from './src/rdns.js';
export type { ReverseDnsOptions } from './src/rdns.js';

// =============================================================================
// Core verifier
// =============================================================================

export { createBotVerifier } from './src/verify.js';
export type { BotVerifier, BotVerifierOptions } from './src/verify.js';

// =============================================================================
// Client IP extraction
// =============================================================================

export { getClientIp } from './src/client-ip.js';
export type { ClientIpOptions } from './src/client-ip.js';
