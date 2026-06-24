# @sprqvntrs/bot-verify

## 0.1.1

### Patch Changes

- 5aa24fc: fix(bot-verify): detect crawler tokens terminated by `)` / `]` in the UA boundary regex.

  `detectClaimedCrawler` previously allowed a token to be followed by `(` but not `)`, so common UAs like `Mozilla/5.0 ... (compatible; GoogleOther)` returned `null` and were treated as not-a-claim. Replaced the hand-rolled character-class boundaries with alphanumeric/hyphen lookarounds (`(?<![A-Za-z0-9-])TOKEN(?![A-Za-z0-9-])`), so close-paren/bracket-terminated tokens (GoogleOther, paren-terminated Googlebot) are matched while embedded substrings (e.g. `notagooglebot-thing`) still are not. Found via backtesting real production traffic.

## 0.1.0

### Minor Changes

- d68d64f: feat(bot-verify): new package for verifying search-engine crawlers and detecting spoofed bots.

  Framework-agnostic core that classifies a request claiming to be a Google crawler as `verified` / `spoofed` / `uncertain` / `not-a-claim` by matching the source IP against Google's officially published ranges (googlebot, special-crawlers, user-triggered-fetchers — bundled as a fail-open fallback, refreshed daily) with a reverse-DNS forward-confirm fallback. Includes secure client-IP extraction (leftmost X-Forwarded-For never trusted) and a React Router 7 middleware adapter (`@sprqvntrs/bot-verify/react-router`) with `monitor`/`enforce` modes. Designed to NEVER classify a real Google crawler as spoofed — ambiguous cases return `uncertain` (pass-through).
