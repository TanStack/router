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
- every derived module of the same source in that env: split chunks (`?tsr-split=…`), the shared module
  (`?tsr-split=shared---…`), Hydrate chunks (`?tss-hydrate=…`), server-function provider modules
  (`?tss-serverfn-split`), server-function handler modules (`?tss-serverfn-handler`),
- facts: surviving import edges (import protection), server-function registry entries, diagnostics, file
  dependencies, per-planner data.

Any id of a file may arrive first: a derived id computes (or reuses) the plan of its file at the same revision and
emits its own output. Nothing depends on transform order.

### Units, regions, edits

- **Units** (`units.ts`): the top level split into the smallest things placement reasons about: one import specifier,
  one declarator, one function/class/enum/namespace (merged declarations together), one export specifier, every other
  statement. **Regions** are ranges planned as one thing; every unit is one, and planners register sub-regions
  (route option values, Hydrate children, nested server-fn chains). A sub-region nests in one unit (on exactly its
  range at most): one holding statements is a conflict as it is registered.
- **Rewrite tree** (`rewrite.ts`): every range a planner addresses has two answers per output: its **text** (what it
  reads as wherever it renders) and its **place** (what stands where it is written). `edit` sets the text, in every
  output: an edit's body names source text only as slices of the range it rewrites (rendered with what the output
  does inside them), next to structured text with symbol references (`SymRef`), glue specifiers and context-aware
  reference rewrites (shorthand properties expand, export names stay). `insert` adds text at a position, in some
  outputs. `placeholder` puts generated text at a range's place in some outputs; the range's text then renders
  nowhere there. A _generated unit_ can `claim` a region: the owner renders the region's text whole
  (`{ k: 'region' }`, its only way to name source text), wherever the owner is placed, and the claim's placeholder
  stands at its place, in the outputs of the claim's scope. An erasure enclosing the occurrence kills the claim and
  its owner, unless other generated code (a unit, a placeholder) reads the owner (the provider's hoisted server fn
  its RPC wrapper calls): then only the placeholder goes. In an output outside the claim's scope a placeholder of
  that output stands at the place, and the text renders in the owner if it is read; with none, the region's text is
  the text around it (Start's nested server-fn chain stays in place in the RSC env module, with its handler's stub,
  while the provider output hoists it). Text and place never conflict: a handler that is itself an env-only or
  isomorphic call has its stub as its place and its compiled call as its text, which renders in the provider or
  handler module. Two edits, or two placeholders (a claim's included), on one range in one output conflict. A route
  option written as a method claims its function; an edit of the property writes the key before the placeholder.
  The server-code check (`server-code.ts`, R132) is a redundancy net beside the planners, removable in one deletion
  (its module comment says how): after freeze, each planner's `serverCode` recorder lists the server-only text its
  recognition finds in a client compile (Start: every server fn's handler and validator, middleware's `.server()`
  and validator, isomorphic fn's `.server()`, `createServerOnlyFn` body; the router: every recognised route option in
  `deleteNodes`), whatever the planner did with it; a slice of any output over one, or text mapped into one, fails
  the module (an error in users' runs, a throw under the self-checks). A compile already holding an error is not
  checked. It catches a planner skipping a recognised site; not recognition failures, declarations only server code
  reads, imports of server-only modules or unreadable route options. The core's orphan cleanup is the
  only edit with a scope (`scopedEdit`, not on `PlanContext`). A generated unit has a home (`auto`: placement
  decides; an output), or `env-readers`: placement copies it into every derived output importing a binding of the
  env module other than the ones it names, once inclusion is decided (route HMR registers the chunks reading what
  the route module keeps); it declares nothing, owns no claim and reads only its own imports.
- **One region tree per plan** (`RegionTable`, `rewrite.ts`): the module, every sub-region (one per range) and the
  range of every edit, placeholder and claim, shared by every output and checked against the units, so two ranges
  nest or are disjoint whatever outputs they apply in; a range that partly overlaps another is a conflict as it is
  registered, and so is a second claim on one range. Each plan has its own (a fallback round starts again from the
  units). How regions nest is read on the tree (`parentOf`, `innermostAt`); placement derives the nesting, where
  each unit is, and what each region's text holds of the tree, once per plan.
- **One walk per output** (`OutputView.walk`): source text enters an output only through it. A node renders its
  place (`placeholderOf`: a placeholder, or a kept claim's) or its text (`editOf`: its edit's body, or its source
  with the nodes inside it); a node that renders as its source is walked through. An insert has one owner, the
  text holding its position (`RegionTable.insertOwnerAt`): the innermost node strictly holding it, whose level
  renders it, and that text's region, else the unit holding the byte there, which reads what it names (one at a
  claimed region's edge renders once, beside the placeholder; one at a unit's start is the unit's: it renders and
  is read where the unit is). An insert where no unit holds the position (a statement's keyword, between
  statements, the module's end) is refused: nothing would read what it names. A slice that cuts a node rewritten in that output fails the
  compile in every mode (it would copy the text the node replaces). The renderer (`freeze.ts`), placement's reads
  (`reads.ts`) and the erased parts are the walk's visitors; the point questions (whether a byte renders,
  the claims an output keeps) climb the tree from a position's innermost range asking each node the same two
  questions: a place without an owner erases the text, a claim's relocates it. A question costs the nesting depth,
  not the number of edits. Whether a region is claimed is asked per output (`OutputView.isClaimed`): a member reads
  a nested region claimed only for other outputs as its own text (its references, no edge to the owner).
- **Outputs are put together from pieces** (`freeze.ts`). A derived output: its header, glue imports, the
  statements it includes and its generated units in order, export glue. The env module: the walk's text between
  its pieces, which are the statements placement rewrites (their recipes), the generated units at their anchors, the
  glue imports after the header and the export glue at the end. At one position a planner's insert renders first
  (with the text before it), then a statement's line end, the glue imports, the generated units, a statement's
  `;`, the statement; at a statement placement rewrites, the insert is the statement's and renders with what it
  keeps. A planner's node that a piece's position cuts
  fails the compile, as a slice cutting it does. Whether a byte renders in the env module is the tree's answer,
  else the rewritten statement's.
- **Generated code declares its reads** (`SymRef`s); nothing is re-parsed to find them. Names come from one
  allocator per file over every name in every scope (`names.ts`), so a name means the same thing in every output.
  Glue export names avoid the module's export names; in a module with `export * from …`, whose re-exported names are
  unknown, they are the compiler's own (`tsr$x`). A planner can name a binding's glue export ahead
  (`glueExportName`: React route HMR lists them for plugin-react to ignore).

### The one placement (`placement.ts`, R153, R155)

Every plan is placed by `computePlacement`. A plan a planner marks as a route file (`PlanContext.setRouteModule`, the
router planner's split part) is placed as route splitting on main places it, by its outcome; every other plan
(server-fn handler modules, the RSC provider copy, erasure only, `<Hydrate>` chunks) by the same rules, with no name a
chunk imports and none main shares. It reads names, references and assignments only, never what code does:

- **clusters** (`clusters.ts` `buildClusters`): one per unit (units declaring one symbol are one), a claimed region
  with the generated unit owning it, an unclaimed sub-region with the region around it. Its kind comes from the unit
  kinds, which statement syntax sets.
- **the write table**: every assignment of a module binding (`ref.kind === 'write'`), with the unit or claimed region
  holding it. It answers two questions: a shared name some code outside the set assigns, and an output that would
  assign a binding it imports (or a `<Hydrate>` chunk its copy).
- **reads** (`reads.ts` `readIndex`): what a cluster reads in an output is what the walk of its members' text there
  renders (`OutputView.walk`): the references of the source it renders and the symbols generated text names; its
  successors are the clusters those lead to. `readFromRemoved` (the removal rule's first half, below) walks the
  source's text, rendered or not.

The rules, per output:

- **the env module** loses only what the split made unused (the R153 amendment, `readFromRemoved`, the rule erasure
  uses): a declaration or import specifier the source used from text the module no longer holds (a claimed option
  value, erased text, the type-only export statements main deletes first; a use in a type counts) goes with its
  initialiser when nothing that stays reads it by value.
  Top-level statements (R154), exports, code already unused in the source and what they reach stay; enums and
  namespaces are declarations like any other (R155). In a route module, splitting never removes a class, enum or
  namespace declaration, whatever names it (by value or in a type, in split or kept text), and it keeps what it
  reads, unless it is a name main shares (R163: main's removal rule never removes one, so its body runs at load).
  Only erasure removes one: when text the module erases, or another planner's output claims (a handler module, a
  `<Hydrate>` chunk) reads it by value, or erased text names it in a type, and no split chunk reads it by value
  (leaks first, R163 round 2 (b) and round 3).
- **a split chunk** takes what its option's value reads, transitively. What the env module also keeps it imports from
  there when main does (`RouteModule.imported`, from the router planner: the route binding, `export const|let|var`)
  and copies otherwise, with the top-level code reaching what it copies through the names it references (R1: every
  statement, every class, enum and namespace (R163) and every declaration no other declaration or statement of the
  source reads by value (an export is a reference, as in main's removal rule; a read by another output's text, a
  server fn handler's, is one; its own text and a type are none) whose names reach it, transitively; main's second
  instance,
  spec-main-splitting.md §1.8; `export default <expression>` is such a statement, rendered there as
  `void (<expression>)`); a binding a statement declares (`if (…) { var x }`) is imported. A derived output drops
  only the `export` (`default`) keywords of what it copies: comments and annotations stay with the copy.
  What the env module does not keep the chunk copies too, also what another chunk copies. The names main shares
  (`RouteModule.shared`: two option groups read them, a staying option counting as one) and nothing else are one
  shared module per file (`?tsr-split=shared---<keys>`, main's `?tsr-shared=1`): the env module and the chunks import
  them, the env module re-exports the exported ones; one code outside the set assigns (a chunk, the env module,
  another planner's output), or one reading a declaration outside it, leaves the set and is placed like any other (one
  fixed point). Import specifiers are copied where read. A planner renders its own text
  in split chunks with a `{ kinds }` scope (Start: a split chunk's copy of a server fn is a caller, its handler
  `createSsrRpc(id)` and its validator gone, R159).
- **a `<Hydrate>` chunk** (spec-phase2-hydrate H1/H2) copies every declaration its children reach, by binding and
  transitively, exported or not, and no top-level statement; it imports only what cannot be a copy: a binding its
  planner names (`OutputDecl.imported`: a declaration leading back to the boundary, a recursive component), the route
  binding (`RouteModule.route`, whatever encloses the boundary), a name a statement declares and a declaration such a
  statement reads (KNOWN-BUGS), what another module of the file holds (a shared name, a generated declaration with
  its own home). It is no home of anything: two chunks reaching one helper each copy it. Code that left the env module
  (the children, what only they use) assigning such an import, or its copy of a binding the env module keeps, falls
  back (`shared-writer`); a helper the env module holds too writes each side's own copy.
- Another planner's derived output (the server-fn handler module, one per file) imports what the env module keeps,
  and what it alone needs moves there; a provider output copies what it reaches (R157). A
  declaration a planner's lazy module (`custom`, the server-fn handler module) reaches stays in the env module when
  evaluating it reads, by name and transitively, something the env module keeps (`const snapshot = cfg.url;
set(cfg)`): it runs at load, as in the source; a declaration that is exactly a function moves (one fixed point
  after the env closure). A handler assigning what the env module keeps falls back in place (`shared-writer`).
- **code already unused**: an import nothing in the source references, a bare `import './polyfill'` included, moves
  to the shared module when the env module imports it (statically, first), in source order with the shared module's
  own imports: it runs at the same point, once, and a module a shared declaration reads still runs after a bare import
  written before it; a CSS import keeps its cascade position, as in `main`'s shared module. Otherwise it stays in the
  env module. Chunks and Start's derived outputs (Hydrate, the server-function handler module) load after the
  env module has run (a handler module through the memoised loader of its defining module, D6/R66) and get none. Only
  imports the source wrote (not a planner's generated `lazyRouteComponent`). A declaration nothing references stays in
  the env module only: a copy would run its initialiser again (`main`'s chunks do). React's classic JSX runtime is not
  supported with splitting: a chunk holding JSX has `React` only when its code reads it.
- **a fixed home says where, not whether**: the owner of a claim whose output no longer keeps the claim (`hasClaim`:
  an erasure removed its occurrence, e.g. a boundary in a route option the router deletes on the client) is unused,
  whatever home its planner gave it: no root, no home (the removal rule).
- **one fallback, on the outcome**: a derived output that would assign a binding homed in another module of the file
  does not take the root bringing that code (`Placement.fallbacks`, `shared-writer`), and its planner keeps the root in
  place (the router planner's `assignsWhatItImports`, start-env's handler, Hydrate's `hydrate-module-write`).

A chunk's copies are main's: state is one instance where main has one, and a statement runs again in a chunk only
where main's chunk runs it again (never a declaration already unused: better than main).

### Removal (`reads.ts` `readFromRemoved`, `orphans.ts`)

- **by provenance**: a declaration or import specifier is removed only if _our_ edits orphaned it: the source used it
  (by value or in a type) from text an output no longer holds (a claimed option value, erased text, the type-only
  export statements main deletes first), and nothing left reads it by value. A top-level statement that is no
  declaration (`x.p = v`, `x.push(v)`, `x = v`) is never removed with what only erased code read (R154), and code
  already unreferenced in the source keeps running: an import nothing reads stays (one removed code read only in a type
  leaves, as TypeScript's elision would). Type units stay in the env module as written whatever their cluster, never in
  a derived output; only the TypeScript-only specifiers (an inline `type` specifier, an `export { X }` of a type-only
  binding) follow their statement's value specifiers (`droppedTypeUnits`). Type-only export syntax (`export type { X }`,
  `export type * from`, `export { type X }`, …) is in no output (`isTypeOnlyExport`), as main's `stripTypeExports`
  removed it. A read the core synthesises from a name (a Solid `use:` directive) binds only to a declaration with a
  runtime value (`valueBinding`). JSX is no read of the classic runtime's factory: the classic runtime is not supported
  with splitting.
- **below the units** (`orphans.ts` `cleanOrphanedDeclarations`): function-local declarators, destructuring leaves,
  function and class declarations only erased code used go by the same rule (a use in a type in the erased text
  counts, R170), with their initialisers whatever they do (a hook call too, R166), as main's dead-code elimination
  did. The core runs that cleanup once after every planner, in every output
  when edits addressed to every output orphaned it, else in the env module only. A module-level destructuring leaf
  stays while it is exported or another output takes it; a property a live rest element keeps loses only its default
  value.
- **planning rounds**: a derived output that would assign a binding it imports reports a _fallback_
  (`ctx.fallbackAt(range)` on the next round), and `compileModule` re-runs the planners with that region kept in
  place, until no new region is reported (a kept region can free the next one; every round keeps one more, so the
  rounds end within the module's region count). Past that bound every sub-region is kept in place, which is always
  correct, and a warning (`fallback-rounds-exhausted`) says so.

### Emit and source maps (`emit.ts`, `output-builder.ts`)

Each output is a flat recipe of original slices and generated text, rendered by our `OutputBuilder` straight into a
v3 source map. User code is never re-printed: comments, escapes and directives survive, and segments start at every
word and punctuator of copied text, so positions in every output (derived modules included) map to the user's
line:column. Lines follow every ECMAScript line terminator. Hosts compose the map with the bundler's input map. The
map names the file without its text (`sourcesContent`): Vite reads it, Rollup and Rolldown take the module's code, and
the webpack-family hosts put it in the module map in production and in the emitted map files in development
(`hosts/emitted-maps.ts`: the bundler hashes a module with its map, and the whole file in every output's map would hot-update
every output of an edited file). Rollup and Rolldown name a module's source by its id (`route.tsx?tsr-split=…`); the
Vite hosts' `outputOptions` compose `sourcemapPathTransform` with `withOwnSourcesNamedByFile` (`hosts/vite.ts`), which
drops the owned query keys, so every output of a file names it once (R135); the webpack family names the resource
path already. The header (hashbang, pragmas, license, directives) is handled by `header.ts`; derived outputs copy pragmas and
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
- **Purity** (`purity.ts`) is import protection's effect model, and nothing else asks it: `ModuleAnalysis.effects()`
  classifies, per environment type, the statements of a module read as an import-protection target (raw facts), and
  the effect witness reads the result: whether an unused import of a denied module counts as a violation in a build.
  It decides that report, never what an output contains; placement and erasure read names, references and
  assignments only. Its contexts are built when a module is first asked about (`purityForEffects`), never by a compile.
- **Pure declarations** (`isPureDeclarator`): a declarator is pure when its initialiser is, and so is every default
  value and computed key of its pattern (`const { beta = track() } = flags` runs `track` where it is written, as
  `flags.beta ?? track()` would).
- **Pure calls**: a call with pure arguments is pure when its callee is declared `#__NO_SIDE_EFFECTS__` in the module,
  or is a known package's export the recognizer lists in `pureCalls` (audited APIs of TanStack's router packages,
  e.g. `getRouteApi`, and Solid's `lazy`; Start's import protection owns the table:
  `start-plugin-core/src/import-protection/pure-calls.ts`).
  Tier 0 recognises imports of such an export from the package itself by binding (renamed, or a namespace member);
  an app module re-exporting it is not followed, and no other package's purity is assumed. A member of a namespace
  import (`Icons.Home` of `import * as Icons`) is a pure read: a module namespace's [[Get]] reads the module's binding
  and runs no code, as an imported identifier does. So is a member of a plain enum of the module (`E.A`, a data
  property): no namespace merged in, and every value use a read of a member it declares or an export. A property of
  any other value may be a getter, and that includes an enum that escapes (`w(E)`, `const a = E`,
  `E.__defineGetter__(…)`), an imported enum (one module can't tell it from any other value) and a `declare enum`
  (whatever the global is).
- **Builder chains** (`builderCall`): a recognizer's `builderLinks` (Start's: `createServerFn()…handler()`,
  `createMiddleware()…server()`, `createIsomorphicFn()…`) name each link's argument and the environment that keeps it.
  In one environment's purity, a chain whose kept arguments are pure is no effect: an argument the environment's
  compile erases (a server fn's handler on the client) does not count, and its reads are erased with it. Factories
  are recognised by binding, as `pureCalls`.
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
returned but not published. A revision is newer by its request's arrival, noted once: a request that waits (a plan hit's
validation, a compile it shares) and then compiles never takes back the latest revision from one that arrived meanwhile. Requests of one text share one compile: a request (any id of the file) arriving while that
text compiles waits for it and emits its own output from the result.

## Caches and invalidation (`cache.ts`, `host.ts`)

- `PlanCache`: one plan per (env, canonical id, config key; the late pass is a second config key of a file), the latest revision only. A hit is _validated_ (same canonical identity,
  input hash, config/env digest, and every dependency fingerprint still current). Live keys (published, or with a
  request in progress) are indexed by path, so `invalidate()` finds a changed file's plans without scanning.
- `DependencyLedger`: dependencies are recorded as facts are acquired (resolutions, the exports a lookup read and a
  module's `export *` list when a lookup went through it, whole summaries for a listing of a namespace's exports or a
  module without a summary, target facts, route registry digests, failed resolutions), and a `DependentsIndex` maps them back to plans. A row holds two facts: the
  key's published plan depends on the path (until it is evicted or replaced), and a compile of the key running now
  asked for it (until the key's last request ends: two quick saves overlap). An event restarts the compiles that asked,
  and checks the published plan.
- `invalidate(caches, change, hosts)` is **the** invalidation operation: hosts call it for every file event they see
  (every hook, every environment) and for registry changes. Calls for one path run one after the other;
  `caches.settled()` resolves once none runs. The call returns nothing.
  - **Repeats are harmless.** The raw-facts cache keeps the revision of the text it read of each path (`seen`); the
    event reads the file once, and a change whose text is what the caches read (an echo, a touch, the same event
    through a second hook) marks no fact stale.
  - **An event is judged by the file as it is.** A removal of a file that reads back is an add, and a change of one that
    reads nothing a removal. An event
    that reads the file empty reads it again for a moment (an in-place save reported between truncation and write),
    unless an event read it empty and waited in vain and the file's modification time is the same (a repeat of that
    event through another hook; a time of whole seconds counts as unknown: a filesystem of coarse times stamps a save
    like the write before it).
  - **Every file event moves the file set** (`fileSetVersion`), a repeat included: any may hide a creation (chokidar
    folds a removal and a re-creation within its window into one change; Rspack lists a file back in its batch as
    modified). So the resolution memo is dropped, a plan's resolutions are asked again at its next request, and a
    compile's snapshot asks its resolutions again once an event ran since its attempt began (until a check overlaps
    none). The event also asks the failed resolutions of every published plan, and the resolutions the file may take
    (a file of the same name with another extension, or of a directory a resolution went into, looked up in the
    dependents index by directory and name, not scanned).
  - **Dependents.** A change marks the file's raw facts stale (its next build takes the text the event read) and
    re-validates dependents' fingerprints with each environment's own resolver (a resolver that throws makes the plan
    stale, and its next compile reports the error). The file's own plans are keyed by its text and stay (a bundler
    that built the new text already keeps their rows) until a compile of a newer text ends: with its plan, or, for a
    text without one (untouched, empty, not parsed), without. A removal evicts them and stales every plan that read the
    file, unasked; it is told to the session (`createCompilerCaches`' `removed`: Start forgets the file's server
    functions and import protection's records there).
  - **Stale sets.** The plans found stale enter their environment's **stale set** (`caches.stale`): the files whose
    modules the bundler must build again and will not build on its own, kept until a host takes them
    (`take(env, { held })`; `held`: stale only because a file they read was removed). The other writers: a registry
    change (the file, in every environment that has compiled or whose bundler holds modules: `stale.track(env)`, a
    Vite dev environment, a webpack-family compiler from its first drain), a plan hit that fails validation (the file,
    so its other outputs follow; when no invalidation runs, counted as `staleHits` when a fact failed, a defect:
    `invalidate()` checks every fact, and as `lazyHits` when only a resolution or a route-registry digest did, which
    the next request asks again by design; the compiler test suites fail a file whose compilers count a stale hit or
    leave a stale path), and a compile every attempt of which was overtaken.
  - **Takers.** The webpack-family hosts take their environments' sets at `finishMake` (`StaleSetDrain`), the Vite
    dev hosts in each environment's `hotUpdate` (`staleHotUpdate`: the event's own file leaves the set first, its
    modules are the event's), and a Vite watch build at each environment's `buildStart`: a Rolldown watch rebuild runs
    every `load` and `transform` again, so it builds every stale module (an assumption test in
    `start-build-watch.test.ts` fails if a rebuild stops doing so).
  - **Summaries.** A summary change invalidates an importer only when what it read changed: the digest of an export
    it looked up (`exportKeyOf`; an absent name appearing counts), the `export *` list a lookup walked, or the whole
    export-facts digest for a listing. An export added to a widely imported module re-plans none of its importers. A
    published plan keeps one `exports` record per module it looked names up in: the names and their keys, or none
    when the module exports none of them (a barrel's star targets are visited for every name, so one record per name
    grew with names × targets), and the module's `export *` list when a lookup walked it.
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
  host's: `invalidate` and `restorePlans` take the host of each plan's key) only once a file event was applied since
  the plan's resolutions were validated (`CompilerCaches.fileSetVersion`). An environment may have more than
  one resolver (Rsbuild's RSC layer resolves with `react-server` through rule options): `HostServices.resolveScope`
  names the host's. The environment's `PlanCache` memoises each resolver's answers per (importer, specifier) for one
  `fileSetVersion`
  (the compiles of a build would otherwise ask for a barrel's re-exports once per importing module, and so would
  those of a dev server's start); the same version bump drops the memo, and `releaseEnvironment` releases it with the
  plans.
- Not cached: emitted outputs (emission from a frozen recipe costs microseconds).
- Invariants: no Yuku object is reachable from any cache (`tests/heap.test.ts`); every cache is bounded by the live
  module set; derived outputs are pure functions of (env, source, config, summaries).

## Hosts

| host                     | where                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router, Vite             | `router-plugin/src/hosts/vite.ts` (+ `session.ts`): native plugin, hook filters, `load` for derived ids, `hotUpdate` invalidation                                                                                                                                                                                                                                                                                                                                                                              |
| Router, Rspack / webpack | `router-plugin/src/hosts/webpack.ts`, `loader.ts`: the plugin's own loader on every JS module outside `node_modules` (compiles route modules, composes input maps, `addDependency`); the stale set built again at `finishMake` (`StaleSetDrain`)                                                                                                                                                                                                                                                               |
| Router, esbuild          | `router-plugin/src/esbuild.ts`: generator only; `autoCodeSplitting` throws                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Start, Vite              | `start-plugin-core/src/vite/compiler-plugin.ts` (+ `compiler-state.ts`, `invalidation.ts`, `late-pass-plugin.ts`, `server-fn-plugins.ts`, `handler-reach.ts`, `planning.ts`, `bundled-dev.ts`) over the Start session (`compiler/session.ts`, both Start hosts): Start planners and the router planner in one compile per module and env; the client build the server embeds is one record of the run (`ClientBuildRecord`), and a watch build's server watches a sentinel the client rewrites when it differs |
| Start, Rsbuild           | `start-plugin-core/src/rsbuild/` ([COMPILER_ARCHITECTURE.md](../../../start-plugin-core/src/rsbuild/COMPILER_ARCHITECTURE.md)): Rspack loaders per env/layer, facts in `buildInfo` replayed for the persistent cache                                                                                                                                                                                                                                                                                           |

The bundler-shaped helpers the hosts share (a Vite build's last pass, derived ids' `load`, module-graph
invalidation and live modules of a hot update, a webpack-family loader's map and module id,
the webpack-family stale-set drain (`StaleSetDrain`: rebuilds at `finishMake`, a compilation for an idle compiler), emitted maps' text, the key of a persistent cache, a loader's
diagnostics at their positions) live in
`hosts/`, exported apart from the core model, which uses none of them.

A persistent bundler cache restores modules without compiling them, so its version holds `compilerCacheKey` (the
compiler packages' manifests, and their built scripts outside `node_modules`).

Derived ids and the specifiers that import them keep the Babel splitter's format, which apps' chunk naming reads
(webpack/Rspack `chunkGroup.origins[].request`, Vite module ids): `identity.ts` alone prints and parses it. A split
group is `<path>?tsr-split=<a>---<b>` (the options sorted); the shared module, which main names `?tsr-shared=1`,
follows that style after a first key no route option has (`tsr-split=shared---<keys>`); Hydrate is
`?tss-hydrate=<id>`. An output imports another output of its file (and the
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
| `router`       | route option splitting (`placement.ts`), `deleteNodes`, route HMR     | `router-plugin/src/planners/router.ts` (`split.ts`, `hmr.ts`); runtime in `router-core/src/hmr.ts` and `{react,solid,vue}-router/src/hmr.ts` |
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
  `facts`, `edges`, `identity`, `verify`, `heap`), driven by toy planners and a `MemoryHost` (`helpers.ts`). Run
  `@tanstack/router-utils:test:unit`. `placement.test.ts` covers the placement's own mechanisms on toy plans (the
  toy splitter's `imported` makes a plan a route file): the `shared-writer` fallback, glue and renames, copies and
  imports of a chunk, the shared module, provenance, statement boundaries, type units, generated units and their
  anchors; what route files, handler modules and `<Hydrate>` chunks do for real plans is covered by the consumers'
  suites.
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
- `TSR_COMPILER_VERIFY=1`: after every compile, each emitted output is re-parsed and checked against the plan
  (`verify.ts`), independently of what placement believes: every output parses; no output assigns a binding it
  imports (a); a same-file import names a runtime export of its home (b); every surviving top-level statement is
  emitted once in its home and once per chunk that copies it, counting the source text an output renders, not a
  generated unit's own text (`Segment.gen`) (d); planner facts are JSON (f); no output reads a module binding of the
  source, or a generated one, it neither declares nor imports (g). A violation fails the compile. Every test run sets
  it (the shared run-directory setup and the core's own config); unset, it costs one boolean per compile. It is the
  one switch of the compiler's self-checks (`self-checks.ts`): set, the internal asserts run and a violated invariant
  throws; unset (users' dev servers, builds and their own tests), a violation is one `internal-invariant` warning for
  the module (an internal compiler error, please report it: the output may be wrong).
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
