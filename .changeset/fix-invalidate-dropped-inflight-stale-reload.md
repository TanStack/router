---
'@tanstack/router-core': patch
---

fix(router-core): don't drop `invalidate()` when a background stale reload is in flight

`router.invalidate()` was silently ignored if a background stale reload was already running for the same match: no request was made, no error raised, and the match kept serving data fetched before the invalidation. Since the default `staleTime` of `0` starts such a reload on re-entering a route, any mutation shortly after arriving on a page could land in that window and appear to do nothing until a full reload.

`loadRouteMatch` now treats an explicitly invalidated match as a reason not to reuse an in-flight load, both in the early return and in the follow-up re-run check. Behaviour is unchanged for matches that are merely stale.
