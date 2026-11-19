---
'@tanstack/solid-router': patch
---

Fix hydration desync by resolving `defaultNotFoundComponent` at render time instead of lazily mutating the boundary route's `options.notFoundComponent`. Route objects are module singletons shared across server requests, so once the server handled any 404, later SSRs of valid URLs wrapped the match in a `CatchNotFound` boundary the client didn't render, shifting hydration keys and leaving the subtree inert.
