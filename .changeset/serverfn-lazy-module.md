---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

With the SSR environment as the server-function provider, a server function that only a route's split component (or other code the module does not keep) calls no longer loads its validator and handler imports when the server starts: it lives in the module's lazy server module with its chain, whatever builder, factory or options the chain starts from. The split component's copy is a caller, as in the browser: the chain with its middleware, without its validator, calling the one server function through the server-function registry. The server-function registry always imports the lazy server module, so an HTTP call loads a handler's imports before its middleware runs, as before the compiler rewrite. A declaration only a handler reads no longer lands in a route's eagerly loaded shared module.
