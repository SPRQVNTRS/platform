# @sprqvntrs/bot-verify

## 0.1.4

### Patch Changes

- c49e0c9: fix(bot-verify): the Google range refresh no longer stalls the request path. The refresh used to be awaited inside `verify()`, so a request claiming to be Googlebot waited for three fetches to developers.google.com with no timeout, and a hanging endpoint held a real crawler for minutes. It now starts in the background and the request is checked against the current list, with reverse-DNS as the fallback. Three faults are fixed: the refresh is no longer awaited on the request path and each attempt has a time limit (`rangeFetchTimeoutMs`, default 10 s), a failed refresh is retried at most once per `rangeRetryMs` (default 15 min) instead of on every crawler request, and concurrent requests share one refresh instead of each starting three fetches.

## 0.1.3

### Patch Changes

- 001f159: Publish with the job-scoped GITHUB_TOKEN instead of an operator PAT. No code change.

## 0.1.2

### Patch Changes

- 8a7a9e5: Relicensed to MIT and published to npmjs.com via trusted publishing; no code change.

## 0.1.1

### Patch Changes

- 5aa24fc: fix(bot-verify): detect crawler tokens terminated by `)` / `]` in the UA boundary regex.

  `detectClaimedCrawler` previously allowed a token to be followed by `(` but not `)`, so common UAs like `Mozilla/5.0 ... (compatible; GoogleOther)` returned `null` and were treated as not-a-claim. Replaced the hand-rolled character-class boundaries with alphanumeric/hyphen lookarounds (`(?<![A-Za-z0-9-])TOKEN(?![A-Za-z0-9-])`), so close-paren/bracket-terminated tokens (GoogleOther, paren-terminated Googlebot) are matched while embedded substrings (e.g. `notagooglebot-thing`) still are not. Found via backtesting real production traffic.

## 0.1.0

### Minor Changes

- d68d64f: feat(bot-verify): new package for verifying search-engine crawlers and detecting spoofed bots.

  Framework-agnostic core that classifies a request claiming to be a Google crawler as `verified` / `spoofed` / `uncertain` / `not-a-claim` by matching the source IP against Google's officially published ranges (googlebot, special-crawlers, user-triggered-fetchers — bundled as a fail-open fallback, refreshed daily) with a reverse-DNS forward-confirm fallback. Includes secure client-IP extraction (leftmost X-Forwarded-For never trusted) and a React Router 7 middleware adapter (`@sprqvntrs/bot-verify/react-router`) with `monitor`/`enforce` modes. Designed to NEVER classify a real Google crawler as spoofed — ambiguous cases return `uncertain` (pass-through).
