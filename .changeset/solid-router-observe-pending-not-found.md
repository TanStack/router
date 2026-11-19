---
'@tanstack/solid-router': patch
---

Observe tier (Solid's dev and observe builds only): a not-found under a route with a loader (`/users/2/nope` under `/users/$id`) is recorded, named by its pathname, as `@solidjs/router` records an unmatched path. The route's match sits below the not-found boundary and never loads, so it stays `pending` in the publish that lands, which was mistaken for the pending offer and published undeclared: the navigation had no record. Only a match pending at or above the not-found boundary marks the pending offer now. Nothing changes in production, where `OBSERVE` is undefined.
