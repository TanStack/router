---
'@tanstack/router-core': minor
'@tanstack/react-router': minor
'@tanstack/solid-router': minor
'@tanstack/vue-router': minor
---

Replace the experimental `skipRouteOnParseError` route option with `params.match` and `params.matchPriority` for route selection. `params.match` now gates matching with raw path params, while `params.parse` remains responsible for typed params and `params.stringify` remains responsible for URL generation.
