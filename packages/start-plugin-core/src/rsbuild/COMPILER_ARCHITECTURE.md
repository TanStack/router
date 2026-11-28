# Rsbuild compiler architecture

How TanStack Start's compiler runs on Rsbuild (Rspack): one compile per (compile environment, module) on the shared
compiler core (`@tanstack/router-utils/compiler`, [README](../../../router-utils/src/compiler/README.md)), through Start's own Rspack loaders.

## Files

- `start-compiler.ts` registers everything on the Rsbuild plugin API: the session (one per Rspack compiler the
  instance creates: a second `build()` of the instance configures a new compiler and starts from nothing; a second
  production run of one compiler, a program's `run()` of the compiler of `createCompiler()` again, starts its
  bundler-free session over: `beginRun`), one `pre`
  loader rule per Start environment, the late `post` pass for other module types, the rule of import-protection edge
  modules (in development, the loader's `edge` pass), the `sideEffects` rules, the host plugin of each environment
  compiler, the client route tree transform.
- `compiler-session.ts` is the state every environment compiler shares around the bundler-free Start session
  (`../compiler/session.ts`, also Vite's: compiler caches, raw facts, import protection, the server-function registry
  and id allocator, the planners and configuration per compile environment, the reporting policy): the compile
  environments of each compiler (`envOf`, the one reader of a module's Rspack layer), the loader implementation, the
  invalidation operation, the resolver module content. It owns a compiler's production runs (`beginRun`, from each
  environment compiler's `run`, whoever runs it: Rsbuild dispatches its build hooks only in `build()`): the first
  compiler to start a run generates the routes once for all; a run after another begins with a new bundler-free
  session, as a new process does (no file events come between two runs: an earlier run's facts, plans and released
  `allowImport` grants are not this run's).
- `vue.ts` holds the Vue rules: the late pass over an SFC's script block under vue-loader's inline match resource
  (`x.vue.js?vue&type=script…`, which neither the `pre` rule, before vue-loader, nor the `.vue` late rule reads), a
  rule registered next to the late rule in every configuration (only vue-loader requests such a module, however it is
  set up: `@rsbuild/plugin-vue`, `tools.rspack`, a plugin of its own); and the late loader's single run per module
  (vue-loader's pitcher copies a block's loaders into its own request, which the configured `post` rules match again:
  a late loader that runs again later in its chain passes through).
- `compiler-loader.ts` is the static loader file Rspack loads by path; the implementation lives on the compiler
  (`compiler.__tanstackStartCompiler`, named in `loader-registry.ts`), installed by the host plugin. A child compiler
  (a worker or service-worker plugin's) takes its environment's module rules but none of its plugins: the loaders find
  the implementation on its `root`, so its modules compile as the environment's.
  The loader is raw: a module it does not compile goes on as the bytes it came as (a binary file with a JavaScript
  extension, imported as an asset, stays intact); it decodes only to compile.
- `asset-query-loader.ts` is a pitch-only loader on ids with an asset query (`x.server.ts?raw`): a denied file's mock
  replaces it before it is read; any other file is left untouched, its bytes never decoded.
- `server-fn-resolver-rebuild.ts` builds the server-function resolver again when the module was built from another
  content than the current one (rule 3; a rebuild brings the provider modules it reaches, which may declare
  functions): the resolver's part of each round of the host plugin's `finishMake` closure.
- `manifest-rebuild.ts` builds the Start manifest module again at the server compiler's `finishMake` (stage 10) when
  it was built from another manifest than the one written last (rule 3), in every mode: Rspack's watcher ignores
  `node_modules`, so a write alone never builds it again, and a persistent cache can restore it from an earlier
  build's manifest.
- `generated-module.ts` is rule 3 for the modules Start generates (the client route tree, the resolver, the
  manifest): the digest of the content each was built from, on the module and in a per-compiler index.
- `module-record.ts` names where the parts of a module's record live in `buildInfo` (rule 1): each part a field of its
  own, the plan one string.
- `host-plugin.ts` holds the Rspack hooks of one environment compiler (below).
- `router-generator.ts` runs the route generator and serves the client route tree without its server-only routes; the
  tree transform depends on the files of the routes it left out, which no client module imports (an edit that makes
  one a page compiles the client again). A production run generates once for its environments, in the run's start
  (`beginRun`, at the environment compilers' `run`, after Rsbuild's own tap, which awaits `onBeforeBuild`); a watch
  compilation generates in its `watchRun`.
- `virtual-modules.ts` owns the pure virtual modules (manifest, server-fn resolver, adapters, RSC runtime and HMR)
  and the import-protection edge module files, under `<root>/node_modules/.virtual/`.

## The four rules

The host keeps what a compile leaves besides the module (its record, the registry, the generated modules, the
warnings) by four rules. Each fold reads the modules a compilation **holds**: those a connection from no module (an
entry, an include, a container) or an RSC client-reference connection reaches, directly or through their importers
(`rspackHolds`). `compilation.modules` is not that set: it also lists what a rebuild in place left unreachable and
what a watch-written cache restored.

1. **A module's record is what the loader served**, written once per loader run at its exit
   (`StartRsbuildCompilerSession.record`, the session's sink: the loader hands each module to
   `StartCompilerSession.transform`, which calls the sink with every answer's outcome, current or not, before the
   commit of a current one): compiled and served as it is (its plan, when the cache outlives the
   process, its server functions, the warnings its compile found, a package's Start use, import protection's record);
   served as its mock (the same, without server functions); not compiled (served as its bytes: nothing, and what an
   earlier compile left is removed, import protection's record included); failed (its located errors only). The asset
   and edge passes write through it too. A provider module (`?tss-serverfn-handler`, `?tss-serverfn-split`) always
   records what it provides, also nothing: an empty provider and one not built yet are different facts. One index
   (`recorded`, by resource and instance: the host's, as long-lived as the compilers' modules, not the session's
   committed-id set, which holds current commits only) says which modules' `buildInfo` holds a record, with three
   sub-indexes for its readers (`fnModules`, `warned`, `packageUses`), pruned with the plans (`retain`) and restored
   from `buildInfo` on a cache restart (`noteRestored`). A compile overtaken by a newer one of the same id (not
   `current()` when its record is written: the module's request stays open until then) takes nothing out of the index.
2. **The registry is derived at settlement from the modules the compilation holds, by one writer**
   (`deriveServerFns`; the session's `serverFnsAtSettlement`: on this host a compile registers nothing, Vite is
   unchanged). It runs at `finishMake` stage −20, after the drain, and in a closure round that follows builds (the last
   run derives again when a loader ran since: `loaderRuns`). A function needs a real caller: a defining module declares
   its functions when an entry reaches it without passing the server-function resolver (Start's own module, which
   imports the provider of everything it lists); a provider is admitted when something asks for its file's functions
   (an admitted defining module, a child compilation, the client's stubs: `clientReferenced`), and what an admitted
   provider imports grounds further modules, until nothing changes. Where the compilation holds a provider built, what
   it provides is the file's (an empty one withdraws them). In a compiler without the resolver (the client) a module
   counts when it is held. So a function whose last caller left leaves the registry although the resolver still
   imports its provider, and the closure builds the resolver without it.
3. **A generated module is as current as the content it was built from**, and each compiler knows what it wrote into
   its own virtual file system. Start's loader records on the client route tree, the resolver and the manifest the
   digest of the bytes it builds each from (`generated-module.ts`); at `finishMake` a module is built again only when
   that differs from the current content, read from a per-compiler index or, for a module the index does not know
   (restored, a child's), from the compilation once. `virtual-modules.ts` keeps per environment what the current
   compiler's virtual file system holds (its initial content, then each write; reset when a new compiler is
   configured) and writes only a content that differs. A restored module built from the current content is an
   ordinary cached module: nothing builds it again (an app transform on the route tree runs when the tree is built).
4. **A compilation's warnings are added when it seals, from its held modules' records, and one current compilation
   carries each**: the loader emits none. At `finishModules` a compilation gives the session each warning a held
   module's record has and the "does not declare Start" warning of each package with a held module that uses Start
   (against the package's current manifest, `packageUseWarning`). The session adds it to the compilation then, before
   it emits (an app plugin that reads a compilation's warnings after the seal sees it), unless a current compilation
   of any compiler carries it already (`warn`). Rsbuild prints the last compilation of each compiler once all are
   done, one that did not compile again included, so every report has each warning once, whichever compilers a
   rebuild ran and in whatever order; a build remembers nothing from one report to the next. A compilation that is
   replaced takes nothing with it: when a compiler finishes (`done`, before Rsbuild formats a report), a warning
   whose carrier was replaced goes to a current compilation that holds the module (`finishWarnings`). A dev server
   also counts a warning as reported once Rsbuild printed its compilation (`onDevCompileDone`): once per dev
   session. A child compilation (a worker's), which Rsbuild does not print, gives its modules' warnings on behalf of
   its owner, and they are added to the owner's compilation: nothing depends on what a worker plugin does with a
   child's own warnings. A child's modules the persistent cache restored are indexed as the compiler's own are.
   The host's own reports take the same path (`warn`, keyed on their text): a custom server function id's error
   (`processAssets`, returned on every allocation) and a closure that cannot settle (an error in builds, a warning in
   dev servers). A deprecated custom id's warning goes there too, but the allocator returns it only when it allocates
   the id (once per session), so it has no "once in every report" (KNOWN-BUGS). No reset is keyed on a compiler's
   `watchRun`: a `build --watch` rebuild of the server alone reports what applies.
   Import protection's dev reports keep their own reporter.

## One compile per module

The loader runs for every JavaScript/TypeScript id of an environment, derived ids included (`?tsr-split=`,
`?tss-hydrate=`, `?tss-serverfn-split`, `?tss-serverfn-handler`): each id compiles from the text Rspack hands it, derived ids hit the plan of
their file at the same revision. The planners run in the core's fixed order: `start-env` (server functions,
environment separation), `hydrate`, `rsc-css` (the `rsc` environment's modules), `router` (every other environment; route
HMR in the development client), `import-edges` (import protection). The loader composes its source map with the input map, names the absolute file
as the map source, writes the module's record into `module.buildInfo` (rule 1), and fails the module on an error
diagnostic. A module depends on no file but its own
(Rspack builds it again for a change of its file only): the compiler's invalidation decides which modules a change
makes stale (see "Development invalidation"). The analysis resolves through the resolver a loader's `getResolve()`
gives, asked outside the loader (whose resolve context records every file it looks at as a dependency); its answers
are memoised until a file appears or disappears.

Dependency modules under `node_modules` that import protection does not check are passed through without a parse
when their text names nothing the planners recognise (`compiler/scope.ts`, the rule the Vite host shares).

## Compile environments and layers

A Start plan belongs to a compile environment: its key names the state (plans, stale sets, the resolution memo,
import protection's edges, ledger and records, registry snapshots, edge keys, the configuration digest), its type is
the Rsbuild environment's, and one host compiler builds its modules (its resolver, input file system, virtual files,
watcher and drain entry stay the compiler's: `CompilerState`). Each Rsbuild environment is one: `client` and `ssr`;
without RSC the `ssr` environment is the server-function provider. With RSC the server compiler builds a second one,
`rsc`: the modules of the `react-server-components` layer, where server components render and which provides the
server functions (their provider modules are the `?tss-serverfn-split` derived outputs of their files, placed in the
layer by the resource-query rule, with the `react-server` conditions and the `'use server-entry'` directive). The
`rsc` environment's modules get the RSC CSS planner, and no router planner runs there (its route modules stay
unsplit, as in Vite's provider environment); they resolve with the layer's rule options. Reports and import
protection's callbacks name it `rsc` (`info.env`, `envType: 'server'`), as on Vite. A module of the
`server-side-rendering` layer, or of none, is the `ssr` environment's; any other layer (a user's rule) is an
environment of its own (`<compiler>:<layer>`), which resolves with the compiler's base options (a rule's own
`resolve` does not reach the compiler's resolver) and which reports name after its compiler. Its key names it, so a
persisted edge-module request of a restored importer finds it before any module of the layer was seen
(`envOfKey`). An import-protection edge module belongs to the environment its id names, whatever layer a user's rule
puts the file in (`envOfModule`: an `.mjs` rule's), for the loader, the chunk-list reader and the graph. A file both layers
compile is a module of each environment, with its own plan, import-protection records, stale-set entry and
registry snapshot: every operation of the host groups modules by environment before it deduplicates by resource
(the drain, the restore, the chunk-list reader, the graph, `hold`, the served ledger's rebuilds, the snapshots, the
warnings). Import protection reads one graph per compilation (`rspackNodeGraph`, built on its first read):
a node is a module of one environment, and its importers are nodes of their own environments (an issuer-layer
rule: an SSR-layer module importing the RSC layer's server-fn module; a user's rule moving an imported file to its
layer), so a walk goes on through the module it reached, and an entry is an entry of its environment only. An entry
is a module the compilation holds by itself: a connection with no origin module arrives at it (config and named
entries, an unnamed `EntryPlugin`, `addInclude` with or without an entry, a child compilation's entry); a module with
no importer and no such connection is not in the app, so it supports nothing (design-rsc-phase1-settlement.md
amendment 3). The
`rsc` environment declares where its client references render (`clientReferencesInto: 'ssr'`): Rspack's RSC plugin
adds the SSR-layer module of a `'use client'` file a server component imports, with no importer of its own, and the
server component's import of it (recorded in `rsc`, never substituted) is how SSR gets it.

## Server functions

A compile reports the server functions of its module in plan facts, which the loader records with the module as it
serves it (rule 1; Rspack persists the record with the module). The registry is derived from the records of the
modules the compilation holds, built now or restored, and of its child compilations (done during `make`), at
`finishMake` (stage −20) and in the closure (rule 2), and the resolver virtual module is rewritten;
at stage −10 the host plugin closes the compilation (on the server compiler, before the RSC plugin's client handoff at
stage 0), and again at the last stage (`0x7fffffff`: what a plugin added since, a provide-shared module's, is judged;
once the last `finishMake` tap returns the compilation's modules are final), in rounds of one loop, until a round
builds nothing: the registry is derived again after a round that built, the resolver module itself is built again
when it was built from another content (`server-fn-resolver-rebuild.ts`), the records of what the compilation no
longer holds are forgotten, and
import protection's settlement (below) builds again the modules served otherwise than a fresh build of the source
serves them. Each step can add modules the other must see (a provider's imports; a module built real defines server
functions). No count bounds the loop: the settlement builds a denied module as its real module at most once (builds
as its mock are not counted: a module that left and came back is a new module, with a new guess), and the resolver's
content only grows; a module asked for as its real module a second time, or a resolver content seen before in the
closure (its differing functions named by id and provider), ends it naming the history, shared by the compilation's
two runs (a module whose imports differ between two builds of one source): a build fails, a dev server warns (the next edit starts a new closure), our test runs throw. The resolver is a manifest importing each provider module; production builds
whose SSR environment is the provider list only client-referenced functions (the client compiles first:
`MultiCompiler.setDependencies`). When the SSR environment is the provider, every module defining server functions
has a `?tss-serverfn-handler` derived module (its lazy module), which the resolver imports and which re-exports each
server function's `createServerRpc` wrapper (R158). The module keeps a server function's chain only when its own
remaining code names it; otherwise the lazy module holds the chain. Handlers move into the lazy module, loaded once on
the first call (direct or through the resolver): what only handlers read loads then, but a declaration whose
evaluation reads, by name, something the module keeps stays and runs at load; what the module keeps is imported back
(one instance, R157). A handler that assigns a binding the module keeps, and the handlers of a module that awaits at
its top level, stay in place. A split route chunk's copy of a server function is a caller (R159): the chain with its
middleware and without its validator, `createSsrRpc(id)` as its handler, calling the one instance through the
resolver. Custom ids (`generateFunctionId`) are placeholders in the outputs, allocated per
rank (client first) and patched at `processAssets` before minification. The HTTP-callable functions (R182) are the
client build's publication (`StartCompilerSession.publishClientOutput`, at the client's report stage, on the emitted
JS): the functions whose default id, or with a generator whose gate token (`gateToken`, which the client stub passes and
the runtime stores on the RPC), is in the minified code. The resolver prints its gate from it; an RSC build's first
resolver precedes the client, and the server's last settlement run builds it again from the publication (on Vite the
provider builds once, before the client: the caller environment, built after it, fails the build for a function the
publication calls that the provider's resolver did not list, `callableNotProvided`). What that
last run builds comes after the RSC plugin's client handoff: a client component only a server fn it builds renders is
missing from the client manifest Rspack delivers, and the build does not say so (KNOWN-BUGS, the nested chain;
rspack#16786).

## Import protection

Edges are judged in the plan (per output, with the raw specifier the user wrote; file and marker rules on the
resolved target), and as what Rspack loads: the rewritten specifier and its target, for Rsbuild's
`source.transformImport` and for a request with inline loaders (`!!raw-loader!./x.ts` loads `./x.ts`). A violation substitutes the
specifier with a per-edge mock module written as a virtual file of the environment. In development a violation is
pending until Rspack builds its edge module, which it does only for an import the importer kept after SWC: the
loader's `edge` pass asks `allowImport` (also in builds, when one is configured) and confirms it. Reports are printed at `finishModules`, when the module graph
knows the importer's trace. At `finishMake` the records of modules restored from the persistent cache are replayed; a
module whose record is of another version (an earlier build wrote the cache) is built again instead, and so is a
module or an edge module another session judged, so `allowImport` answers in this session, and so is a
module compiled as its own violation that a restored exempt importer imports (its edges were replayed after the module
compiled: the importer gets the real module). The verdict on a module compiled as its own violation is settled at
`finishMake` (stage −10, in the closure with the server-fn resolver's rebuilds, which bring the provider modules and
what they import, and before the RSC plugin's client handoff at stage 0) from the edges that arrive at it in the
compilation's graph, each read with its own environment's records (a client-reference import replayed from a
restored importer is asked there), over every compile environment the graph has in that round. It is the least
solution (`ImportProtection.ground`): a denied module is real exactly when an exempt or allowed import arrives at it
from a module an entry reaches without passing a denied module that is not real, so dev and watch rebuilds serve
what a fresh build of the same source serves (a cycle with an exempt barrel does not keep itself real). The
type-wide grant (R96: an allowed import of the file in an environment of its type) counts a live environment's
importer only when it is reached so too (a cycle whose barrel's import `allowImport` allows does not keep itself
real either); a released environment's grant and `allowImport` on the file itself are constants. The graph is
the compilation's and its child compilations' (a worker plugin's): a child's module is in it, reached from its
entry, but only the compilation's own modules are decided. Every compilation settles the modules it builds: a child
compiler runs these `finishMake` taps on its own compilation, whose closure reads the child's graph (its entry, its
imports: what a build of the child alone gives) and builds its own modules again (the resolver, `hold` and the
restored edge modules are the compiler's state). A module's verdict is compared with what that module was built as
(its `buildInfo` record), not with the environment's ledger, which another compilation's module of the file writes
too. A module the settlement serves otherwise is built again and serves the settled verdict until the next
settlement (a compile before it guesses from its own environment's edges); a child compiler cannot load a mock, so
lowering a child's module fails the build with its violation, which the child's closure reports with its trace in
the child's graph (the request comes while modules build, when Rspack's graph cannot be read, and the records may
hold an import the bundler dropped). A child's requests are reported into the compilation of the compiler that runs
the child, and nowhere else: a child that ends without its closure (another plugin's `finishMake` tap failed) has
them reported by that compilation's next closure or, after it, at its end (`done`; `failed`, which cannot wait: the
compiler's next run and its close wait for them); a child it runs after its end (a later `done` tap) reports them as
it makes them, with the records' trace.
A module's records (edges, violations,
verdict) are written by its compile, a cached plan's as a fresh one's (the edges are in the plan's facts), and
forgotten once the compilation and its children no longer hold it. In development the
module's own violation is reported once its verdict is final, at `finishModules`; its compile reports nothing but,
under `behavior: 'error'`, fails the module.
In builds
the mock is what the build reads: at `processAssets` the host reads which edge modules the chunk graph holds, tells
`onViolation` once per surviving import and publishes the reports. An edge `allowImport` allows is a transparent
re-export from the start.

## Development invalidation

Each environment compiler forwards its own file events to the compiler core's invalidation, which compares the file
with what the caches read (another compiler's event of the same change is a repeat and changes nothing) and puts the
files of the plans it finds stale in each compile environment's stale set. The session keeps no record of the events. An edit
or a removal of a file the last compilation read is forwarded at `watchRun` (a file's facts need no resolver, and a
resolution that found a removed file is stale); a created file at `make`, once Rspack's resolver forgot what it found
in the last compilation (a file that appeared takes the resolutions it shadows). At `finishMake` (stage −20, after the
client route tree's rebuild) each compiler takes the stale sets of its compile environments and builds again in place
the modules whose own environment's set holds their file (`rebuildModules`; the twin of a file in the other layer is
not built), in the compilation of the event: an edit's, a creation's and a route change's dependents alike.
What becomes stale after that (another environment's event, a registry change, a compile overtaken) is built by
another compilation: after every compilation (`afterDone`, once Rspack marked the compiler idle) and after a registry
change, each idle compiler with a non-empty set is asked for one, at most three in a row without a file event or a
registry change of its own (a module whose rebuild finds itself stale again waits for the next event): router-utils'
`StaleSetDrain`, which the router plugin's webpack-family host uses too. Under RSC a
server compilation's event puts the client's dependents in its set before the coordinator starts the client
compilation, which drains them (Start starts none beside it).
A dependent is built after the file whose event made it stale (in `make`, the drain at `finishMake`): a module edited
to be marked is built while its unchanged importer's plan still imports it. Import protection reads the stale sets
(`useStaleImporters`, Rsbuild only): an importer whose plan is stale in the environment explains the module's presence, so the module
is served as its mock without a report and is stale itself; the importer's rebuild reports the import (or allows it),
and the module's own rebuild after it reports the module if something else still brings it.
A dev server started again on the persistent cache checks, at its compilers' first `finishMake`, the plans persisted
with the modules the cache restored: a module whose plan read facts that changed meanwhile (or another configuration's
plan) enters the stale set, built by the same drain; the others' plans join the session's invalidation.
A route-registry change (the generator published new route ids) evicts the plans of the files concerned and puts them
in every environment's stale set; the session listens once for all its compilers. The generator runs once before a
production build and before each watch compilation, with the compiler's file events (and its own watcher for files
outside the bundle); the client compiler builds its tree module again at `finishMake` (stage −30) when it was built
from another tree than the one served now (rule 3: the client's pruned route set changed without the tree file
changing; a module the cache restored from the current tree is current). A child compiler (a worker) builds a tree
module of its own, which says nothing of the client's.
