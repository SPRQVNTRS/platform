---
name: ipaddr-normalization
description: ipaddr.js IPv6 normalization — toRFC5952String() for compressed form, not toNormalizedString()
metadata:
  type: feedback
---

When normalizing IPv6 addresses with ipaddr.js:

- `v6.toNormalizedString()` — returns EXPANDED form: `"2001:4860:4801:10:0:0:0:1"`
- `v6.toRFC5952String()` — returns COMPRESSED form: `"2001:4860:4801:10::1"` and `"::1"`

**Why:** The package's `normalizeIp()` function is used to compare IPs (e.g. in rDNS forward-confirm step). Comparisons must use the same canonical form. RFC 5952 compressed form is the canonical representation.

**How to apply:** Always use `toRFC5952String()` when producing a canonical IPv6 string for storage or comparison. Reserve `toNormalizedString()` only when the expanded form is explicitly required.
