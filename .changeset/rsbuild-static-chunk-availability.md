---
'@tanstack/start-plugin-core': patch
---

Resolve Rsbuild static chunk imports in each chunk's own loading context. A shared chunk no longer links one route's CSS and preloads into its sibling routes, and each route still links the split chunks the shared chunk uses in that route.
