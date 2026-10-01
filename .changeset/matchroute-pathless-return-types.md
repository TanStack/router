---
'@tanstack/router-core': patch
---

fix(router-core): resolve the `router.matchRoute` return type for routes nested under a pathless (layout) route. `MatchRouteFn` now looks the resolved path up with `RouteByPath` (keyed by `fullPath`) instead of `RouteById` (keyed by route id, which keeps the pathless segment), so matching `/nested/$id` under `_pathless` returns `false | { id: string }` instead of `false`. `TFrom` also accepts an arbitrary string, in line with `NavigateFn`.
