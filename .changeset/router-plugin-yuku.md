---
'@tanstack/router-plugin': minor
---

Route code splitting and route HMR run on the new compiler core instead of Babel: faster dev startup, HMR and builds, with the same production output shape.

**What changes for your app when you upgrade:**

- **Routes the compiler cannot read statically stay unsplit**: route options built by a helper call (`createFileRoute('/x')(makeOptions())`), imported from another module or written to after their declaration. What a spread or a computed key holds isn't split either (the options written next to it still are).
- **With `deleteNodes` set (as in every TanStack Start client build), options the compiler can't read build and warn**, naming the file: a listed option they hold isn't removed, so the code it reads stays in the output. A listed option written next to a spread is still removed.
- **`codeSplittingOptions.deleteNodes` applies with `autoCodeSplitting: false` too**: the listed options are removed from the route files in dev and builds. Before, only the code splitter read `deleteNodes`, so it did nothing without `autoCodeSplitting`.
- **A route module that does not parse fails a build** naming the file; a dev server warns and leaves the module as it is.
- **`routeTree.gen.ts` formatting changes** (`enableRouteTreeFormatting` now defaults to `false`): once if your formatter ignores the file, as the installation guides recommend; see the route generator's changeset otherwise.

- Route code splitting keeps the Babel splitter's rules (see the route-splitting changeset).
- **Options removed by `codeSplittingOptions.deleteNodes`** (in every TanStack Start client build: `server`, `ssr`, `headers`) take what only they read out of every output of the route file, split chunks included: a default value in a destructuring declaration that a split component also reads (`const { title, secret = readSecret() } = …`, `secret` read only by a server handler) no longer brings its server-only import into a client chunk, nor does it next to a rest element (`const { secret = readSecret(), ...rest } = …` keeps `secret` without its default, so the key stays out of `rest`); main kept them in the route's shared chunk.
- `createFileRoute` & co. are recognised by their import binding.
- Route HMR keeps split components' lazy wrappers across updates in React, Solid and Vue and refreshes edits of split loaders and other non-component options on Rspack and webpack.
- Production output is decided by the bundler's mode and is identical with `addHmr: false`.
- Rspack and webpack use the plugin's own loader: project paths with `'`, `#` or spaces work (#7754). Rspack/webpack no longer rebuild every environment once after the first watch build.
- Removed: the `@babel/*` dependencies and the direct `chokidar` dependency (the route generator's watcher brings it). `@babel/core` no longer comes with the plugin: if your app runs Babel itself (for example for the React Compiler), declare `@babel/core` in your own `devDependencies`. New entry `@tanstack/router-plugin/planners` exposes the route planners to TanStack Start.
