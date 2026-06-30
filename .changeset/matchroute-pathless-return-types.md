---
'@tanstack/router-core': patch
---

fix(router-core): resolve `MatchRoute`/`useMatchRoute` return types for pathless (layout) routes. `TFrom` now also accepts a plain `string` and the resolved path is narrowed via `Extract<TResolved, string>`, so matching a route nested under a pathless layout no longer widens the returned params to `never`.
