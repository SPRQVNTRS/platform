---
"@sprqvntrs/bot-verify": patch
---

fix(bot-verify): the Google range refresh no longer stalls the request path. The refresh used to be awaited inside `verify()`, so a request claiming to be Googlebot waited for three fetches to developers.google.com with no timeout, and a hanging endpoint held a real crawler for minutes. It now starts in the background and the request is checked against the current list, with reverse-DNS as the fallback. Three faults are fixed: the refresh is no longer awaited on the request path and each attempt has a time limit (`rangeFetchTimeoutMs`, default 10 s), a failed refresh is retried at most once per `rangeRetryMs` (default 15 min) instead of on every crawler request, and concurrent requests share one refresh instead of each starting three fetches.
