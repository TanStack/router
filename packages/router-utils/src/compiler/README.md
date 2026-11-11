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
  `serverOnly` records server-only text of a client compile (a handler, a `.server()` implementation, a
  `createServerOnlyFn` body, a validator), with its placeholder when it has one. The core's orphan cleanup is the
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
  (`placement/reads.ts`) and the erased parts are the walk's visitors; the point questions (whether a byte renders,
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

### Reachability = splitting = dead-code removal (`reach.ts`, `placement/`)

Per output: roots → closure over _live_ value references (not inside removed ranges; type positions never keep
anything alive) at cluster granularity (a binding with all its writers and augmentations travels together) → the
units that output contains. `computePlacement` composes seven stages, each a function of what the previous ones
produced: `clusters` (clusters, the write table), `reads` (what each cluster reads per output,
`reach`), `roots` (the roots planners and the module declare, extraction candidates, provenance), `settle` (the env
roots, the slots and the extracted exports: one solver over the event table, `events`), `kept`, `homes` (homes, the single-writer
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
  clusters stay in the route module as written, and chunks import them where a build's chunks import them from the
  extracted module; a declaration a build copies into a chunk with the export reading it (a function or primitive)
  is imported from the route module in dev. Every decision but these homes is the same, so state and identity
  agree between dev and a build. An exported declaration a chunk needs that stays in the route module
  (effects, reassigned, read by the route module, reading what it keeps) is reported
  once per export with the reason (`eager-export:<reason>`), and so is an unexported declaration only split code
  needs that the movable rule below keeps (`eager-split:<reason>`: `needers`, several split outputs; `written`, changed
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
- **effects and mutable state**: statements and impure, still-referenced declarations evaluate once, in the env
  module unless the rules below move them, never duplicated or lost. One model (`mutation.ts`, `t1.mutation`) holds every write of a
  binding (assignment or member write, eager or lazy, wherever it is). A binding's writers when the module loads
  (a unit assigning it or writing a member of it, `const y = f(cfg.x = 1)`; an augmentation statement) are its
  cluster, so they evaluate wherever it does; a reader is a cluster of its own. A write of pure values to a binding
  its cluster declares (`Page.displayName = …`, `plugins.push(a)` on an array literal or a `new Map`/`Set`: a
  method of that name on another object is its own code, a call, R65; a link on a `const` holding a builder of a kind
  whose links write it, `RecognizerTable.builderLinksWrite`: a middleware's assign its options, a server fn's copy
  them and only read the builder; R139) is a write, not an effect: ordered against what touches that binding, nothing else. A
  write's owner is the evaluation holding it (its unit, or a claimed option value); one in a function that
  evaluation passes to a call (`track(() => { cfg.x = 1 })`) is also that evaluation's write at an unknown time,
  as when the function is named. The writes have two halves, each
  asked by one rule: a read evaluated at module load _observes mutable state_ when something outside the reading
  cluster writes the binding at an unknown time (inside a function; and code that evaluates with the module but
  runs later: an async or generator function invoked where it is written, an instance field's initialiser,
  `t1.runsLaterAt`), wherever both evaluate (V); and it is _ordered_ against a write when the module loads after
  it, judged on where both evaluate (O): the reader leaves the route module only for the slot the write evaluates
  in, in source order there (`const a = {}; const x = [a]; a.v = 1`, all three needed by one chunk, move
  together). An extracted export's module is unordered with the route module and the chunks, so for it a write
  there before the read conflicts too; only an extracted module it imports evaluates first. A read after the
  last write at load observes nothing and moves freely. "After it" compares positions where the code runs: a
  read inside a function an evaluation calls runs where that evaluation reaches it. What an evaluation runs has one definition, asked
  of each evaluation, never of the module (`ReadIndex.runs`, `visitRuns`): the references of its text in the env
  module (a region nested in it that the env module does not claim is its text; a claimed one evaluates with its
  owner) and, when it calls something, those of the functions it passes directly (`['x'].map((k) => n + k)`)
  and the text of the module's declarations its running references name and of the statements writing those names
  when the module loads (`handlers.count = () => n`: a call reaching `handlers` may run it), transitively (`n++`, `n += 1` and
  `n = v` count as reads: a cluster whose load assigns state, `init()` writing `mode`, is ordered like one
  reading it). A read through a name (`alias.v`, `{ ...alias }`, `const { v } = alias`, `'v' in alias`, and the same through
  any expression handing the name's value on: `(alias ?? {}).v`, `(on ? alias : null)?.v`, `[alias][0].v`) reads what that name's
  value holds when the module loads, transitively (`const alias = cfg`, `const holder = { cfg }`, `holder.c = cfg`:
  it reads `cfg`), so it is ordered against a write of the original. A member write through a name whose
  declaration does not create its value (`const alias = cfg; alias.v = 1`, `let cur = cfg`) or through a nested
  member (`holder.c.v = 1`, `holder[0].push(x)`) writes whatever that value may hold: it is a write of each of
  those bindings too (`cfg`), ordered against every read of them and joining their cluster when it runs at load.
  One owner answers both sides: the mutation model (`visitValues`, `objectsWrittenBy`). A method nested in an object argument
  (`defineComponent({ setup() {} })`) and a function it only holds (`const api = { getCached }`) run nothing, and a
  function declaration evaluates nothing. A claimed
  option value is such an evaluation too: one that calls something (`withPrefix(Page)`) reads what that call
  may run (`ordered-effect`). Outside the model (R97): a getter (`api.latest`, a destructured property),
  `toString`, a spread or an array pattern's iterator running user code, and writes through `this` or another
  module: the code they run is not seen to run at load.
  A reader of such state (V) never leaves the route module, pure or not, for a lazy output or an extracted export's module
  (`const initial = [n]` next to `function inc() { n++ }` keeps the source's `[0]`: an extracted module evaluates
  with the first chunk importing it once nothing imports it through the route file); an option value that reads
  one is kept in place (`ordered-effect`), unless that write is only its output's code (a function only that
  output holds) and the binding is confined there, the rule for an option value's writes at load (it evaluates in
  that output, and nothing else anywhere touches it). A write only an evaluation's own text makes (a function it
  passes to a call: `memo(function Page() { didInit = true })`, in an option value or a declaration alike), of a
  binding nothing else touches when the module loads, pins neither: it runs only through what that evaluation
  returns, never before it (`ownLate`). An effectful,
  unexported cluster moves with its only needer (lazy initialisation is allowed; within-module order is
  preserved) when nothing outside it writes it eagerly, it observes no mutable state, what it reads at load of
  another effectful cluster evaluates in the same slot (in source order there: `const columnHelper =
createColumnHelper(); const columns = [columnHelper.accessor('name')]`, both needed by one chunk, move together,
  R138) or is a `const` the route module keeps (whatever keeps it there; a `let` pins), imports are read lazily
  (the chunk loads after the route module). Effects have no order of their own (no order rule): what moves keeps
  its source order in its output, what stays its order in the route module, and code moves by the bindings it reads
  and writes. A call the model does not know writes nothing it is handed (`snapshot(table)` reads `table`). A
  bare statement (it declares nothing: a call, an assignment, an `if`/`try`/loop block) follows what it touches: the
  module bindings its text names and the objects their values hold (`MutationModel.heldBy`, the owner of "the
  object a binding names"); it moves into a chunk when every one of them goes to that chunk, a binding only it
  reads following it, in source order there (`const table = createTable(); const columns = snapshot(table);
  table.addColumn('x')`, only the component reading `columns`, all move), and stays in the route module when it
  touches an import (another module's object, which other code uses: `Sentry.init({ dsn })`, `i18n.use(backend)`)
  or a binding that stays or goes elsewhere (`placement/settle.ts`, followers). An effect it has outside what it
  touches (`registry.install()` patching `fetch`) then runs when the chunk loads. Both sides
  are judged on their slots in one fixed point (a demoted read cluster re-judges its reader). It
  never moves into an extracted export's module: that module is side-effect free (every bundler may skip it while
  nothing imports what it exports; the webpack-family hosts mark each one so), so an effect stays in the route
  module, which the extracted module imports it from. An exported binding whose writes at load are pure
  (`Page.displayName = …`, static props; `Page.x = track()` is an effect and keeps it in the route module) leaves
  for its extracted module with them, whatever effects surround it (chunks import an augmented export: its
  augmentation runs once). A cluster that writes what it declares at load takes its only lazy needer's slot (a
  reader before the write may evaluate there too); several needers give it a shared module, which its readers
  import (they evaluate after it; a reader before the write is judged as if it stayed, and keeps it).
  Every one of these
  rules is asked of the event table (`placement/events.ts`: each member's evaluation, what it touches through
  what it runs, its effect, the module's writes), and answers with the violated pair (the kind, the other event,
  the binding), from which the warnings are worded. The env roots, the slots and the extracted exports are one
  monotone fixed point (`settleRoots`): every round recomputes derived reach, env liveness and the slots (the
  evaluation-order condition is a greatest fixed point over them), demotes the effectful clusters and the readers
  of mutable state that stay and that some output needs to env roots, then cancels extraction candidates the env
  module keeps, that read at their evaluation a binding it keeps (a TDZ through the re-export cycle) or that
  observe mutable state. Each round that goes on demotes a cluster, so the rounds end within the cluster count;
  past it the compile fails naming the file. Nothing is rooted after homes are assigned. The time model is checked
  by running modules: the cases the executing placement property (a development tool kept outside the repository)
  found, running random modules and their outputs as ES modules, are static tests (`tests/placement.test.ts`). When a split would break single-writer or evaluation-order
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
  Placement's own judgement of a top-level evaluation (the unit model, `ModuleAnalysis.effectPurity`) adds rule L
  (`languagePurity`): a member read, a spread, `in`/`instanceof`, a call or `new` of a standard global
  (`Object.keys`, `new Set`, `Math.max`, `JSON.stringify`, `new Intl.NumberFormat`) and a method of what one returns
  or of a literal (`Object.entries(x).map(f)`), with pure arguments, are no effect; a function such a call is handed
  runs there, so an inline one's calls are judged the same way, a named one of the module too, and an imported one
  is an effect. Getters, proxies, iterators and `toString` stay outside the model, as for reads (R97). Rule L decides
  when code runs, never whether it is kept: what may be deleted (`effects()` of raw facts, function-scope orphans, the
  dead declarations placement drops: `ClusterGraph.runsCode`, `Tier1.deletionEffects`) still counts every operation
  that may run code or throw, and so does an extracted export's side-effect-free flag (`export const url = new URL(x)`
  moves to its module, which is not flagged).
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
  module without a summary, target facts, route registry digests, failed resolutions), and a `DependentsIndex` maps them back to plans. A row holds two facts: the
  key's published plan depends on the path (until it is evicted or replaced), and a compile of the key running now
  asked for it (until the key's last compile ends: two quick saves overlap). An event restarts the compiles that asked,
  and checks the published plan.
- `invalidate(caches, change, hosts)` is **the** invalidation operation: hosts call it for every file event they see
  (every hook, every environment) and for registry changes. Calls for one path run one after the other;
  `caches.settled()` resolves once none runs. The call returns nothing.
  - **Repeats are harmless.** The raw-facts cache keeps the revision of the text it read of each path (`seen`); the
    event reads the file once, and a change whose text is what the caches read (an echo, a touch, the same event
    through a second hook) marks no fact stale.
  - **An event is judged by the file as it is.** A removal of a file that reads back is an add, a change of one that
    reads nothing a removal, and a change of a path the caches hold nothing of that reads as a file an add. An event
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
    every `load` and `transform` again, so it builds every stale module (a tripwire test in
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
the webpack-family stale-set drain (`StaleSetDrain`: rebuilds at `finishMake`, a compilation for an idle compiler), eager extracted exports, emitted maps' text, the key of a persistent cache, a loader's
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
  output, every surviving effect statement is emitted exactly once across
  the outputs that import from the env module, an extracted export's module never reads a binding of the env
  module at its evaluation, and no output reads a module binding of the source or a generated binding it neither declares
  nor imports, and no two extracted modules import each other. A violation fails the compile. Every test run sets it (the shared run-directory setup and
  the core's own config); unset, it costs one boolean per compile. It is the one switch of the compiler's self-checks
  (`self-checks.ts`): set, the internal asserts run and a violated placement invariant (`homes.ts`, `inclusion.ts`)
  throws; unset (users' dev servers, builds and their own tests), they are still checked and a violation is one
  `internal-invariant` warning for the module (an internal compiler error, please report it: the output may be
  wrong).
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
