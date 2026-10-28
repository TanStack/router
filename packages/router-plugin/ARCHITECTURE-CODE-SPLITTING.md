# Automatic code splitting and route HMR: architecture

Internal notes for maintainers. Code splitting and route HMR are two planners on the shared compiler core; read the
[core README](../router-utils/src/compiler/README.md) first (units, rewrite tree, reachability, emit, caches).

## Files

- `src/hosts/`: the bundler hosts. `vite.ts` (native Vite plugin), `webpack.ts` + `loader.ts` (Rspack and webpack,
  the plugin's own loader), `session.ts` (one compiler session per plugin instance: caches, route registry view,
  planner configuration per environment). `src/esbuild.ts` runs the generator only and throws on
  `autoCodeSplitting`.
- `src/planners/`: `route.ts` recognises the route (`export const Route = createFileRoute(…)({…})` and the other
  constructors, by import binding) and reads its options; `decisions.ts` turns `codeSplittingOptions` and the route's
  options into split groups, `deleteNodes` and not-split reasons; `split.ts` is the `route-split` planner; `hmr.ts` is
  the `route-hmr` planner; `registry.ts` maps route files to generator ids (by real path, so symlinks work);
  `round.ts` holds what both planners share in one planning round. `index.ts` is the `@tanstack/router-plugin/planners`
  entry that Start's hosts compose with their own planners.
- Runtime (dev only): `router-core/src/hmr.ts` and `{react,solid,vue}-router/src/hmr.ts`, published as `/hmr`
  subpaths. `lazyRouteComponent` keeps its wrapper identity across updates.

## Outputs of one route file

For `posts.tsx` in a client environment:

| id                                 | contents                                                                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `posts.tsx`                        | the route module: `Route` with each split option replaced by `lazyRouteComponent`/`lazyFn` of an importer const, and whatever the route module itself still reads |
| `posts.tsx?tsr-split=component`    | one chunk per split group (group key: sorted option names joined by `~`, e.g. `component~loader`) exporting the option's value                                    |
| `posts.tsx?tsr-split=shared~<a+b>` | code several chunks need and the route module does not (key: the needing groups joined by `+`), loaded lazily by those chunks                                     |
| `posts.tsx?tsr-split=export~Name`  | build only: an exported, pure, unwritten declaration that only chunks need; the route module re-exports it for other importers, the chunks carry their own copy   |

All of them come from one plan: whichever id the bundler asks first computes the plan, the others reuse it. Placement
is decided by the core from what each output reads; the planners only say which option values are roots of which
chunk. Module-level state therefore exists once: a binding the route module and a chunk both read stays in the route
module and the chunk imports it. An exported pure binding only chunks need is the one exception by rule (R77): its
extracted module serves other importers of the route file and is dropped when nobody imports it, while each chunk
copies the binding, so the chunk never depends on where the bundler places a module the route module re-exports
(Rolldown < 1.1.5 and a user `manualChunks` group merging into the entry made it eager). Importers of the route file
and the chunk then hold two instances of a stateless function; state, effects and augmented bindings are never
copied. In dev nothing is bundled: the binding stays in the route module and the chunk copies it the same way.

## Splitting rules

- Split keys: `component`, `errorComponent`, `pendingComponent`, `notFoundComponent`, `loader` (an object-form
  loader splits its `handler`). Default groups: `[['component'], ['errorComponent'], ['notFoundComponent']]`. The root
  route's `component` stays eager.
- Any value form splits: identifiers, inline functions, method shorthands, casts, `satisfies`, calls (`memo(Page)`),
  options held in a module-level constant.
- Not split, with one warning per file: routes whose options object cannot be read statically (imported from another
  module, built by a call), and methods/function expressions whose own body reads `this` (`not-split:this-reference`:
  the router calls them as methods; a lazy wrapper would call them detached). When the limitation is ours, it is a
  bug, not a warning.
- Single writer and evaluation order: a split that would make two outputs write one binding, or move a read of
  state something writes (an option value reading a binding a function assigns, or one written below it), is a core
  _fallback_; the option stays in the route module. The core re-plans with each fallback kept in place until no new
  one appears (keeping one option can free the next: a chain of writers); if that never settles, nothing of the route
  is split and one warning (`fallback-rounds-exhausted`) says so.
- `deleteNodes` removes options (every property form) from the env output and what only they imported.
- Route CSS (`import './x.css'` and other bare style imports) stays in the route module, which the route tree imports
  eagerly, whether or not the route's components are split (fully lazy route CSS needs a router-core asset loader).

## Route HMR

- Dev client only, decided by the bundler's mode; production output is identical to `addHmr: false`.
- The route module gets a literal `import.meta.hot.accept(` (Vite) or `import.meta.webpackHot.accept()` block that
  calls the framework's `__tsrRouteHmr` from `/hmr` with the new `Route`. The runtime updates the live route in place
  (only the route this module exported), re-imports split chunks on every update, and decides once the import
  completes whether the framework's refresh runtime keeps the held component or the lazy wrapper swaps.
- Split chunks of non-component options (`loader`, …) on Rspack/webpack call `__tsrRouteChunkHmr` and do not accept
  themselves, so the update bubbles to the route module. Non-component split exports are lowercase so React Refresh
  does not treat the chunk as a boundary.
- React Refresh names: components the planner hoists or renames (inline, lowercase, `memo(...)`, `forwardRef(...)`,
  method shorthands) get stable registration names inside the plan, not in a post-pass.
- Vite bundled dev: when re-importing a chunk throws Rolldown's `MissingFactoryError` (rolldown#11300), the lazy
  wrapper loads it through its original importer.

## Testing

Behaviour only, through the public plugins (see [AGENTS.md](AGENTS.md)): `tests/route-app.ts` (`loadRoute`, a real
dev server and page), `tests/build-harness.ts` (real builds per bundler), `tests/route-hmr-page.ts`
(`openRouteHmrPage`). The oracle's SPEC sections J2 (splitting) and J3 (route HMR) are the contract.
