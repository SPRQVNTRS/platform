---
'@sprqvntrs/wp-rest': minor
---

Bound every outbound WordPress request with a per-request deadline.

All 57 `fetch` call sites in `WpApiManager` and `CptResource` now go through
`timedFetch`, which attaches `AbortSignal.timeout` when the caller supplied no
signal of its own. The budget defaults to 30s and is configurable per manager via
the new `requestTimeoutMs` constructor option; `WpApiManager.requestTimeoutMs` is
exposed on the `WpHttpClient` interface so `CptResource` inherits the same budget.

Why: undici applies no overall request deadline, so a WordPress origin that accepts
the connection and then stalls left the caller awaiting forever. Inside a queue
worker that is worse than an error — the job never settles. Measured on production
2026-08-27: three concurrent article publishes hung on `POST /wp/v2/media/{id}`
after WordPress had already created the post and linked its featured image, and the
workflows were later swept up as "orphaned mid-flight". A timeout now surfaces as an
ordinary rejection, which existing try/catch and fail-open branches already handle.

No behaviour change on a healthy origin. A caller that passes its own `signal`
keeps full control.
