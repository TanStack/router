---
'@tanstack/router-core': minor
---

Export `teardownScrollRestoration` and `disposeRouter`, and return a cleanup function from `setupScrollRestoration` so document and window event listeners and router lifecycle subscriptions can be properly removed when disposing a router instance.
