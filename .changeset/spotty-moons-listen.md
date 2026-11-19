---
'@tanstack/solid-router': patch
---

fix: keep route-scoped accessors (e.g. `Route.useParams()`, `Route.useSearch()`) readable when read from async work after navigating away. Once the owning scope is disposed, the accessor returns its last known value instead of `undefined` for the now-missing match.
