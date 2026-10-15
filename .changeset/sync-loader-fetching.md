---
'@tanstack/router-core': patch
---

Avoid re-rendering a retained route when its loader reruns synchronously (for example after `router.invalidate()`): its match no longer briefly reports `isFetching: 'loader'`.
