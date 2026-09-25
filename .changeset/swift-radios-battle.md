---
'@tanstack/start-plugin-core': patch
---

Compile `createServerOnlyFn`, `createClientOnlyFn` and `createIsomorphicFn` calls before server functions and middleware, so they are transformed when passed directly to `.handler()` or nested inside a handler body.
