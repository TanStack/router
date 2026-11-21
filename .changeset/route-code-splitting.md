---
'@tanstack/router-plugin': minor
'@tanstack/router-utils': patch
---

Route code splitting keeps its rules: the same options split, as your groupings say; root routes aren't split; code only one split option uses moves into its chunk, and what several options read is one shared module. An option whose value the route file exports stays in the route module, and the build warns once, naming the file and the exports. Top-level statements stay in the route module, and a declaration or import leaves it only when splitting made it unused.

**Now split:**

- Options written as methods: `component() {…}`, `loader() {…}`, `async loader() {…}` (#8623).
- The `handler` of a loader object written in the route options (`loader: { handler, staleReloadMode }`): the handler and what only it uses load with the loader's chunk, and the object with its other keys stays in the route module, where the router reads them (#8753). A loader object held by a local `const` stays whole in the route module. An object the compiler can't read in the route file (imported, returned by a call such as `Object.freeze(…)`, chosen by a condition) isn't supported when the loader is split: write the object in the route options.
- Route options named through several `const`s or a cast (`const options = base as any`): they're split, and the options `deleteNodes` lists are removed, as when written inline.

**Values that failed the build now stay in the route module and work:** a member access (`pages.Home`), `satisfies`, `!`, a class, a namespace member, an array-pattern binding, a sequence, a call holding JSX or TypeScript syntax (`memo(() => <p />)`; `memo(Page)` still splits), and an option whose chunk would assign a variable the route module or another chunk also uses (`count++` on a module `let` the `component` reads).

**Not split, with a warning:**

- A function or method that uses its own `this` or `super` (#8688): splitting changes what `this` refers to. Use an arrow function, or avoid `this`.
- A route file under `node_modules` (a `physical()` mount of an installed package, a routes package resolved with `resolve.preserveSymlinks`), on Vite, webpack and Rspack: the build or dev server warns once per file. A routes package of a pnpm or Yarn workspace resolves to its real path outside `node_modules` and is split.
- Route options the compiler can't read statically: options built by a call (`createFileRoute('/x')(makeOptions())`), imported, written to after their declaration, or used by other code of the file (`const z = options; z.server = …`, `export const defaults = options`), and what a spread or a computed key holds. The options written next to a spread or computed key still split, and a `deleteNodes` option written there is still removed. Under `deleteNodes` (every Start client build), the warning says the listed options it can't see aren't removed, so the code they read ships to the client: write them as literal properties of the route options.

**Other changes:**

- A declaration nothing used before splitting stays in the route module only and runs once (`const unused = register('x')`); split chunks no longer run it again. An import nothing uses (`import './polyfill'`, a stylesheet) runs once, with the route file.
- `codeSplittingOptions.deleteNodes` applies with `autoCodeSplitting: false` too: the listed options are removed from route files in dev and builds. It did nothing without `autoCodeSplitting`.
- Options removed by `deleteNodes` take what only they read out of every output of the route file, split chunks included: a destructuring default only a `server` handler reads (`const { title, secret = readSecret() } = …`) no longer brings its server-only import into a client chunk.
- Under `verbatimModuleSyntax`, a value import that only split code used in types is no longer loaded. Import a module you need for its side effects with `import './x'`.
- Production source maps name a split chunk's source by the route file's path, not `route.tsx?tsr-split=…`, so devtools show one file and error trackers group by it.
