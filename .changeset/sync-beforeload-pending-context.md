---
'@tanstack/router-core': patch
---

Ensure a route's `pendingComponent` consistently receives context returned by its own synchronous `beforeLoad` even when `pendingMs` has already elapsed before reaching the route.
