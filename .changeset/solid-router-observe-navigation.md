---
'@tanstack/solid-router': patch
---

Declare navigations to Solid's observe tier. On Solid's dev and observe builds (`OBSERVE` defined), the match publish inside `startTransition` is wrapped in `OBSERVE.attribution.withOrigin` with the destination route's `fullPath`, params, `to`/`from` pathnames and `at` from the history change that started the load, so the holds and re-runs a navigation causes are named after the route and the record spans the loader wait. The pending offer, the initial load and same-location reloads are published undeclared. Nothing changes in production, where `OBSERVE` is undefined.
