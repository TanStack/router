---
'@tanstack/router-utils': minor
---

Add the compiler core shared by the router plugin and TanStack Start, built on Yuku (`@tanstack/router-utils/compiler`): one parse and one plan per module and environment, with every output (the module, its split chunks, Hydrate chunks, server function providers) emitted from the original source with exact source maps.

The dev caches stay bounded by the live modules: deleted, renamed or no longer imported files leave no plans, raw facts or dependency-index rows behind, and publishing a plan updates only that plan's dependency rows. `TSR_COMPILER_STATS=1` exposes the cache sizes (`compilerStats()`) of the compiler core, the router plugin and the route generator, and `TSR_COMPILER_NO_CACHE` disables caches for measurements.

Removed the Babel helpers (`parseAst`, `generateFromAst`, `deadCodeElimination`, `findReferencedIdentifiers`, `stripTypeExports` and the binding helpers of `compiler-helpers`) and the `@babel/*` and `babel-dead-code-elimination` dependencies. Also removed the unused `logDiff`, `createIdentifier` and `decodeIdentifier` exports and the `ansis` and `diff` dependencies.
