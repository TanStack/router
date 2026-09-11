---
'@tanstack/start-server-core': patch
---

Return `499 Client Closed Request` instead of an unhandled 500 when the client disconnects mid-request. Applies to SSR, server routes, and server functions.
