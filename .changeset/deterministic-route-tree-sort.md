---
'@tanstack/router-generator': patch
---

Make `buildRouteTree` route ordering deterministic. Its final sort tiebreaker compared whole route-node objects (`(d) => d`), which coerce to `"[object Object]"` and so never order — an inconsistent comparator that left routes tying on segment-count/index-token in an engine- and input-dependent order, producing non-deterministic `routeTree.gen.ts` diffs across machines. The tiebreaker now compares `routePath`, mirroring the pre-sort and giving a stable total order.
