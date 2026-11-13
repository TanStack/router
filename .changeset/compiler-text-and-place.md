---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

With React Server Components, a server function whose handler is itself a `createClientOnlyFn(…)` or `createIsomorphicFn()…` call now runs it compiled for the server: the client-only function throws, the isomorphic one runs its `.server()` implementation, and the provider no longer holds the client implementation. Before, the RSC provider ran the handler as written (the client-only function ran on the server). In the RSC environment's module, a server function nested in another value no longer keeps imports that only a client-only function in its validator or middleware read.
