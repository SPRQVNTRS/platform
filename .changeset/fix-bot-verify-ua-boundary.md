---
"@sprqvntrs/bot-verify": patch
---

fix(bot-verify): detect crawler tokens terminated by `)` / `]` in the UA boundary regex.

`detectClaimedCrawler` previously allowed a token to be followed by `(` but not `)`, so common UAs like `Mozilla/5.0 ... (compatible; GoogleOther)` returned `null` and were treated as not-a-claim. Replaced the hand-rolled character-class boundaries with alphanumeric/hyphen lookarounds (`(?<![A-Za-z0-9-])TOKEN(?![A-Za-z0-9-])`), so close-paren/bracket-terminated tokens (GoogleOther, paren-terminated Googlebot) are matched while embedded substrings (e.g. `notagooglebot-thing`) still are not. Found via backtesting real production traffic.
