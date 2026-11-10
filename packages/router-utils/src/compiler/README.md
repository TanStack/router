# Compiler core (`@tanstack/router-utils/compiler`)

The shared compiler behind route code splitting and route HMR (`@tanstack/router-plugin`) and every TanStack Start
transform (`@tanstack/start-plugin-core`: server functions, environment separation, `<Hydrate>`, RSC CSS, import
protection). It is built on [Yuku](https://github.com/yuku-toolchain/yuku) (parser + semantic model). The route
generator (`@tanstack/router-generator`) uses Yuku directly and does not go through this core.

This file is the map. The contract the compilers must satisfy is the oracle's
[SPEC](../../../compiler-test-utils/oracle/SPEC.md); the toy planners and the in-memory host in
[`tests/helpers.ts`](../../tests/helpers.ts) show every interface below in use.

## The model

**One analysis per (environment, module, input text), one plan, many outputs.** A compile parses its module once with
Yuku's semantic model (summaries are a separate read of the raw text: see "Values and summaries"). Every job is a _planner_ that reads that analysis and adds to one shared plan; no job
re-parses, re-prints or reads another job's output. The plan yields:

- the env module (the code returned for the requested id),
- every derived module of the same source in that env: split chunks (`?tsr-split=…`), lazy shared modules,
  extracted exports (`?tsr-split=export---Name`), Hydrate chunks (`?tss-hydrate=…`), server-function provider modules
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
  owner is placed, and a placeholder renders at the original position. An erasure enclosing the occurrence kills the
  claim and its owner, unless other generated code reads the owner (the provider's hoisted server fn its RPC wrapper
  calls): then only the placeholder goes. Edits nest, so a range moved into a chunk
  carries the env edits inside it; an edit addressed to every output on exactly a claimed region travels with the
  region (a server-only handler that is itself an isomorphic call is rewritten inside the handler module), while
  an edit scoped to one output on exactly the region replaces the placeholder there (the env module keeps a
  nested server-fn chain in place with its stub). A generated unit has a home (`auto`: placement decides; an output),
  or `env-readers`: placement copies it into every derived output importing a binding of the env module other than
  the ones it names, once inclusion is decided (route HMR registers the chunks reading what the route module keeps); it
  declares nothing, owns no claim and reads only its own imports.
- **One region tree per plan** (`RegionTable`, `rewrite.ts`): the module, every region and the range of every edit,
  shared by every output, so two ranges nest or are disjoint whatever outputs their edits are scoped to; a range that
  partly overlaps another is a conflict as it is registered. Each plan has its own (a fallback round starts again from
  the units). What an output renders of the source (`OutputView`: whether a byte renders, the claims the output keeps,
  its erased parts) is read on that tree by climbing from a position's innermost range, so a question costs the
  nesting depth, not the number of edits. The renderer reads the output's edits sorted and nested (`RenderTree`).
- **Copied text keeps its edits.** Every byte of original text that reaches an output gets there through exactly one
  path (the env module's own text, a retained slice, a claim's owner), and that path applies every edit of that
  output's tree under it; only edits under erased text are dropped. A claim's owner therefore copies exactly its
  claimed range (a cast around a split value stays around the placeholder). The renderer checks the rule where it
  copies text as is (`RenderTree.editUnderCopy`): a copy over an edit is a compiler bug, which throws with
  `TSR_COMPILER_VERIFY=1` and is an `internal-invariant` error in users' runs (it would ship the text the edit
  replaces). It is a safety net and can go once we trust the compiler's reliability.
