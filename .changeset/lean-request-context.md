---
'@tanstack/router-core': patch
'@tanstack/start-storage-context': patch
---

Reduce per-request work in Start: `getNormalizedURL` reads a `URL` input without cloning it, and `runWithStartContext` returns the callback's own result instead of wrapping it in a promise, so a synchronous throw from the callback now propagates synchronously.
