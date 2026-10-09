---
'@tanstack/router-plugin': patch
---

Generate the route tree and apply automatic code splitting in the esbuild plugin. Previously the esbuild integration never ran the route generator, so `autoCodeSplitting` silently left every route in the main bundle.
