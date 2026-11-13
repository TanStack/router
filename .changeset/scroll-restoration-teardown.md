---
'@tanstack/router-core': minor
---

Export `teardownScrollRestoration` and `disposeRouter`, and return a cleanup function from `setupScrollRestoration` so document and window event listeners and router lifecycle subscriptions can be properly removed when disposing a router instance.

Disposing the last router that uses scroll restoration hands  back to the mode it had before, and a cleanup returned by an earlier setup no longer tears down a later one.