- **An edit scoped to some outputs is absent from the others' trees**, so another output that copies its range
  copies the original text. An edit is scoped to one output only where no other output copies its range, or where
  what the others render there is right without it: the split's placeholder for an identifier value is the env
  module's own (`split.ts`; the chunk reads the binding), and Start's in-place stub of a nested server-fn chain
  overrides the claim's placeholder in the env module only, while a split chunk copying the enclosing function
  renders the placeholder (`start-env.ts`). The renderer cannot check this one (the edit is not in the copying
  output's tree): it is the planner's obligation.
- **Generated code declares its reads** (`SymRef`s); nothing is re-parsed to find them. Names come from one
  allocator per file over every name in every scope (`names.ts`), so a name means the same thing in every output.
  Glue export names avoid the module's export names; in a module with `export * from …`, whose re-exported names are
  unknown, they are the compiler's own (`tsr$x`). A planner can name a binding's glue export ahead
  (`glueExportName`: React route HMR lists them for plugin-react to ignore).

### Reachability = splitting = dead-code removal (`reach.ts`, `placement/`)

Per output: roots → closure over _live_ value references (not inside removed ranges; type positions never keep
anything alive) at cluster granularity (a binding with all its writers and augmentations travels together) → the
units that output contains. `computePlacement` composes seven stages, each a function of what the previous ones
produced: `clusters` (clusters, the write table, ordered evaluation), `reads` (what each cluster reads per output,
`reach`), `roots` (the roots planners and the module declare, extraction candidates, provenance), `settle` (the env
roots, the movable test and the extracted exports: one fixed point), `kept`, `homes` (homes, the single-writer
rule) and `inclusion` (what each output contains, imports and exports). The same computation decides:

- **placement**: a cluster only one split group needs goes to that chunk; one the route module needs stays there and
  chunks import it; one several groups need goes to a lazy shared module; copyable primitives and import specifiers
  are duplicated (a planner's generated import, such as a client stub's `createClientRpc`, is an import specifier
  too). An exported binding only split code needs leaves the route module for a side-effect-free extracted
  module (`?tsr-split=export---Name`) that the route module re-exports, so other modules importing it from the route
  file still get one instance and the route module keeps none of its code or imports. The rule for the route's own
  chunks: when a copy would be indistinguishable from the original, the chunk carries its own copy and never
  imports the extracted module. A copy carries the binding and what it reaches that no output keeps once, and
  every piece carried must be a function or a primitive constant nothing writes and whose identity nothing observes
  (`new`, `instanceof`, `===`, `switch`/`case`, `.prototype`; `isDuplicable`: types and imports
  are free; another export is imported from its module or copied under its own decision; an effectful cluster
  stays in the route module or moves, one instance). Anything with an identity in that closure (an object or array
  literal, a class, a `new`, a call result however pure, a regex, an enum) or any written binding (a `listeners`
  array behind `subscribe`/`emit`, a `let`) makes the export non-copyable: the chunk imports its extracted module,
  one instance, as an export with effects or state always did (an effectful initialiser, an assigned `let`, a
  reader of mutable state, an augmented binding: imported from the extracted module when only it needs it, else
  from the route module). A pure cluster with an identity, or a written one, that an extracted module and another
  output both need stays in the route module (one instance every output imports); a function or primitive in that
  position is copied into each. Writes inside code the environment erases impose nothing (the mutation model is
  read through the env output's liveness). Exports that read each other (`class Z { o() { return A } }` and `class A
extends Z`, directly or through what they carry) share the module of the first in the source: in two modules importing each other
  the one evaluated first depends on the bundler, and a read at evaluation can find the other uninitialised. Nothing but importers of the route file reach the extracted module of
  a copied export, so a bundler drops it when unused; a non-copied export's module is imported by the route's
  chunks too, and a bundler that places it with the entry (Rolldown < 1.1.5, a user `manualChunks` group that
  merges into the entry) loads the export eagerly: the build says so (`eager-exports.ts`). In dev nothing is
  bundled and the static re-export would only load the extracted module one request level deeper: the same
  clusters stay in the route module as written, and chunks copy or import them exactly as in a build, so state and
  identity agree between dev and a build. An exported declaration a chunk needs that stays in the route module
  (effects, reassigned, read by the route module, reading what it keeps, an effect keeping its order) is reported
  once per export with the reason (`eager-export:<reason>`), and so is an unexported declaration only split code
  needs that the movable rule below keeps (`eager-split:<reason>`: `order`, a surviving effect after it, named
  with its line and, in a recognised route call, its option; `needers`, several split outputs; `written`, changed
  outside its declaration at load; `state`, reading what the module writes; `reads`, reading an effectful or `let`
  binding the module keeps; `shared`, a value with an identity or state that an extracted export's module and other
  split code both read, one instance), once at the cause (a cluster kept only because another kept one reads it is not
  reported; `Placement.kept`, worded by `kept-diagnostics.ts` with the words the planners give their outputs and
  modules, deduped per file and wording by the hosts' ledgers); every
  host also warns after a client build when an extracted module landed in an entry chunk (another module imports
  the binding through the route file, or the bundler's chunk assignment put a module the route's chunks import with
  the entry);
- **dead code, by provenance**: a declaration or import specifier is removed only if _our_ edits orphaned it (its
  readers disappeared because a planner removed or moved them). Code already unreferenced in the source keeps
  running: an import nothing reads stays in the env module, so its module still evaluates there (a value import a
  route module uses only in type positions leaves it: TypeScript erases it anyway). Type units stay in the env module
  as written whatever their cluster (`import type { X }` next to a value `X` that moves stays whole and type-only),
  never in a derived output; only the TypeScript-only specifiers (an inline `type` specifier, an `export { X }` of a
  type-only binding) follow their statement's value specifiers (`importStays`). Below the units, function-local
  declarators and destructuring leaves only erased code read go too (`orphans.ts`), with their initialisers whatever
  they do (a call of a helper, a global's method), as main's dead-code elimination did; a hook call (`useX(…)`,
  `ns.useX(…)`) in a function stays as a statement with the import it reads, so every output calls the same hooks in
  the same order. The core runs that cleanup once after every planner, removing each in every output when edits
  addressed to every output orphaned it, else in the env module only. A module-level destructuring leaf stays while it is exported or another output takes it (one of
  its roots names it, or a claimed region reads it); a property a live rest element keeps (its key stays out of the
  rest) loses only its default value. The initialiser stays as written: a value in a destructured literal
  (`{ a, b } = { a: 1, b: f() }`) is not chased, so `b`'s value stays where `a` needs the declaration. A read the core
  synthesises from a
  name rather than from a reference (the classic runtime's JSX factory `React` when no pragma names the runtime, a
  Solid `use:` directive) binds only to a declaration with a runtime value (`valueBinding`):
  `import type * as React` is never the factory;
- **effects and mutable state**: expression statements and impure, still-referenced declarations are effect roots
  of the env module, never duplicated or lost. One model (`mutation.ts`, `t1.mutation`) holds every write of a
  binding (assignment or member write, eager or lazy, wherever it is), and one predicate answers every rule that
  asks about it: a read evaluated at module load _observes mutable state_ when something outside the reading
  cluster writes the binding after it, or at an unknown time (inside a function; and code that evaluates with
  the module but runs later: an async or generator function invoked where it is written, an instance field's
  initialiser, `t1.runsLaterAt`). "After it" compares positions where the code runs: a read inside a function
  the load calls runs where the first such call is (`runsAtLoad`), and for a cluster that may move, where it
  evaluates. What a cluster reads at load
  has one definition (`ClusterGraph.loadReads`): its eager reads, the reads inside any function a unit that
  calls something may run (a function it passes directly, `['x'].map((k) => n + k)`, or calls; not a method
  nested in an object argument, `defineComponent({ setup() {} })`), and those
  of the declarations such reads reach, transitively (`n++`, `n += 1` and `n = v` count as reads: a cluster
  whose load assigns state, `init()` writing `mode`, is ordered like one reading it); a claimed region's text
  evaluates where its owner lands, and an option value that calls something (`withPrefix(Page)`) reads what that
  call may run (`ordered-effect`). Outside the model (R97): a getter (`api.latest`, a destructured property),
  `toString`, a spread or an array pattern's iterator running user code, and writes through `this` or another
  module: the code they run is not seen to run at load.
  Such a reader never moves to a lazy output, pure or not (`const initial = [n]` next to `function inc() { n++ }`
  keeps the source's `[0]`); an option value that reads one is kept in place (`ordered-effect`). An effectful,
  unexported cluster moves with its only needer (lazy initialisation is allowed; within-module order is
  preserved) when nothing outside it writes it eagerly, it observes no mutable state, its reads at load are
  imports (read lazily: the chunk loads after the route module),
  pure clusters or `const`s the route module keeps, and no surviving effect after its first one stays behind. It
  never moves into an extracted export's module: that module is side-effect free (every bundler may skip it while
  nothing imports what it exports; the webpack-family hosts mark each one so), so an effect observable on its own
  stays in the route module, which the extracted module imports it from. What does move there (an export's
  augmentations) evaluates _before_ the route module's body, so no surviving effect may precede its last one (the
  extracted modules evaluate in source order among themselves). An exported binding whose only effects write
  what it declares with pure values (`Page.displayName = …`, static props: unobservable while nothing imports it, so
  its module stays droppable; `Page.x = track()` is an effect of its own and keeps it in the route module) leaves for
  its extracted module under the same rule: the augmentations travel with it, an
  earlier surviving effect pins it and a later one keeps its order (chunks import an augmented export: its
  augmentation runs once).
  A recognised framework call a planner names (the route factory chain) is no such effect only when its option
  values are pure, claimed (relocated) or erased: the core checks, the planner only names it. The env roots, the
  moving set and the extracted exports are one monotone fixed point: every round recomputes derived reach, env
  liveness and the moving set (the evaluation-order condition is a greatest fixed point over it), roots the
  effectful clusters and the readers of mutable state that stay and that some output needs, then cancels extraction
  candidates the env module keeps or that read, at their evaluation, a binding it keeps (a TDZ through the
  re-export cycle). Nothing is rooted after homes are assigned (a dev-only check enforces it, and another that no
  extracted module reads the route module eagerly). When a split would break single-writer or evaluation-order
  rules, the core reports a _fallback_ (`ctx.fallbackAt(range)` on the next round) and `compileModule` re-runs the
  planners with that region kept in place, until no new region is reported (a kept region can free the next one;
  every round keeps one more, so the rounds end within the module's region count). Past that bound every
  sub-region is kept in place, which is always correct, and a warning (`fallback-rounds-exhausted`) says so;
- **pre-existing dead code**: a pure declaration cluster nothing reads is kept (code dead before the transform is
  never removed), including a dead pure cycle; the one exception is a dead pure cluster whose reads would pull a
  chunk's dependency into the env module (an unused function rendering the split component): it is dropped.

### Emit and source maps (`emit.ts`, `output-builder.ts`)

Each output is a flat recipe of original slices and generated text, rendered by our `OutputBuilder` straight into a
v3 source map. User code is never re-printed: comments, escapes and directives survive, and segments start at every
word and punctuator of copied text, so positions in every output (derived modules included) map to the user's
line:column. Lines follow every ECMAScript line terminator. Hosts compose the map with the bundler's input map. The
map names the file without its text (`sourcesContent`): Vite reads it, Rollup and Rolldown take the module's code, and
the webpack-family hosts put it in the module map in production and in the emitted map files in development
(`hosts/emitted-maps.ts`: the bundler hashes a module with its map, and the whole file in every output's map would hot-update
every output of an edited file). The header (hashbang, pragmas, license, directives) is handled by `header.ts`; derived outputs copy pragmas and
directives, never license comments.

### Values and summaries (`values.ts`, `summary.ts`, `resolve.ts`, `facts.ts`)

- Recognition is by binding identity, never by name: an abstract value domain over bindings (factory, builder with
  links, isomorphic fn, namespace, function returns, unknown, plus symbolic `importRef`/`member`/`call` terms) with a
  pluggable `RecognizerTable` (Start supplies its kinds; the core ships none).
- Across modules, **summaries**: the export table and the abstract values of exports, computed from the module's
  _raw_ text (filesystem read or exact-id virtual load, never the bundler's transform pipeline), environment-
  independent, holding no AST. `ExportResolver` follows re-export chains over summaries. Known TanStack packages are
  recognised by specifier and never resolved. An importer's prefetch normally asks for a module's summary before the
  module's own transform runs, so a compiled module is parsed twice: once for its raw facts, once for its compile; a
  transform's parse is never reused as a summary. The one import answered without a read is a route file's `Route` when
  the route registry says the router package's constructor made it (`RouteRegistry.lookup().routerConstructor`): the
  Start prefetch takes it as a value it knows and records a `route-registry` dependency, so the route tree's imports
  read no route file.
- **Pure declarations** (`purity.ts` `isPureDeclarator`): a declarator is pure when its initialiser is, and so is
  every default value and computed key of its pattern (`const { beta = track() } = flags` runs `track` where it is
  written, as `flags.beta ?? track()` would).
- **Pure calls** (`purity.ts`): a call with pure arguments is pure when its callee is declared
  `#__NO_SIDE_EFFECTS__` in the module, or is a known package's export the recognizer lists in `pureCalls`
  (audited APIs of TanStack's router packages, e.g. `getRouteApi`, and of the frameworks, e.g. React `memo`, Vue
  `defineComponent`; the router planners own the table, Start's recognizer reuses it).
  Tier 0 recognises imports of such an export from the package itself by binding (renamed, a namespace member, or a
  member of a default import the recognizer lists in `pureDefaultNamespaces`: React's, a CommonJS package's exports);
  an app module re-exporting it is not followed, and no other package's purity is assumed. A member of a namespace
  import (`Icons.Home` of `import * as Icons`) is a pure read: a module namespace's [[Get]] reads the module's binding
  and runs no code, as an imported identifier does. So is a member of a plain enum of the module (`E.A`, a data property):
  no namespace merged in, and every value use a read of a member it declares or an export, so whatever writes it is in
  the mutation model. A property of any other value may be a getter, and that includes an enum that escapes (`w(E)`, `const a = E`,
  `E.__defineGetter__(…)`),
  an imported enum (one module can't tell it from any other value) and a `declare enum` (whatever the global is).
- **Builder chains** (`purity.ts` `builderCall`): a recognizer's `builderLinks` (Start's: `createServerFn()…handler()`,
  `createMiddleware()…server()`, `createIsomorphicFn()…`) name each link's argument and the environment that keeps it.
  In one environment's purity, a chain whose kept arguments are pure is no effect: an argument the environment's
  compile erases (a server fn's handler on the client) does not count, and its reads are erased with it. Raw facts use
  it per environment for a target's code effects (`ModuleAnalysis.effects()`); the planners of a compile use their
  environment type's (`ModuleAnalysisOptions.env`), so a page-only chain can move with the split chunk in either
  environment. Factories are recognised by binding, as `pureCalls`. A link called on a `const` holding a builder
  stays an effect (a middleware's links write the options of the builder they are called on).
- `RawFactsCache` retains, per canonical id, the facts of one read and its revision, and serves summaries and
  import-protection _target facts_ (marker, export names, effect classification, evaluation and lazy imports) from it.

## Pipeline (`pipeline.ts` `compileModule`)

| phase | what                                                                                                                                                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | identify (canonical id = host id minus compiler-owned query keys), validated plan-cache lookup, parse, Tier 0 analysis (imports/exports/edges/effects), each planner's `gate`, async `prefetch` (resolutions, summaries, target facts; may withdraw the planner)    |
| B     | synchronous `plan` of every planner in order on an `AnalysisPlan`, `resolve()` (function-scope orphans, claims, clusters, roots, homes, glue), `freeze()` (`freeze.ts`) into a plain-data `EmitPlan` with per-output edges (`edges.ts`, one builder for both tiers) |
| C     | per-output edge `policy` (import protection substitutes specifiers), snapshot validation of every dependency, publication to the cache                                                                                                                              |
| D     | emission of the requested output, on demand                                                                                                                                                                                                                         |

Tier 1 (units, symbols, classified references) is built only when a planner needs it. Phase C restarts the compile
(up to 3 attempts) when a dependency changed underneath it; a compile overtaken by a newer revision of its own file is
returned but not published. Requests of one text share one compile: a request (any id of the file) arriving while that
text compiles waits for it and emits its own output from the result.

## Caches and invalidation (`cache.ts`, `host.ts`)

- `PlanCache`: one plan per (env, canonical id, config key; the late pass is a second config key of a file), the latest revision only. A hit is _validated_ (same canonical identity,
  input hash, config/env digest, and every dependency fingerprint still current). Live keys (published, or with an
  attempt active) are indexed by path, so `invalidate()` finds a changed file's plans without scanning.
- `DependencyLedger`: dependencies are recorded as facts are acquired (resolutions, the exports a lookup read and a
  module's `export *` list when a lookup went through it, whole summaries for a listing of a namespace's exports or a
  module without a summary, target facts, route registry digests, failed resolutions), and a `DependentsIndex` maps them back to plans: a published plan's
  rows until it is evicted or replaced, rows in flight until the key's last compile ends (two quick saves overlap).
- `invalidate(caches, change, hosts)` is **the** invalidation operation: hosts call it per file change/add/unlink; it
  evicts the file's plans in every env, marks its raw facts stale, re-validates dependents' fingerprints with each
  environment's own resolver (a resolver that throws makes the plan stale, and its next compile reports the error;
  add/unlink also retry failed resolutions, and they or a `package.json` change drop the resolution memo; an add also re-asks the resolutions it may
  take: a file of the same name with another extension, or of a directory a resolution went into; a resolution that
  found an unlinked file is stale without asking) and returns
  `{ evicted, dependents }`, which the host hard-invalidates in the bundler. A summary change invalidates an importer
  only when what it read changed: the digest of an export it looked up (`exportKeyOf`; an absent name
  appearing counts), the `export *` list a lookup walked, or the whole export-facts digest for a listing. An export
  added to a widely imported module re-plans none of its importers. A published plan keeps one `exports` record per
  module it looked names up in: the names and their keys, or none when the module exports none of them (a barrel's
  star targets are visited for every name, so one record per name grew with names × targets), and the module's
  `export *` list when a lookup walked it.
- Raw facts validated at the current `RawFactsCache.version` are not asked again on a hit or at publication
  (`CacheEntry.factsAt`): the version moves on every `markStale`, `forget` and `retain` drop, which is how anything that
  changes a raw-facts answer reaches the cache (a host that saw a file missing marks it stale when it may have
  appeared).
- `restorePlans(caches, plans, hosts)`: a host with a persistent bundler cache persists each output's plan key and
  dependencies (`CompileOutput.persisted`) with its module; a later process checks them for the modules the cache
  restores without compiling: a current plan joins its environment's plans as a _restored_ plan (never a hit; its
  dependencies are in the dependents index, so `invalidate()` reports it like any plan; a compile replaces it), a stale
  one is returned for the host to build again.
- `releaseEnvironment(caches, env)` is the end of an environment's lifetime: a production build releases an
  environment's plans as soon as that environment's build is finished (several environments build one after the
  other in one process). Raw facts are shared by the environments and stay.
- Resolutions: each compile records its answers in its ledger; validation asks the module's resolver again (its
  host's: `invalidate` and `restorePlans` take the host of each plan's key) only once a file appeared or disappeared
  since the plan's resolutions were validated (`CompilerCaches.fileSetVersion`). An environment may have more than
  one resolver (Rsbuild's RSC layer resolves with `react-server` through rule options): `HostServices.resolveScope`
  names the host's. The environment's `PlanCache` memoises each resolver's answers per (importer, specifier) for one
  `fileSetVersion`
  (the compiles of a build would otherwise ask for a barrel's re-exports once per importing module); the same version
  bump drops the memo, and `releaseEnvironment` releases it with the plans.
- Not cached: emitted outputs (emission from a frozen recipe costs microseconds).
- Invariants: no Yuku object is reachable from any cache (`tests/heap.test.ts`); every cache is bounded by the live
  module set; derived outputs are pure functions of (env, source, config, summaries).

## Hosts

| host                     | where                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router, Vite             | `router-plugin/src/hosts/vite.ts` (+ `session.ts`): native plugin, hook filters, `load` for derived ids, `hotUpdate` invalidation                                                                                                                                                                                                        |
| Router, Rspack / webpack | `router-plugin/src/hosts/webpack.ts`, `loader.ts`: the plugin's own loader (composes input maps, `addDependency`)                                                                                                                                                                                                                        |
| Router, esbuild          | `router-plugin/src/esbuild.ts`: generator only; `autoCodeSplitting` throws                                                                                                                                                                                                                                                               |
| Start, Vite              | `start-plugin-core/src/vite/compiler-plugin.ts` (+ `compiler-state.ts`, `invalidation.ts`, `late-pass-plugin.ts`, `server-fn-plugins.ts`, `handler-reach.ts`, `planning.ts`, `bundled-dev.ts`) over the Start session (`compiler/session.ts`, both Start hosts): Start planners and the router planner in one compile per module and env |
| Start, Rsbuild           | `start-plugin-core/src/rsbuild/` ([COMPILER_ARCHITECTURE.md](../../../start-plugin-core/src/rsbuild/COMPILER_ARCHITECTURE.md)): Rspack loaders per env/layer, facts in `buildInfo` replayed for the persistent cache                                                                                                                     |

The bundler-shaped helpers the hosts share (a Vite build's last pass, derived ids' `load`, module-graph
invalidation and live modules of a hot update, a webpack-family loader's map and module id,
rebuilds and invalidated files, eager extracted exports, emitted maps' text, the key of a persistent cache, a loader's
diagnostics at their positions) live in
`hosts/`, exported apart from the core model, which uses none of them.

A persistent bundler cache restores modules without compiling them, so its version holds `compilerCacheKey` (the
compiler packages' manifests, and their built scripts outside `node_modules`).

Derived ids and the specifiers that import them keep the Babel splitter's format, which apps' chunk naming reads
(webpack/Rspack `chunkGroup.origins[].request`, Vite module ids): `identity.ts` alone prints and parses it. A split
group is `<path>?tsr-split=<a>---<b>` (the options sorted); the modules main had no counterpart for follow that style
after a first key no route option has (`tsr-split=shared---<keys>`, `tsr-split=export---<name>`,
`EXTRACTED_EXPORT_QUERY_RE`); Hydrate is `?tss-hydrate=<id>`. An output imports another output of its file (and the
route module itself) by the file's absolute path (`sameFileSpecifier`), a `#` of the path escaped as `\0#` (the
webpack-family request escape); under a path with a `!` (loader syntax there, no escape), by its basename
(`./route.tsx?…`). webpack and Rspack resolve it themselves; the Vite hosts resolve it with
`resolveSameFileSpecifier`, only for the importer's own file (a browser URL `/src/…?tsr-split=…` looks absolute too).

Hosts decide dev/build from the bundler's mode, never from `process.env.NODE_ENV` at plugin creation. An id without
a language (an asset, or an asset query a script honours: `SCRIPT_ASSET_QUERY_RE`, `isAssetId`) is never compiled, and its facts are never read from its
file. A host returns no transform for an env output equal to its input (an output ending where the source ends gets no
line feed). Start's hosts compile a `node_modules` module only as `start-plugin-core/src/compiler/scope.ts` decides.

## Planners

Fixed order per env (an array the host passes): `start-env` → `hydrate` → `rsc-css` → `router` → `import-edges`. A
planning round runs each planner's `plan` in that order; a planner sees the regions, edits and generated names of the
planners before it. The router plugin alone runs only the `router` planner.

| planner        | job                                                                   | file                                                                                                                                         |
| -------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `router`       | route option splitting, `deleteNodes`, route HMR                      | `router-plugin/src/planners/router.ts` (`split.ts`, `hmr.ts`); runtime in `router-core/src/hmr.ts` and `{react,solid,vue}-router/src/hmr.ts` |
| `start-env`    | server functions, middleware, isomorphic/env-only fns, `<ClientOnly>` | `start-plugin-core/src/planners/start-env.ts`; recognition `src/compiler/`; ids/registry/resolver `src/server-fns/`                          |
| `hydrate`      | `<Hydrate>` extraction into chunks                                    | `start-plugin-core/src/planners/hydrate.ts`                                                                                                  |
| `rsc-css`      | RSC CSS injection in the provider env                                 | `start-plugin-core/src/planners/rsc-css.ts`                                                                                                  |
| `import-edges` | import protection: per-output edges, mock substitution (policy phase) | `start-plugin-core/src/planners/edges.ts`; rules, verdicts, reports `src/import-protection/`                                                 |

Composition: `startPlanners()` in `start-plugin-core/src/planners/index.ts`; the router planner and its configuration
builder (`routerPlannerConfigFrom`) are exported from `@tanstack/router-plugin/planners`.

### Adding a planner

1. Implement `Planner` (`host.ts`): `name`, `tier` (0 if you only need import/export tables), a cheap `gate`, an
   optional async `prefetch` (everything cross-module happens here and is recorded as a dependency; resolve to
   `false` to withdraw), `plan(ctx)` (synchronous: register regions, emit edits, `declareOutput`/`addRoot` for
   derived modules, `setFacts`, `diagnostic`), and an optional per-output `policy`.
2. Never walk the whole AST when a semantic query from the import table or a binding's references answers the
   question; never keep a Yuku node beyond `plan()`; facts must be JSON data.
3. Declare its `PlannerData` entry (`host.ts`: the types of its config, prefetch result and facts, by its name) next
   to it with `declare module '@tanstack/router-utils/compiler'`, and type it `Planner<typeof NAME>`: `ctx.config`,
   `ctx.prefetched.get(name)`, `setFacts` and `facts.planners[name]` then carry those types, for the planner and for the
   hosts reading its facts. Slot it into the host's planner array at its fixed position.
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

- `TSR_COMPILER_NO_CACHE=<list>`: disables caches, comma-separated: `plans` (no plan is a hit, every request
  compiles again; each plan's dependencies are kept, so an edit still reports the modules that read it), `facts` (every raw-facts read of a file re-reads and re-analyses it), `targets` (target facts of
  imported modules are rebuilt on every read), `registry` (a route file's `Route` is read from the file instead of
  answered from the route registry's `routerConstructor`), or `all`. Output must be identical with any combination; only speed
  changes. Use it on a report of stale or wrong output after an edit (HMR serving old code, a split that ignores a
  changed dependency, a dev/build mismatch): if `all` fixes it, an invalidation is missing; bisect with the single
  names to find the cache, then reproduce in `tests/cache.test.ts` or `tests/pipeline.test.ts`.
- `TSR_COMPILER_VERIFY=1`: after every compile, each emitted output is re-parsed and checked against the plan's
  invariants (`verify.ts`): no output assigns a binding it imports, every glue import names an export of its home
  output, no output holds text its own edits erase, every surviving effect statement is emitted exactly once across
  the outputs that import from the env module, an extracted export's module never reads a binding of the env
  module at its evaluation, and no output reads a module binding of the source or a generated binding it neither declares
  nor imports, and no two extracted modules import each other. A violation fails the compile. Every test run sets it (the shared run-directory setup and
  the core's own config); unset, it costs one boolean per compile. It is the one switch of the compiler's self-checks
  (`self-checks.ts`): set, the internal asserts run and a violated placement invariant (`homes.ts`, `inclusion.ts`) or
  the renderer's copy check ("Copied text keeps its edits") throws; unset (users' dev servers, builds and their own
  tests), they are still checked and a violation is one `internal-invariant` diagnostic for the module (an internal
  compiler error, please report it): a warning for placement (the output may be wrong), an error for the copy check
  (the output would be wrong).
- `TSR_COMPILER_STATS=1`: every cache owner (the compiler caches, the router and Start host sessions with their
  import-protection and server-function state, the route generator) registers a reader of its entry counts and
  approximate bytes in a process-global registry, held through a `WeakRef` and read by a function outside the owner's
  scope, so it retains nothing. Read it in the same
  process with `compilerStats()` from `@tanstack/router-utils/compiler` (e.g. a temporary
  `setInterval(() => console.log(compilerStats()), 10_000)` in the bundler config); the raw registry is
  `globalThis[Symbol.for('tanstack.compiler.stats')]` when the package is not importable from the app. Use it on a
  report of dev-server memory growth: counts that grow with edits rather than with the module set point at the leaking
  cache. `TSR_COMPILER_STATS_BYTES=0` skips the byte estimates (structured-clone sizes, slow on large caches).
  Test contract: the owner names `start:<bundler>` / `start:<bundler>:session` and their `plans` / `ip.envs` counts
  are the only observable of the per-environment release in a production build
  (`start-plugin-core/tests/integration/start-build-environment-release.test.ts`); rename them there too.

## Performance and bytes

- Compiler perf harness: [`benchmarks/compiler-perf/`](../../../../benchmarks/compiler-perf/README.md): generated
  338-route Start/Router apps (React and Solid), dev startup, compile-all, HMR, builds, the _floor_ (compiler outputs
  replayed) and memory/leak checks.
- Client bytes: `pnpm benchmark:bundle-size:run` (18 scenarios); server bytes and cold start:
  `scripts/benchmarks/bundle-size/server.mjs`. Client production bytes must not grow.
- Rules: semantic queries over full-AST walks, cheap planner gates on the Tier 0 tables (after the parse, before Tier 1
  and any cross-module work), no worker pool, `yuku` pinned to an exact version, every cache bounded and invalidated.
