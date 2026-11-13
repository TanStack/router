---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

The server-code check of client builds now takes what is server-only from the compiler's recognition of the code (every server function's handler and validator, middleware's server implementation and validator, isomorphic function's server implementation, `createServerOnlyFn` body, and route option in `deleteNodes`) instead of from what the compiler removed, so a compiler bug that skipped one of them also fails the build instead of shipping it.
