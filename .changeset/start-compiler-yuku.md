---
'@tanstack/start-plugin-core': minor
'@tanstack/router-core': minor
'@tanstack/start-client-core': patch
'@tanstack/react-start': patch
'@tanstack/solid-start': patch
'@tanstack/vue-start': patch
---

Start's Vite and Rsbuild plugins run on the new compiler core instead of Babel: each module compiles once per environment, with server functions, environment separation, `<Hydrate>`, RSC CSS, route code splitting and HMR, and import protection in one pass. Builds and dev startup are 2–4× faster on a 340-route benchmark app.

**What changes for your app when you upgrade:**

- **Every server function id changes** (a shorter hash of the file and the function's name). Update CDN rules, WAF allowlists, analytics keyed by id and native clients that call `/_serverFn/<id>` directly. Browser tabs loaded before a deploy fail their next server-function call after it: plan a reload or a blue/green window.
- **`serverFns.generateFunctionId` receives the function's stable name** (`greetUser`) as `functionName`, not the generated handler name (`greetUser_createServerFn_handler`). Custom generators keyed on the old names must be updated.
- **Production builds answer HTTP calls only for server functions that some client module imports.** A function only server code calls, or one returned to the client as data, gets a 404 over HTTP. The dev server still answers and warns once per function, so this shows up only after deploying: check the dev warnings before you ship.
- **A module the compiler cannot parse fails the client build** with an error naming the file, instead of shipping untransformed (its server code included).
- **Exported route components and helpers split in Start apps too** (see the router plugin's changeset): each split chunk carries its own copy of a pure exported binding, importers of the route file share one instance, and both Start hosts (Vite and Rsbuild) warn after a client build when a module loaded with the entry imports such a binding through the route file.
- **`routeTree.gen.ts` formatting changes once**: `enableRouteTreeFormatting` now defaults to `false` and the tree is printed in your `quoteStyle` and `semicolons`; commit the one-time diff.
- **Removed (experimental, Babel-typed):** the `compilerTransforms` and `serverFnProviderModuleDirectives` options and the `StartCompilerPlugin`, `StartCompilerImportTransform`, `StartCompilerTransformContext` and `StartCompilerTransformCandidate` types. RSC integrations pass `rsc: { loadCssExpression, providerDirective }` instead.

**Server functions**

- **Production builds answer HTTP calls only for server functions that client code imports.** A function only server code calls (another server function, a server route), or one returned to the client as data, is refused when called over HTTP. The dev server still answers such a call and warns once per function.
- `serverFns.generateFunctionId` receives the server function's stable key (its export or variable name, e.g. `greetUser`) as `functionName`, instead of the generated handler name (`greetUser_createServerFn_handler`). Custom generators keyed on the old names must be updated.
- Default production ids are shorter (22 characters).
- Server functions are recognised by binding through re-exports, namespaces, aliases, user factories and stored builders, whatever the code formatting (#7280). With SSR as the provider a server function's module evaluates once and server-side callers call it directly (#7213, #8731); the modules only its handlers import still load on the first call, like before, without running the module's code again (a handler that writes state its module reads, or one in a module that awaits at its top level, loads with its module). `createServerOnlyFn(...)` passed to `.handler()` works (#8446). Nested server functions are hoisted on the server when safe.
- Client middleware sees only the server function's id during SSR, as in the browser.
- Vite `bundledDev`: lazy dependencies load, edits no longer crash the hot update, and SSR reflects edits (#8407, #8062, #7535).

**Import protection**

- A denied import is replaced by a mock module of its own that exports the target's names. Build violations are decided after tree-shaking; when `onViolation` returns `false` the import gets the real module and the build reruns until no new import is allowed.
- Exempt importers (`ignoreImporters`, `exclude`, `include`) get the real module; dependencies that mark themselves server-only follow `excludeFiles`; `.vue` and `.mdx` importers are checked on their compiled output; a client entry marked server-only fails the build.
- Reports show the import in the original source with a code frame, and traces follow the bundler graph. In dev, a denied import added by an edit is reported.
- Rsbuild: works with Rspack's persistent cache (`performance.buildCache`).

**Rsbuild**

- Server-only routes are pruned from the client route tree (#8545); the client manifest lists only the chunks a route loads (#8780).
- Dev answers the SPA shell with `spa.enabled` (#8543) and no longer forces `server.compress: false` (#8544).
- The server environment shares async chunks instead of duplicating the route modules the server function resolver imports.
- `router.codeSplittingOptions.deleteNodes` applies to the server environment, as on Vite: the listed route options are removed from the server build's route modules (they were kept). The client keeps removing `ssr`, `server` and `headers` instead.
- `rsbuild build --watch` picks up route files created while it watches: they never reached the route tree before.

**Other**

- Dev compiler state stays bounded by the live modules (Vite and Rsbuild): deleted, renamed or no longer imported files leave no plans, raw facts or import-protection records behind.
- Editing the imports of a route module no longer fully reloads the page.
- Generator plugins given as `router.plugins` run next to Start's (#7768); Start's route tree footer follows `quoteStyle` and `semicolons`.
- Solid Start server environments split route components like the client, so hydration keys agree.
- Require `exsolve` `^1.1.3`, so memory no longer grows across builds in one process. Entry lookups bypass its process-wide cache, so an entry file created after a dev server restart is found.
- The plugins load the router-core helpers they need from the new `@tanstack/router-core/tooling` entry instead of the router runtime.

**Removed (experimental, Babel-typed):** the `compilerTransforms` and `serverFnProviderModuleDirectives` options and the `StartCompilerPlugin`, `StartCompilerImportTransform`, `StartCompilerTransformContext` and `StartCompilerTransformCandidate` types. RSC integrations pass `rsc: { loadCssExpression, providerDirective }` instead.
