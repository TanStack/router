---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': minor
'@tanstack/react-start': patch
'@tanstack/solid-start': patch
'@tanstack/vue-start': patch
---

Start's Vite plugin compiles each module once per environment on the Yuku-based compiler core: route code splitting and route HMR, `<Hydrate>` extraction, the environment separation and import protection run in one pass, serving the split, Hydrate and server-function modules from the same plan. Import protection on Vite follows the new per-edge model: a denied import is substituted by a per-edge module whose mock exports the target's names (following `export *`), build violations are decided after tree-shaking with a fixed-point rebuild when `onViolation` allows an edge, exempt importers (`ignoreImporters`, `exclude`, `include`) and `onViolation` returning `false` get the real module, dependencies that mark themselves server-only follow `excludeFiles`, non-JS importers (`.mdx`, `.vue`) are judged on their compiled output, reports locate the import in the original source (also with vite-tsconfig-paths and lone-CR line endings), and the trace follows the bundler graph through modules outside the source directory. A server-only-marked client entry fails the build. Solid Start server environments split route components like the client so hydration keys agree. Hydrate chunks export their component as `H<n>` with ordinal boundary ids, as before the rewrite.

Removed from `@tanstack/start-plugin-core`: the Vite import-protection plugin and the interim Babel Hydrate post-pass (both replaced); the Rsbuild path is unchanged.
