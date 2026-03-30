---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Preserve component-thrown `notFound()` errors through framework error boundaries so route `notFoundComponent` handlers render without requiring an explicit `routeId`.
