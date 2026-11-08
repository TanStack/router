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

- **Production builds answer HTTP calls only for server functions that some client module imports.** A function only server code calls, or one returned to the client as data, gets a 404 over HTTP. The dev server still answers and warns once per function, so this shows up only after deploying: check the dev warnings before you ship.
- **A module the compiler cannot parse fails the client build** with an error naming the file, instead of shipping untransformed (its server code included).
- **Route options the compiler cannot read statically build with a warning** naming the file: options built by a call, imported from another module or written to after their declaration (`createFileRoute('/x')(makeOptions())`), and a spread or computed key that may hold `ssr`, `server` or `headers`. The client build can't remove what they hold, so any server code in them ships to the client; main shipped it too, silently. Write those options as literal properties of the route options (a spread of a module-level object literal that holds none of them doesn't warn).
- **Exported route components and helpers split in Start apps too** (see the router plugin's changeset): each split chunk carries its own copy of an exported function whose closure is functions and primitives nothing writes and imports anything with an identity or state, importers of the route file share one instance, and both Start hosts (Vite and Rsbuild) warn after a client build when a module loaded with the entry imports such a binding through the route file.
- **`routeTree.gen.ts` formatting changes once**: `enableRouteTreeFormatting` now defaults to `false` and the tree is printed in your `quoteStyle` and `semicolons`; commit the one-time diff.
- **Removed (experimental, Babel-typed):** the `compilerTransforms` and `serverFnProviderModuleDirectives` options and the `StartCompilerPlugin`, `StartCompilerImportTransform`, `StartCompilerTransformContext` and `StartCompilerTransformCandidate` types. RSC integrations pass `rsc: { loadCssExpression, providerDirective }` instead.
- **`@babel/core` no longer comes with Start.** If your app runs Babel itself (for example for the React Compiler), declare `@babel/core` in your own `devDependencies`.

**Server functions**

- **Production builds answer HTTP calls only for server functions that client code imports.** A function only server code calls (another server function, a server route), or one returned to the client as data, is refused when called over HTTP. The dev server still answers such a call and warns once per function.
- Server function ids and the metadata the server bundle holds keep their formats: the default id (the SHA256 hex of the file and the function's name), the `functionName` a custom `serverFns.generateFunctionId` receives (`greetUser_createServerFn_handler`, then `_1`, `_2` for a name the file repeats), the resolver manifest's entries, `serverFnMeta.name` (the variable's name) and the quoting of each. Custom ids stay the same across the upgrade. Server functions that aren't declared as a variable, which the compiler now also supports, take the name they're assigned to (an object property, a class field), `default` for `export default`, and `fn` otherwise; a name that isn't an identifier (a string property key) has `_` for each character outside `A-Z`, `a-z`, `0-9`, `_` and `$`.
- When two server functions of different files get the same custom id, the `_1`, `_2` suffixes are numbered by file path (they followed compile order, so an unrelated import edit could swap two functions' ids); within a file they still follow source order, and client-referenced functions still come first.
- Server functions are recognised by binding through re-exports, namespaces, aliases, user factories and stored builders, whatever the code formatting (#7280). With SSR as the provider a server function's module evaluates once and server-side callers call it directly (#7213, #8731); the modules only its handlers import still load on the first call, like before, without running the module's code again (a handler that writes state its module reads, or one in a module that awaits at its top level, loads with its module). `createServerOnlyFn(...)` passed to `.handler()` works (#8446). Nested server functions are hoisted on the server when safe, also inside a route option `deleteNodes` removes from the server build (the client keeps the option and calls them).
- Client middleware sees only the server function's id during SSR, as in the browser.
- A server function defined in code the server erases (`createClientOnlyFn`, an isomorphic function's `.client()`, `<ClientOnly>` children) works: the server registers it.
- Vite `bundledDev`: lazy dependencies load, edits no longer crash the hot update, and SSR reflects edits (#8407, #8062, #7535).

**Import protection**

- A denied import is replaced by a mock module of its own that exports the target's names. Build violations are reported after tree-shaking, in one pass; `allowImport` gives an import the real module (see its changeset).
- Exempt importers (`ignoreImporters`, `exclude`, `include`) get the real module; dependencies that mark themselves server-only follow `excludeFiles`; `.vue` and `.mdx` importers are checked on their compiled output; a client entry marked server-only fails the build.
- Reports show the import in the original source with a code frame, and traces follow the bundler graph. In dev, a denied import added by an edit is reported.
- Rsbuild: works with Rspack's persistent cache (`performance.buildCache`).

**Rsbuild**

- Server-only routes are pruned from the client route tree (#8545).
- The server environment shares async chunks instead of duplicating the route modules the server function resolver imports.
- `rsbuild build --watch` picks up route files created while it watches: they never reached the route tree before.

**Other**

- Dev compiler state stays bounded by the live modules (Vite and Rsbuild): deleted, renamed or no longer imported files leave no plans, raw facts or import-protection records behind.
- Editing the imports of a route module no longer fully reloads the page.
- Start's route tree footer follows `quoteStyle` and `semicolons`.
- Solid Start server environments split route components like the client, so hydration keys agree.
- The plugins load the router-core helpers they need from the new `@tanstack/router-core/tooling` entry instead of the router runtime.

**Removed (experimental, Babel-typed):** the `compilerTransforms` and `serverFnProviderModuleDirectives` options and the `StartCompilerPlugin`, `StartCompilerImportTransform`, `StartCompilerTransformContext` and `StartCompilerTransformCandidate` types. RSC integrations pass `rsc: { loadCssExpression, providerDirective }` instead.
