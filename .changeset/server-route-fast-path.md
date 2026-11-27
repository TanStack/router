---
'@tanstack/start-server-core': minor
'@tanstack/start-plugin-core': minor
'@tanstack/router-core': minor
---

perf(start): dispatch server-only routes without constructing a Router. The Start plugin builds a server-only route tree, and `createStartHandler` matches exact server-route requests against it before touching the router entry, which now loads lazily. Apps whose root route defines `server` options, or where a server-only param route would shadow a page, keep the Router path with a build warning.

Router-level `caseSensitive` and `rewrite` options are not applied to a request served from the server-only tree; route-level `caseSensitive` is. Only the Vite plugin builds the tree, so Rsbuild apps keep the Router path.

`@tanstack/router-core` now exports `processRouteTree`, `findRouteMatch` and the `ProcessRouteTreeResult` type.
