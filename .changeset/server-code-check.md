---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

Start's client builds now check that no client module holds server code: a server function's handler, a validator, a middleware's or an isomorphic function's server implementation, or a `createServerOnlyFn` body. The compiler removes these from the client already; if a compiler bug ever kept one, the build (or, in development, the module) fails with an internal compiler error naming the file, the position of the server code and the client module that held it, instead of shipping it.
