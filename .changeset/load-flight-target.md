---
'@tanstack/solid-router': patch
---

New `loadFlightTarget` helper (exported from `@tanstack/solid-router/ssr/server`): the router's half of a single-flight refresh. Given the mutation request's target href, it builds a router for that location, loads it, and returns the dehydrated payload for the `tsr` flight-data slice, so server collectors can refresh router state alongside other caches on the same mutation response.
