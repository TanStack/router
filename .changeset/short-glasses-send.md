---
'@tanstack/start-client-core': patch
'@tanstack/start-server-core': patch
---

Reduce request middleware overhead, reuse loaded entries and transport header requirements, and avoid unnecessary URL normalization for server functions. Preserve response helper writes made during body cancellation and SSR cleanup.
