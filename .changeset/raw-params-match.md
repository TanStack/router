---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
'@tanstack/start-server-core': patch
---

Preserve path params in their raw string form while matching routes so structured values returned by `params.parse` produce stable match IDs and do not reuse stale loader data.

`RouterCore.getMatchedRoutes()` now returns `[matchedRoutes, rawParams, foundRoute]` instead of an object.
