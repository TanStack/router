---
'@tanstack/router-utils': minor
'@tanstack/start-plugin-core': patch
---

Removed the Babel compiler helpers from `@tanstack/router-utils` (`parseAst`, `generateFromAst`, `deadCodeElimination`, `findReferencedIdentifiers`, `stripTypeExports` and the module-level binding helpers of `compiler-helpers`) and the `@babel/*` and `babel-dead-code-elimination` dependencies: no TanStack compiler uses them since the router plugin and both Start hosts run on the Yuku-based compiler core. `@tanstack/start-plugin-core` drops the Babel `<Hydrate>` transform and import-protection analysis modules that no host imports anymore, and its `@babel/*` and `source-map` dependencies.
