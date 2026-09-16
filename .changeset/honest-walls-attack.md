---
'@tanstack/start-server-core': patch
'@tanstack/start-storage-context': patch
---

Skip empty route middleware chains and unused middleware bookkeeping. Avoid awaiting absent Start configuration, reuse the parsed request origin and serialization adapters, and return cached manifests directly when asset options are static.

Use the router's decoded pathname for server route handlers and route middleware.
