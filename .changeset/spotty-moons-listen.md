---
'@tanstack/solid-router': patch
---

fix: prevent route-scoped accessors (e.g. `Route.useParams()`, `Route.useSearch()`) from throwing when read from async work after navigating away. Once the owning scope is disposed, the accessor returns its last known value instead of throwing "Could not find an active match".
