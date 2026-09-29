---
'@tanstack/history': patch
'@tanstack/router-core': patch
'@tanstack/react-router': patch
---

Keep one React Link subscription and selectively notify fixed destinations through a pathname index. Reuse the canonical builder's existing independence cache; keep source-dependent destinations live and conservatively broadcast after configuration or formatter changes. Defer only fixed-destination notifications owned by departing routes, then reconcile surviving subscriptions with the existing navigation transaction. Preserve href-only and reloadDocument-only prop updates.
