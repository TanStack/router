---
'@tanstack/router-plugin': minor
---

Route code splitting and route HMR run on the new compiler core instead of Babel: faster dev startup, HMR and builds, with the same production output shape.

**What changes for your app when you upgrade:**

- **Vite 6 or later is required** (the `vite` peer range is now `>=6`): the plugin is tested on Vite 6, 7 and 8; Vite 5 is no longer supported.
- **esbuild refuses `autoCodeSplitting: true`** with a clear error (route generation still works there); use Vite, Rspack or webpack for code splitting.
- **CommonJS consumers need Node 20.19+ or 22.12+** (`engines`): a `webpack.config.js` / `rspack.config.js` that `require()`s the plugin loads the ESM-only parser through `require(esm)`, which Node 22.0–22.11 and 21 do not support.
- **Routes the compiler cannot read statically stay unsplit with one warning per file per build** naming the file: route options built by a helper call (`createFileRoute('/x')(makeOptions())`), options that spread or compute, methods that read `this`, and route modules the compiler cannot parse. Main split some of these silently or crashed.
- **`routeTree.gen.ts` formatting changes once** (`enableRouteTreeFormatting` now defaults to `false`; see the route generator's changeset).
- **Removed:** `codeSplittingOptions.compilerPlugins` (the experimental Babel hook).

- Any route option value splits: identifiers, inline functions, method shorthands (#8623), object-form loaders (#8753), casts, `satisfies`, calls such as `memo(Page)`, and options held in a module-level constant. Module state the route module and its chunks share exists once (#8754, #8505).
- **Exported route components and helpers are split too.** An exported pure function, class or component only split code needs leaves the route module: in a build it moves to a small side-effect-free module of its own that the route module re-exports (one instance for every other module importing it from the route file; the bundler drops it when nobody does), and each split chunk carries its own copy, so the chunk never depends on where the bundler places that module (Rolldown < 1.1.5 and a `manualChunks` group merging into the entry kept it eager). In dev the binding stays in the route module and the chunk copies it the same way. An importer of the route file and the route's chunk therefore hold two instances of such a stateless binding (as on main); state, effects and augmented bindings (`Page.displayName = …`) are never copied. Exported bindings that must stay in the route module (side effects, reassignment, read by the route module itself) and extracted modules an entry chunk loads anyway (another module imports the binding through the route file) are each reported once per file, in dev and in builds, on every bundler.
- `createFileRoute` & co. are recognised by their import binding. Routes whose options cannot be read statically, and methods or function expressions that read `this` (#8688), stay in the route module with one warning naming the file.
- Route HMR keeps split components' lazy wrappers across updates in React, Solid and Vue, refreshes edits of split loaders and other non-component options on Rspack and webpack, and needs no framework plugin for `.ts` route modules.
- Production output is decided by the bundler's mode and is identical with `addHmr: false`.
- Rspack and webpack use the plugin's own loader: source maps compose with earlier loaders and name the route file (#6667, #3828); project paths with `'`, `#` or spaces work (#7754). Rspack/webpack no longer rebuild every environment once after the first watch build.
- esbuild refuses `autoCodeSplitting` with a clear error; the route generator keeps working there.
- Removed: `codeSplittingOptions.compilerPlugins` (the experimental Babel hook), the `@babel/*` dependencies and the direct `chokidar` dependency (the route generator's watcher brings it). New entry `@tanstack/router-plugin/planners` exposes the route planners to TanStack Start.
