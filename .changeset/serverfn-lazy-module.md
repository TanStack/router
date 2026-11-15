---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
'@tanstack/start-server-core': patch
'@tanstack/start-client-core': patch
'@tanstack/react-start': patch
'@tanstack/solid-start': patch
'@tanstack/vue-start': patch
---

With the SSR environment as the server-function provider, a server function that only a route's split component (or other code the module does not keep) calls no longer loads its validator, middleware and handler imports when the server starts: it lives in the module's lazy server module with its chain, and the split component calls it through a small stub that loads that module on the first call. The server-function registry always imports the lazy server module, so an HTTP call loads a handler's imports before its middleware runs, as before the compiler rewrite. A declaration only a handler reads no longer lands in a route's eagerly loaded shared module.
