# @sprqvntrs/bot-verify

Verify search-engine crawlers (Googlebot and the wider Google crawler family) against their **officially published IP ranges** and **reverse DNS**, and detect requests that *spoof* a crawler User-Agent from non-crawler IPs.

Ships as raw TypeScript (bundled by the consuming app). Framework-agnostic core plus an optional React Router 7 middleware adapter.

## Why

Bots set `User-Agent: Googlebot` to bypass bot protection while originating from IPs that aren't Google's. This package answers, authoritatively, "is this request really from Google?" — and is built so it will **never** classify a *real* Google crawler as spoofed. When it can't be sure, it returns `uncertain` (callers treat that as pass-through).

## Verdicts

`verify({ userAgent, ip })` resolves to one of:

| verdict | meaning | typical caller action |
|---|---|---|
| `not-a-claim` | UA doesn't claim a Google crawler | pass through |
| `verified` | claims a crawler **and** IP is in Google's ranges (or rDNS-confirmed) | pass through |
| `spoofed` | claims a crawler but IP is **not** Google's and rDNS does not confirm | block / log / ban |
| `uncertain` | claims a crawler but client IP unknown, or rDNS inconclusive (DNS error) | **pass through** (never block) |

Decision order: UA claim → valid client IP → IP in published ranges → reverse-DNS forward-confirm. Ranges are seeded from a bundled snapshot (so the store is never empty) and refreshed from Google daily; a failed refresh keeps the last-good list (fail-open).

## Core usage

```ts
import { createBotVerifier } from '@sprqvntrs/bot-verify';

const verifier = createBotVerifier({
  rdns: true,            // reverse-DNS confirm on a range miss (default true)
  rdnsTimeoutMs: 1500,
  logger: (r) => myLogger.debug('bot-verify', r),
});

const result = await verifier.verify({ userAgent, ip });
if (result.verdict === 'spoofed') { /* ... */ }
```

Other exports: `detectClaimedCrawler`, `getClientIp`, `ipInCidr` / `ipInAnyCidr` / `normalizeIp`, `RangeStore`, `GOOGLE_RANGE_URLS`, `reverseDnsVerify`.

## React Router 7 middleware

`react-router` is an optional peer dependency; only this subpath imports it.

```ts
// app/root.tsx
import { createVerifiedBotMiddleware } from '@sprqvntrs/bot-verify/react-router';

export const middleware = [
  createVerifiedBotMiddleware({
    mode: process.env.BOT_VERIFY_MODE === 'enforce' ? 'enforce' : 'monitor', // default monitor
    clientIp: { trustedHeader: 'x-real-ip' },   // trust a header your edge proxy overwrites
    onSpoof: (e) => {
      // e.userAgent is ATTACKER-CONTROLLED — strip CR/LF before logging to any parser
      const ua = e.userAgent.replace(/[\r\n]/g, ' ');
      logger.warn(`SPOOFED_GOOGLEBOT ip=${e.ip} bot=${e.claimedBot} path=${e.path} ua="${ua}"`);
    },
  }),
  // ...other middleware
];
```

- `mode: 'monitor'` (default) logs via `onSpoof` and lets the request through — use this first to confirm zero false positives.
- `mode: 'enforce'` returns `403 Forbidden` for spoofed requests.

### Client IP — read this

The leftmost `X-Forwarded-For` entry is attacker-controlled and is **never** trusted by default. Configure one of:

- `clientIp: { trustedHeader: 'x-real-ip' }` — when a proxy you control (e.g. nginx with `real_ip_header`) **overwrites** that header with the true client IP. Preferred.
- `clientIp: { xffTrustedProxyCount: N }` — trust `N` proxies counted from the **right** of `X-Forwarded-For`.

If the client IP can't be resolved, `verify` returns `uncertain` (never blocks).

### Banning via CrowdSec (note)

This package detects and (optionally) returns 403 in-app. For durable firewall-level bans the recommended pattern is to keep enforcement in your IDS: emit a structured `onSpoof` log line and let CrowdSec own remediation — and remember `userAgent` is untrusted (strip CR/LF) and the **ban key must be `event.ip`** (the verifier-derived IP), never anything parsed out of the UA.

## Tests

```sh
pnpm --filter @sprqvntrs/bot-verify test
```
