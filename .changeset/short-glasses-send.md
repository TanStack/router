---
'@tanstack/start-client-core': patch
'@tanstack/start-server-core': patch
---

Reduce request middleware overhead, reuse loaded entries and transport header requirements, and avoid unnecessary URL normalization for server functions. Preserve response helper writes made during body cancellation and SSR cleanup.

Avoid allocating absent middleware headers and reply context, and construct RPC redirects with their final response state. Preserve middleware accessor evaluation and the documented undefined value for absent `sendContext`.
