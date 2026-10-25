---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
'@tanstack/router-plugin': patch
'@tanstack/router-generator': patch
---

The compiler's dev caches stay bounded by the live modules: deleted, renamed or no longer imported files leave no plans, raw facts, dependency-index rows or import-protection records behind (Vite and Rsbuild), and publishing a plan updates only that plan's dependency rows. Editing the imports of a route module no longer fully reloads the page in Start. `TSR_COMPILER_STATS=1` exposes the cache sizes and `TSR_COMPILER_NO_CACHE` disables caches for measurements.
