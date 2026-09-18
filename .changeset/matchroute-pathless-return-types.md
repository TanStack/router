---
'@tanstack/router-core': patch
---

fix(router-core): resolve `MatchRoute`/`useMatchRoute` return types for pathless (layout) routes by looking the resolved path up with `RouteByPath` (fullPath-keyed) instead of `RouteById` (id-keyed). Matching a route nested under a pathless layout now returns its params instead of `never`.
