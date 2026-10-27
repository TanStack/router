# Compiler core (`@tanstack/router-utils/compiler`)

The shared compiler behind route code splitting and route HMR (`@tanstack/router-plugin`) and every TanStack Start
transform (`@tanstack/start-plugin-core`: server functions, environment separation, `<Hydrate>`, RSC CSS, import
protection). It is built on [Yuku](https://github.com/yuku-toolchain/yuku) (parser + semantic model). The route
generator (`@tanstack/router-generator`) uses Yuku directly and does not go through this core.

This file is the map. The contract the compilers must satisfy is the oracle's
[SPEC](../../../compiler-test-utils/oracle/SPEC.md); the toy planners and the in-memory host in
[`tests/helpers.ts`](../../tests/helpers.ts) show every interface below in use.

## The model

**One analysis per (environment, module, input text), one plan, many outputs.** A module is parsed once with
Yuku's semantic model. Every job is a _planner_ that reads that analysis and adds to one shared plan; no job
re-parses, re-prints or reads another job's output. The plan yields:

- the env module (the code returned for the requested id),
- every derived module of the same source in that env: split chunks (`?tsr-split=…`), lazy shared modules,
  extracted exports (`?tsr-split=export~Name`), Hydrate chunks (`?tss-hydrate=…`), server-function provider modules
  (`?tss-serverfn-split`), server-function handler modules (`?tss-serverfn-handler`),
- facts: surviving import edges (import protection), server-function registry entries, diagnostics, file
  dependencies, per-planner data.

Any id of a file may arrive first: a derived id computes (or reuses) the plan of its file at the same revision and
emits its own output. Nothing depends on transform order.

### Units, regions, edits

- **Units** (`units.ts`): the top level split into the smallest things placement reasons about: one import specifier,
  one declarator, one function/class/enum/namespace (merged declarations together), one export specifier, every other
  statement. **Regions** are ranges planned as one thing; every unit is one, and planners register sub-regions
  (route option values, Hydrate children, nested server-fn chains).
- **Rewrite tree** (`rewrite.ts`): planners emit edits against _original_ UTF-16 ranges: remove, replace with
  fragments, insert. Fragments are retained original slices (rendered with their own nested edits), structured text
  with symbol references (`SymRef`), glue specifiers and context-aware reference rewrites (shorthand properties
  expand, export names stay). A _generated unit_ can claim a region: the region renders inside its owner, wherever the
  owner is placed, and a placeholder renders at the original position. Edits nest, so a range moved into a chunk
  carries the env edits inside it.
- **Generated code declares its reads** (`SymRef`s); nothing is re-parsed to find them. Names come from one
  allocator per file over every name in every scope (`names.ts`), so a name means the same thing in every output.

### Reachability = splitting = dead-code removal (`reach.ts`)

Per output: roots → closure over _live_ value references (not inside removed ranges; type positions never keep
anything alive) at cluster granularity (a binding with all its writers and augmentations travels together) → the
units that output contains. The same computation decides:

- **placement**: a cluster only one split group needs goes to that chunk; one the route module needs stays there and
  chunks import it; one several groups need goes to a lazy shared module; copyable primitives and import specifiers
  are duplicated;
- **dead code, by provenance**: a declaration is removed only if _our_ edits orphaned it (its readers disappeared
  because a planner removed or moved them). Code already unreferenced in the source keeps running;
- **effects**: expression statements and impure, still-referenced declarations are effect roots of the env module,
  never duplicated or lost; an effectful cluster may move with its only needer under strict conditions (unexported,
  no surviving later effect, …). When a split would break single-writer or evaluation-order rules, the core reports a
  _fallback_ and `compileModule` re-runs the planners once more with that region kept in place (at most 3 rounds).

### Emit and source maps (`emit.ts`, `output-builder.ts`)

Each output is a flat recipe of original slices and generated text, rendered by our `OutputBuilder` straight into a
v3 source map. User code is never re-printed: comments, escapes and directives survive, and segments start at every
word and punctuator of copied text, so positions in every output (derived modules included) map to the user's
line:column. Lines follow every ECMAScript line terminator. Hosts compose the map with the bundler's input map. The
header (hashbang, pragmas, license, directives) is handled by `header.ts`; derived outputs copy pragmas and
directives, never license comments.

### Values and summaries (`values.ts`, `summary.ts`, `resolve.ts`, `facts.ts`)

- Recognition is by binding identity, never by name: an abstract value domain over bindings (factory, builder with
  links, isomorphic fn, namespace, function returns, unknown, plus symbolic `importRef`/`member`/`call` terms) with a
  pluggable `RecognizerTable` (Start supplies its kinds; the core ships none).
- Across modules, **summaries**: the export table and the abstract values of exports, computed from the module's
  _raw_ text (filesystem read or exact-id virtual load, never the bundler's transform pipeline), environment-
  independent, holding no AST. `ExportResolver` follows re-export chains over summaries. Known TanStack packages are
  recognised by specifier and never resolved.
- `RawFactsCache` owns the raw text per canonical id and serves summaries and import-protection _target facts_
  (marker, export names, effect classification, evaluation and lazy imports) from one read.

## Pipeline (`pipeline.ts` `compileModule`)

| phase | what                                                                                                                                                                                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | identify (canonical id = host id minus compiler-owned query keys), validated plan-cache lookup, parse, Tier 0 analysis (imports/exports/edges/effects), each planner's `gate`, async `prefetch` (resolutions, summaries, target facts; may withdraw the planner) |
| B     | synchronous `prepare`/`plan` of every planner on an `AnalysisPlan`, `resolve()` (claims, clusters, roots, homes, glue, per-output edges), `freeze()` into a plain-data `EmitPlan`                                                                                |
| C     | per-output edge `policy` (import protection substitutes specifiers), snapshot validation of every dependency, publication to the cache                                                                                                                           |
| D     | emission of the requested output, on demand                                                                                                                                                                                                                      |

Tier 1 (units, symbols, classified references) is built only when a planner needs it. Phase C restarts the compile
(up to 3 attempts) when a dependency changed underneath it; a compile overtaken by a newer revision of its own file is
returned but not published.

## Caches and invalidation (`cache.ts`, `host.ts`)

- `PlanCache`: one plan per (env, file), the latest revision only. A hit is _validated_ (same canonical identity,
  input hash, config/env digest, and every dependency fingerprint still current). Live keys (published, or with an
  attempt active) are indexed by path, so `invalidate()` finds a changed file's plans without scanning.
- `DependencyLedger`: dependencies are recorded as facts are acquired (resolutions, summary digests, target facts,
  route registry digests, failed resolutions), and a `DependentsIndex` maps them back to plans.
- `invalidate(caches, change, hosts)` is **the** invalidation operation: hosts call it per file change/add/unlink; it
  evicts the file's plans in every env, marks its raw facts stale, re-validates dependents' fingerprints with each
  environment's own resolver (add/unlink also retry failed resolutions) and returns `{ evicted, dependents }`, which
  the host hard-invalidates in the bundler. A summary change invalidates importers only when its export-facts digest changed.
- `releaseEnvironment(caches, env)` is the end of an environment's lifetime: a production build releases an
  environment's plans as soon as that environment's build is finished (several environments build one after the
  other in one process). Raw facts are shared by the environments and stay.
- Not cached: resolutions (storing them cost more than it saved; each compile records its answers in its ledger; validation asks the environment's
  resolver again only once a file appeared or disappeared since the plan's resolutions were validated,
  `CompilerCaches.fileSetVersion`) and emitted outputs (emission from a frozen recipe costs microseconds).
- Invariants: no Yuku object is reachable from any cache (`tests/heap.test.ts`); every cache is bounded by the live
  module set; derived outputs are pure functions of (env, source, config, summaries).

## Hosts

| host                     | where                                                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router, Vite             | `router-plugin/src/hosts/vite.ts` (+ `session.ts`): native plugin, hook filters, `load` for derived ids, `hotUpdate` invalidation                                                                                    |
| Router, Rspack / webpack | `router-plugin/src/hosts/webpack.ts`, `loader.ts`: the plugin's own loader (composes input maps, `addDependency`)                                                                                                    |
| Router, esbuild          | `router-plugin/src/esbuild.ts`: generator only; `autoCodeSplitting` throws                                                                                                                                           |
| Start, Vite              | `start-plugin-core/src/vite/compiler-plugin.ts` (+ `planning.ts`, `bundled-dev.ts`): Start and router planners in one compile per module and env                                                                     |
| Start, Rsbuild           | `start-plugin-core/src/rsbuild/` ([COMPILER_ARCHITECTURE.md](../../../start-plugin-core/src/rsbuild/COMPILER_ARCHITECTURE.md)): Rspack loaders per env/layer, facts in `buildInfo` replayed for the persistent cache |

Hosts decide dev/build from the bundler's mode, never from `process.env.NODE_ENV` at plugin creation.

## Planners

Fixed order per env (an array the host passes): `start-env` → `hydrate` → `rsc-css` → `route-hmr` (prepare) →
`route-split` → `route-hmr` (plan) → `import-edges`. The router plugin alone runs only the two router planners.

| planner        | job                                                                   | file                                                                                                                |
| -------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `route-split`  | route option splitting, `deleteNodes`                                 | `router-plugin/src/planners/split.ts` (recognition `route.ts`, decisions `decisions.ts`, registry `registry.ts`)    |
| `route-hmr`    | route HMR block, React Refresh registration names                     | `router-plugin/src/planners/hmr.ts`; runtime in `router-core/src/hmr.ts` and `{react,solid,vue}-router/src/hmr.ts`  |
| `start-env`    | server functions, middleware, isomorphic/env-only fns, `<ClientOnly>` | `start-plugin-core/src/planners/start-env.ts`; recognition `src/compiler/`; ids/registry/resolver `src/server-fns/` |
| `hydrate`      | `<Hydrate>` extraction into chunks                                    | `start-plugin-core/src/planners/hydrate.ts`                                                                         |
| `rsc-css`      | RSC CSS injection in the provider env                                 | `start-plugin-core/src/planners/rsc-css.ts`                                                                         |
| `import-edges` | import protection: per-output edges, mock substitution (policy phase) | `start-plugin-core/src/planners/edges.ts`; rules, verdicts, reports `src/import-protection/`                        |

Composition: `startPlanners()` in `start-plugin-core/src/planners/index.ts`; router planners are exported from
`@tanstack/router-plugin/planners`.

### Adding a planner

1. Implement `Planner` (`host.ts`): `name`, `tier` (0 if you only need import/export tables), a cheap `gate`, an
   optional async `prefetch` (everything cross-module happens here and is recorded as a dependency; resolve to
   `false` to withdraw), `plan(ctx)` (synchronous: register regions, emit edits, `declareOutput`/`addRoot` for
   derived modules, `setFacts`, `diagnostic`), and an optional per-output `policy`.
2. Never walk the whole AST when a semantic query from the import table or a binding's references answers the
   question; never keep a Yuku node beyond `plan()`; facts must be JSON data.
3. Slot it into the host's planner array at its fixed position; read its config through `ctx.config`.
4. Add core unit tests with a toy planner if the core needs a new capability (and keep the invariants above), and
   oracle tests through the public plugins for the behaviour.

## Testing

- Core unit tests: `packages/router-utils/tests/` (`pipeline`, `placement`, `rewrite`, `output-builder`, `values`,
  `facts`, `edges`, `identity`, `heap`), driven by toy planners and a `MemoryHost` (`helpers.ts`). Run
  `@tanstack/router-utils:test:unit`.
- Behaviour: the oracle in `packages/compiler-test-utils/oracle/` ([README](../../../compiler-test-utils/oracle/README.md),
  [SPEC](../../../compiler-test-utils/oracle/SPEC.md), [KNOWN-BUGS](../../../compiler-test-utils/oracle/KNOWN-BUGS.md)):
  `test:unit` and `test:integration` of router-generator, router-plugin, start-plugin-core and react-start-rsc. Real
  bundlers, dev servers and browsers, public entry points only, no output snapshots. Known bugs are `.fails` pins;
  `COMPILER_TESTS_PINS=run` runs them as ordinary tests. Harness rules: [AGENTS.md](../../../compiler-test-utils/AGENTS.md).
- Planner-level tests: `start-plugin-core/tests/planners/` (with a memory host) and the router-plugin unit tier.

## Debugging knobs

Environment variables read by the bundler's Node process (never by a bundle). They are diagnostics, not a supported
API: names and output may change. Unset, they cost one `process.env` read when a cache or session is created and
nothing per compile.

- `TSR_COMPILER_NO_CACHE=<list>`: disables caches, comma-separated: `plans` (no plan is published, every request
  compiles again), `facts` (every raw-facts read of a file re-reads and re-analyses it), `targets` (target facts of
  imported modules are rebuilt on every read), or `all`. Output must be identical with any combination; only speed
  changes. Use it on a report of stale or wrong output after an edit (HMR serving old code, a split that ignores a
  changed dependency, a dev/build mismatch): if `all` fixes it, an invalidation is missing; bisect with the single
  names to find the cache, then reproduce in `tests/cache.test.ts` or `tests/pipeline.test.ts`.
- `TSR_COMPILER_STATS=1`: every cache owner (the compiler caches, the router and Start host sessions with their
  import-protection and server-function state, the route generator) registers a reader of its entry counts and
  approximate bytes in a process-global registry, held through a `WeakRef` so it retains nothing. Read it in the same
  process with `compilerStats()` from `@tanstack/router-utils/compiler` (e.g. a temporary
  `setInterval(() => console.log(compilerStats()), 10_000)` in the bundler config); the raw registry is
  `globalThis[Symbol.for('tanstack.compiler.stats')]` when the package is not importable from the app. Use it on a
  report of dev-server memory growth: counts that grow with edits rather than with the module set point at the leaking
  cache. `TSR_COMPILER_STATS_BYTES=0` skips the byte estimates (structured-clone sizes, slow on large caches).

## Performance and bytes

- Compiler perf harness: [`benchmarks/compiler-perf/`](../../../../benchmarks/compiler-perf/README.md): generated
  338-route Start/Router apps (React and Solid), dev startup, compile-all, HMR, builds, the _floor_ (compiler outputs
  replayed) and memory/leak checks.
- Client bytes: `pnpm benchmark:bundle-size:run` (18 scenarios); server bytes and cold start:
  `scripts/benchmarks/bundle-size/server.mjs`. Client production bytes must not grow.
- Rules: semantic queries over full-AST walks, cheap gates before parsing, no worker pool, `yuku` pinned to an exact
  version, every cache bounded and invalidated.
