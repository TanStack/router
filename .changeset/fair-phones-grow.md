---
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Fix `MatchRoute` child callback param inference to resolve params from the target `to` route instead of the route path key across React, Solid, and Vue adapters.
