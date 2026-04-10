---
'@tanstack/start-client-core': patch
'@tanstack/start-server-core': patch
---

Ensure request middleware context wins over colliding client-provided context in server function execution paths, including SSR, GET, and FormData requests.
