---
'@tanstack/router-utils': minor
---

Add the compiler core shared by the router plugin and TanStack Start, built on Yuku (`@tanstack/router-utils/compiler`): one parse and one plan per module and environment, with every output (the module, its split chunks, Hydrate chunks, server function providers) emitted from the original source with exact source maps.

Removed the Babel helpers (`parseAst`, `generateFromAst`, `deadCodeElimination`, `findReferencedIdentifiers`, `stripTypeExports` and the binding helpers of `compiler-helpers`) and the `@babel/*` and `babel-dead-code-elimination` dependencies.
