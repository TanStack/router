---
'@tanstack/solid-router': patch
---

Observe tier (Solid's dev and observe builds only): a redirect while the first page loads — a client-rendered arrival whose `beforeLoad` or loader throws `redirect()` — is recorded as a navigation from the arrival to where the redirect sent it, after the initial record that names the arrival, as `@solidjs/router` records one. It had no record: nothing was shown yet to navigate from. Nothing changes in production, where `OBSERVE` is undefined.
