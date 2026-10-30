---
'@tanstack/router-generator': minor
'@tanstack/router-cli': patch
---

Rebuild the route generator without Babel.

**`routeTree.gen.ts` formatting changes once.** The route tree is printed directly in your `quoteStyle` and `semicolons`, and `enableRouteTreeFormatting` now defaults to `false`: Prettier is loaded only when you set it to `true`. A committed `routeTree.gen.ts` shows a one-time formatting diff after upgrading. Custom scaffolding templates are inserted as written.

- Route files are recognised by binding: an aliased `createFileRoute` import gets its id fixed; a `createFileRoute` the app declares itself is left alone; a plain template literal path is reported, not rewritten (#7216).
- The tree is rebuilt from the files on every change: deleting a layout keeps its children, a deleted `routeTree.gen.ts` is written again, edits of the virtual route config and of `__virtual.ts` files are picked up, and a moved route gets its new id without a content change.
- Empty `.ts` route files get a scaffold without JSX (#8480); `.lazy.vue` files and `route.component.vue` pieces belong to their route; `importRoutesUsingAbsolutePaths` applies to lazy imports; unusual file names give valid trees.
- A route file used for two routes, and two routes with one id, are errors naming the files.
- A route file that does not parse fails `tsr generate` and builds, naming the file, the root route file included (main read the root without parsing it, so only the bundler failed on it); a build fails on it even when the plugin instance built or watched before. A dev server or watch session keeps the file's last good route and reports it.
- Writes are atomic per write (also when `tmpDir` is on another filesystem); the generator's own writes no longer regenerate.
- `tsr watch` and the Rspack/webpack plugins watch every route root, including `physical()` mounts.
- `GeneratorPlugin.onRouteTreeChanged` receives the tree model (`{ model }`). The internal helpers `format`, `inferFullPath`, `checkRouteFullPathUniqueness` and `writeIfDifferent` are no longer exported.
- The `GeneratorPlugin.afterTransform` hook is removed: a plugin reads every route from the tree model `onRouteTreeChanged` receives.
- `@tanstack/router-generator` and `@tanstack/router-cli` require Node `^20.19.0 || >=22.12.0`: the CommonJS build and the `tsr` binary load the ESM-only parser through `require(esm)`.
