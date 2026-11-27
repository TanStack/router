---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Throw an error in non-production environments when accessing self or descendant route context via `useRouteContext` inside a route's `pendingComponent`, allowing only parent route contexts (stripped in production).
