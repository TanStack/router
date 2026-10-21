---
'@tanstack/start-plugin-core': patch
---

Record an Rsbuild static chunk import only when the chunk is loaded on every path to the importing chunk, so a shared chunk no longer links one route's lazy CSS and preloads into its sibling routes.
