---
"@sprqvntrs/wp-rest": patch
---

remove dead `triggerApifDataForPost()` / `apif/v1` integration — the endpoint no longer exists on any WordPress host and the method (which also embedded a hardcoded api_key in source) had no remaining callers (fixes #15)
