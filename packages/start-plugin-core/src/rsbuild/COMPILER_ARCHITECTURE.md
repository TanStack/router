# Rsbuild compiler architecture

How TanStack Start's compiler runs on Rsbuild (Rspack): one compile per (environment, layer, module) on the shared
compiler core (`@tanstack/router-utils/compiler`, [README](../../../router-utils/src/compiler/README.md)), through Start's own Rspack loaders.

## Files

- `start-compiler.ts` registers everything on the Rsbuild plugin API: the session, one `pre` loader rule per Start
  environment, the late `post` pass for other module types, the rule of import-protection edge modules (in
  development, the loader's `edge` pass), the `sideEffects` rules, the host plugin of each environment compiler, the
  client route tree transform.
- `compiler-session.ts` is the session every environment compiler shares: compiler caches, raw facts, import
  protection, the server-function registry, the planners and configuration per environment and layer, the loader
  implementation, the invalidation operation, the resolver module content, custom server-function ids.
- `compiler-loader.ts` is the static loader file Rspack loads by path; the implementation lives on the compiler
  (`compiler.__tanstackStartCompiler`, named in `loader-registry.ts`), installed by the host plugin.
- `server-fn-resolver-rebuild.ts` rebuilds the server-function resolver within `finishMake` while its content still
  changes (each rebuild may register the functions of the provider modules it reaches; bounded).
- `host-plugin.ts` holds the Rspack hooks of one environment compiler (below).
- `router-generator.ts` runs the route generator as a precondition of every compiler and serves the client route
  tree without its server-only routes.
- `virtual-modules.ts` owns the pure virtual modules (manifest, server-fn resolver, adapters, RSC runtime and HMR)
  and the import-protection edge module files, under `<root>/node_modules/.virtual/`.

## One compile per module

The loader runs for every JavaScript/TypeScript id of an environment, derived ids included (`?tsr-split=`,
`?tss-hydrate=`, `?tss-serverfn-split`, `?tss-serverfn-handler`): each id compiles from the text Rspack hands it, derived ids hit the plan of
their file at the same revision. The planners run in the core's fixed order: `start-env` (server functions,
environment separation), `hydrate`, `rsc-css` (modules of the RSC layer), `route-split` (every layer but the RSC one),
`route-hmr` (the development client), `import-edges` (import protection). The loader composes its source map with the input map, names the absolute file
as the map source, `addDependency`s every file the plan depended on, writes the module's server-function facts and
import-protection records into `module.buildInfo`, and fails the module on an error diagnostic.

Dependency modules under `node_modules` that import protection does not check are passed through without a parse
when their text names nothing the planners recognise (`compiler/scope.ts`, the rule the Vite host shares).

## Environments and layers

`client` and `ssr`; the `ssr` environment is the server-function provider. With
RSC, server-function provider modules are the `?tss-serverfn-split` derived outputs of their files, placed in the
`react-server-components` layer by the resource-query rule (with the `react-server` conditions and the
`'use server-entry'` directive); every module of that layer gets the RSC CSS loader, and no router planner runs there
(its route modules stay unsplit, as in Vite's provider environment). A file compiled in two layers is two modules with
two plans (the layer is part of the plan configuration).

## Server functions

A compile reports the server functions of its module in plan facts; the loader stores them in
`buildInfo['tanstack.start.serverFns']`, which Rspack persists with the module. At `finishMake` (stage −20) the host
plugin rebuilds the environment's snapshot from every module of the compilation (built now or restored from the
persistent cache), the session rebuilds the registry from all snapshots, and the resolver virtual module is rewritten;
at stage −10 the resolver module itself is rebuilt while its content changes (`server-fn-resolver-rebuild.ts`). The resolver is a manifest importing each provider module; production builds
whose SSR environment is the provider list only client-referenced functions (the client compiles first:
`MultiCompiler.setDependencies`). When the SSR environment is the provider, a module defining server functions keeps
their chains and `createServerRpc` exports, and its handlers move into its `?tss-serverfn-handler` derived module,
which it imports once on the first call (direct or through the resolver): what only handlers read loads then, and
what the module itself needs stays in it and is imported back (nothing evaluates twice). A handler that writes state
its module reads, and the handlers of a module that awaits at its top level, stay in place. Custom ids (`generateFunctionId`) are placeholders in the outputs, allocated per
rank (client first) and patched at `processAssets` before minification.

## Import protection

Edges are judged in the plan (per output, with the raw specifier the user wrote; file and marker rules on the
resolved target, which for Rsbuild's `source.transformImport` is the rewritten target). A violation substitutes the
specifier with a per-edge mock module written as a virtual file of the environment. In development a violation is
pending until Rspack builds its edge module, which it does only for an import the importer kept after SWC: the
loader's `edge` pass confirms it and asks `onViolation`. Reports are printed at `finishModules`, when the module graph
knows the importer's trace. At `finishMake` the records of modules restored from the persistent cache are replayed; a
module or an edge module another session judged is built again first. In builds
the mock is the survival witness: at `processAssets` the host reads which edge modules survived tree-shaking, asks
`onViolation` once per surviving edge, switches vetoed edges to transparent re-exports and asks Rspack for an
additional pass until no new veto appears; reports are published on the final pass.

## Development invalidation

`watchRun` runs the one invalidation operation of the compiler core once per logical change (the environment compilers
of one watch cycle report the same modified and removed files; the session dedupes them by path, kind and mtime) and
bumps `fileSetVersion` so recorded resolutions are re-asked once; Rspack rebuilds the modules whose recorded
dependencies changed, and a module whose plan's fingerprints are unchanged is emitted again from the cached plan
(outputs are not memoised).
A route-registry change (the generator published new route ids) evicts the plans of the files concerned; Rspack sees
no file event for them, so each environment compiler is told they changed (`invalidateFiles`) and builds them again,
rules re-matched, at the compilation it starts. The generator runs before each compilation with the compiler's file
events (and its own watcher for files outside the bundle); when the client's pruned route set changes without the
tree file changing, the client compiler rebuilds the tree module at `finishMake`.
