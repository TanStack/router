---
'@tanstack/router-plugin': minor
---

- **Removed:** `codeSplittingOptions.compilerPlugins` (the experimental Babel hook).
- **Removed from the root entry** (undocumented internals of the Babel splitter): `unpluginRouterCodeSplitterFactory`, `getObjectPropertyKeyName` and the types `CodeSplitCompilerPlugin`, `ReferenceRouteCompilerPlugin`, `ReferenceRouteCompilerPluginContext` and `VirtualRouteSplitNodeCompilerPluginContext`. Code splitting comes with the bundler entries (`@tanstack/router-plugin/vite`, `/rspack`, `/webpack`).
