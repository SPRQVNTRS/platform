---
"@sprqvntrs/bot-verify": minor
---

feat(bot-verify): new package for verifying search-engine crawlers and detecting spoofed bots.

Framework-agnostic core that classifies a request claiming to be a Google crawler as `verified` / `spoofed` / `uncertain` / `not-a-claim` by matching the source IP against Google's officially published ranges (googlebot, special-crawlers, user-triggered-fetchers — bundled as a fail-open fallback, refreshed daily) with a reverse-DNS forward-confirm fallback. Includes secure client-IP extraction (leftmost X-Forwarded-For never trusted) and a React Router 7 middleware adapter (`@sprqvntrs/bot-verify/react-router`) with `monitor`/`enforce` modes. Designed to NEVER classify a real Google crawler as spoofed — ambiguous cases return `uncertain` (pass-through).
