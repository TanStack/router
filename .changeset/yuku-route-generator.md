---
'@tanstack/router-generator': minor
'@tanstack/router-plugin': patch
'@tanstack/router-cli': patch
'@tanstack/start-plugin-core': patch
---

Rebuild the route generator without Babel. Route files are read with Yuku and kept up by binding, not by name: an aliased `createFileRoute` import gets its id fixed, and a `createFileRoute` the app declares or imports from its own module is left alone. The route tree is rebuilt from the files on every change (deleting a layout keeps its child routes, a deleted `routeTree.gen.ts` is written again, edits of the virtual route config and of `__virtual.ts` files are picked up), and its types follow the router's own ids and full paths.

**`routeTree.gen.ts` formatting changes once.** The generator now prints the route tree directly in your `quoteStyle` and `semicolons`, and `enableRouteTreeFormatting` defaults to `false`: Prettier is no longer loaded unless you set it to `true`. A committed `routeTree.gen.ts` will show a one-time formatting diff after upgrading; set `enableRouteTreeFormatting: true` to keep Prettier formatting. Custom scaffolding templates are inserted as written (no longer reformatted).

Also: `.lazy.vue` files are the route's lazily loaded component, a piece next to a directory route (`route.component.vue`) belongs to that route, empty `.ts` route files get a scaffold without JSX, `importRoutesUsingAbsolutePaths` applies to lazy imports, `tmpDir` on another filesystem falls back to an atomic rename beside the file, a childless pathless layout no longer conflicts with the index route, and unusual file names (quotes, names that differ only by case or punctuation) give valid trees. On Rspack and webpack the generator watches every route root itself; Rsbuild Start apps now prune server-only routes from the client route tree like Vite.

`GeneratorPlugin.onRouteTreeChanged` now receives the tree model (`{ model }`), and the internal tree helpers (`format`, `inferFullPath`, `checkRouteFullPathUniqueness`, `writeIfDifferent`) are no longer exported.
