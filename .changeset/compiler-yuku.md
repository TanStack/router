---
'@tanstack/router-utils': minor
'@tanstack/router-generator': minor
'@tanstack/router-plugin': minor
'@tanstack/router-core': minor
'@tanstack/start-plugin-core': minor
'@tanstack/react-start-rsc': minor
---

The build-time compilers run on one compiler core built on [Yuku](https://github.com/yuku-toolchain/yuku) instead of Babel: route code splitting and route HMR in the router plugin, Start's server functions, environment separation, `<Hydrate>`, RSC CSS and import protection, and the route generator. Each module is compiled once per environment from its original source, with exact source maps.

**Dependencies.** `@babel/*`, `babel-dead-code-elimination`, `ansis` and `diff` are no longer dependencies, and the router plugin no longer depends on `chokidar` directly (the route generator brings it). `@babel/core` no longer comes with the router plugin or Start: if your app runs Babel itself (for example for the React Compiler), add `@babel/core` to your own `devDependencies`.

**New entries:** `@tanstack/router-utils/compiler` (the compiler core), `@tanstack/router-core/tooling` (the router-core helpers the plugins load instead of the router runtime) and `@tanstack/router-plugin/planners` (the route planners TanStack Start uses).

**Removed:**

- `@tanstack/router-utils`: the Babel helpers (`parseAst`, `generateFromAst`, `deadCodeElimination`, `findReferencedIdentifiers`, `stripTypeExports` and the binding helpers of `compiler-helpers`), `logDiff`, `createIdentifier` and `decodeIdentifier`.
- Start's experimental, Babel-typed `compilerTransforms` and `serverFnProviderModuleDirectives` options and the `StartCompilerPlugin`, `StartCompilerImportTransform`, `StartCompilerTransformContext` and `StartCompilerTransformCandidate` types. RSC integrations pass `rsc: { loadCssExpression, providerDirective }` instead.
- `@tanstack/react-start-rsc/plugin/rscCssTransform`: RSC CSS injection runs in Start's compiler.
- `ssrIsProvider` of `TanStackStartCoreOptions`: the Vite plugin derives it from `providerEnvironmentName`, the Rsbuild plugin from `rsc`.

**Router plugin context:** a context passed to the router plugins must come from `createRouterPluginContext()` (`@tanstack/router-plugin/context`), imported in the same module format (ESM or CJS) as the plugins. A hand-built `{ routesByFile: new Map() }`, or a context from the other module format, throws when the plugin is created, with an error naming the factory.
