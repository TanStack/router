---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

webpack, Rspack and Rsbuild: a loader before the compiler's that passes an index source map (a map of `sections`) no longer fails the module; the map is composed like any other.
