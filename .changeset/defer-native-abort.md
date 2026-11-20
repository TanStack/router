---
'@tanstack/router-core': patch
---

Speed up client navigations by deferring the native `AbortController.abort()` of router controllers until their `signal` is read. Signals read before or after the router aborts them behave as before.
