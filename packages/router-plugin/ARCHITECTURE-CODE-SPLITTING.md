# Automatic code splitting and route HMR: architecture

Internal notes for maintainers. Code splitting and route HMR are the two parts of one planner on the shared compiler
core; read the
[core README](../router-utils/src/compiler/README.md) first (units, rewrite tree, reachability, emit, caches).

## Files

- `src/hosts/`: the bundler hosts. `vite.ts` (native Vite plugin), `webpack.ts` + `loader.ts` (Rspack and webpack,
  the plugin's own loader), `session.ts` (one compiler session per plugin instance: caches, route registry view,
  planner configuration per environment). `src/esbuild.ts` runs the generator only and throws on
  `autoCodeSplitting`.
- `src/planners/`: `route.ts` reads the route of a file the generator lists, as the generator reads it
  (`routeCallOf` of `@tanstack/router-generator`: `export const Route = createFileRoute(…)({…})` and the other
  constructors of the configured framework's router package, by import binding, for the entry's kind; a file the
  generator does not list, or one it still repairs, is left as written) and reads its options; `decisions.ts` turns `codeSplittingOptions` and the route's
  options into split groups, `deleteNodes` and not-split reasons; `router.ts` is the `router` planner: per planning
  round one recognition and one decision table (`RouterRound`), read by its split part (`split.ts`) and its route HMR
  part (`hmr.ts`: hoists before the split, the dev block and the refresh markers after it); `config.ts` builds its
  configuration per environment from `codeSplittingOptions` (`routerPlannerConfigFrom`, the router plugin's rules or
  Start's); `registry.ts` maps route files to generator ids (by real path, so symlinks work). `index.ts` is the
  `@tanstack/router-plugin/planners` entry that Start's hosts compose with their own planners.
- Runtime (dev only): `router-core/src/hmr.ts` and `{react,solid,vue}-router/src/hmr.ts`, published as `/hmr`
  subpaths. `lazyRouteComponent` keeps its wrapper identity across updates.

## Outputs of one route file

For `posts.tsx` in a client environment:

| id                                    | contents                                                                                                                                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `posts.tsx`                           | the route module: `Route` with each split option replaced by `lazyRouteComponent`/`lazyFn` of `() => import(…)` (a const when several options read the group), and whatever the route module itself still reads |
| `posts.tsx?tsr-split=component`       | one chunk per split group (group key: sorted option names joined by `---`, e.g. `component---loader`) exporting the option's value                                                                              |
| `posts.tsx?tsr-split=shared---<keys>` | the names main shares (main's `?tsr-shared=1`; keys: the file's split groups, sorted), which the route module and the chunks import, one per file                                                               |

The ids and the specifiers importing them (the route file's absolute path) keep the format of the Babel splitter,
which apps' chunk naming reads; `router-utils/src/compiler/identity.ts` owns it (core README, "Hosts").

All of them come from one plan: whichever id the bundler asks first computes the plan, the others reuse it. A route
file is placed as route splitting on main places it (R153; `router-utils/src/compiler/placement.ts`, core README
"The one placement"): the route module keeps its statements and exports and what they reach (R154); a chunk imports
from it what main imports (`Route`, `export const|let|var`, `decisions.ts` `chunkImportsOnMain`) and copies the rest,
with the statements that read or write it (an `export default <expression>` among them) and the classes, enums and
namespaces naming it, as main does, comments and annotations included; a declaration the source never reads stays in
the route module only (a decided improvement over main, which copies it into the chunks too); a binding only one chunk
needs moves into it with its initialiser, and
the names main shares (`sharedNamesOnMain`: two options read them, a staying one included) go to the shared module,
which the route module and the chunks import, as main's `?tsr-shared=1`.

## Splitting rules

- Split keys: `component`, `errorComponent`, `pendingComponent`, `notFoundComponent`, `loader`. Default groups:
  `[['component'], ['errorComponent'], ['notFoundComponent']]`. No option of a root route is split: its components
  render on every page, or on error and not-found responses, where a lazy chunk only adds a round trip.
- The options main splits are split (`decisions.ts`): plain properties (`key: value`, `{ key }`) whose value is not
  `true`/`false`/`null`/`undefined`, and methods, as the function expression with their body (#8623; the chunk
  declares `function (…) {…}`, an edit of the property writes `key: ` before the placeholder). Accessors, spreads and
  computed keys stay as written. A function expression or method using its own `this` or `super` (`ownThisOf`, the
  language's scoping) stays in the route module as written, since splitting can change what `this` refers to, and the
  build warns at the property; route HMR does not hoist such a method either (as a function expression its `super`
  is a syntax error) (#8688).
- An option whose value is a bare identifier the route file exports by its declaration (`export function`, `export
const|let|var`, `export default function`, `export default <name>`; main's `hasExport`) stays in the route module,
  and the build warns once, naming the file and the exports (main's warning). `Page as any` is split.
- Values main cannot compile into a chunk stay in the route module, silently (`splitOnMain`, the cases of main's
  `compileCodeSplitVirtualRoute`: a member access, `satisfies`, `!`, a class, a namespace member, a global, an array
  pattern, a sequence, an object other than an object-form loader (below), a call holding JSX or TypeScript
  syntax). A function with overload signatures is one
  function. An option whose chunk would assign a binding it imports stays too, and so does one whose chunk
  would assign its copy of a binding another chunk copies (two variables otherwise; `main` fails the build there,
  or has the two variables when the option only assigns it) (`assignsWhatItImports`: a core fallback, the core re-plans with it kept in
  place).
- A `loader` written as an object literal (`loader: { handler, staleReloadMode }`, parentheses and TypeScript
  wrappers around it allowed; #8753, R171) splits its `handler` in its place (`objectLoaderOf`, `loaderHandlerOf`):
  the object's last `handler`, a plain property, a shorthand or a method, when no spread or computed key of unknown
  name follows it. That value goes through every rule above, as a function-valued loader's would (same group, chunk,
  copies, warnings); the object and its other keys stay in the route module, where the router reads them when the
  route loads, and count as staying for the shared names. Any other object loader stays as written: no `handler`, a
  getter, a spread or unknown computed key after it, or an object the route names (`loader: loaderObject`). An
  imported binding holding a loader object can't be told from an imported function: it splits whole, as on main, and
  the router then calls the object.
- Routes whose options object cannot be read statically (imported from another module, built by a call) are not
  split; with `deleteNodes` the build warns that server code in them ships.
- `deleteNodes` removes options (every property form) from the env output and what only they imported.
- Route CSS (`import './x.css'` and other bare style imports) stays in the route module, which the route tree imports
  eagerly, whether or not the route's components are split (fully lazy route CSS needs a router-core asset loader).

## Route HMR

- Dev client only, decided by the bundler's mode; production output is identical to `addHmr: false`.
- The route module gets a literal `import.meta.hot.accept(` (Vite) or `import.meta.webpackHot.accept()` block that
  calls the framework's `__tsrRouteHmr` from `/hmr` with the new `Route`. The runtime updates the live route in place
  (only the route this module exported), re-imports split chunks on every update, and decides once the import
  completes whether the framework's refresh runtime keeps the held component or the lazy wrapper swaps.
- Split chunks of non-component options (the `loader`) on Rspack/webpack call `__tsrRouteChunkHmr` and do not accept
  themselves, so the update bubbles to their importer: the route module, whose evaluation refreshes the route (the
  chunk the refreshed loader re-imports is only recorded), or Rspack's lazy-compilation proxy, which re-resolves the
  chunk alone, whose evaluation then refreshes the route. Non-component split exports are lowercase so React Refresh
  does not treat the chunk as a boundary.
- On Rspack/webpack the route module's update holds no module whose text did not change, so a module of the file that
  imports a binding the route module keeps (other than `Route`) would go on reading its earlier evaluation. Each such
  module (placement decides which: the `env-readers` home of a generated unit) calls `__tsrKeptReaderHmr` with its hot
  handle; the route module's next evaluation invalidates them and refreshes the route once the update is applied.
  Vite's update holds every module of the edited file. A module outside the file that imports such a binding stays
  stale (KNOWN-BUGS).
- React Refresh names: components the planner hoists or renames (inline, lowercase, `memo(...)`, `forwardRef(...)`,
  method shorthands) get stable registration names inside the plan, not in a post-pass.
- Vite bundled dev: when re-importing a chunk throws Rolldown's `MissingFactoryError` (rolldown#11300), the route HMR
  runtime (router-core `hmr.ts`) loads it through the held lazy wrapper's original importer.

## Testing

Behaviour only, through the public plugins (see [AGENTS.md](AGENTS.md)): `tests/route-app.ts` (`loadRoute`, a real
dev server and page), `tests/build-harness.ts` (real builds per bundler), `tests/route-hmr-page.ts`
(`openRouteHmrPage`). The oracle's SPEC sections J2 (splitting) and J3 (route HMR) are the contract.
