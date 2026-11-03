---
'@tanstack/start-fn-stubs': minor
---

Preserve server and client result types in `createIsomorphicFn` metadata while keeping its ordinary callable result as their union. Router uses this metadata to infer client lifecycle data and check hydration transforms against the client handler.
