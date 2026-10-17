---
'@tanstack/router-plugin': patch
---

Remove the `enableRouteGeneration` option. Route generation now always runs, so `autoCodeSplitting` always has the route metadata it needs.
