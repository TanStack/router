---
'@tanstack/router-plugin': minor
---

Route code splitting and route HMR run on the new compiler core instead of Babel: faster dev startup, HMR and builds, with the same production output shape.

- Any route option value splits: identifiers, inline functions, method shorthands (#8623), object-form loaders (#8753), casts, `satisfies`, calls such as `memo(Page)`, and options held in a module-level constant. Module state the route module and its chunks share exists once (#8754, #8505). Root routes split their `errorComponent` and `notFoundComponent`.
- `createFileRoute` & co. are recognised by their import binding. Routes whose options cannot be read statically, and methods or function expressions that read `this` (#8688), stay in the route module with one warning naming the file.
- A route's CSS import loads with its split component chunks when every component option the route defines is split; otherwise it stays in the route module.
- Route HMR keeps split components' lazy wrappers across updates in React, Solid and Vue, refreshes edits of split loaders and other non-component options on Rspack and webpack, and needs no framework plugin for `.ts` route modules.
- Production output is decided by the bundler's mode and is identical with `addHmr: false`.
- Rspack and webpack use the plugin's own loader: source maps compose with earlier loaders and name the route file (#6667, #3828); project paths with `'`, `#` or spaces work (#7754). Rspack/webpack no longer rebuild every environment once after the first watch build.
- esbuild refuses `autoCodeSplitting` with a clear error; the route generator keeps working there.
- Removed: `codeSplittingOptions.compilerPlugins` (the experimental Babel hook) and the `@babel/*` dependencies. New entry `@tanstack/router-plugin/planners` exposes the route planners to TanStack Start.
