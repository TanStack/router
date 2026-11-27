# Rsbuild Compiler Architecture

This document explains the TanStack Start compiler integration for Rsbuild and Rspack. It focuses on server-function discovery, Rspack cache interaction, and the resolver virtual module.

## Goals

The Rsbuild integration has to do three things at the same time:

- Compile Start-specific source patterns such as server functions, isomorphic functions, middleware, and compiler virtual modules.
- Keep server-function metadata available when Rspack restores modules from its persistent cache and skips transforms.
- Generate the `#tanstack-start-server-fn-resolver` virtual module after the server-function registry is complete for the current compilation.

The important point is that server-function discovery is a side effect of compilation. If Rspack restores a transformed module from persistent cache, the transform side effect does not run. We therefore store the discovered metadata on the Rspack module itself and replay it from `module.buildInfo`.

## Main Files

- `plugin.ts` wires the Rsbuild plugin phases, virtual modules, RSC hooks, compiler ordering, and resolver rebuild hooks.
- `start-compiler-host.ts` creates the compiler in Rspack `apply`, registers the loader, captures server-function metadata, and replays cached metadata.
- `start-compiler-metadata.ts` defines the persisted server-function metadata field and type.
- `start-compiler-loader.ts` handles virtual modules, filtering, compilation, source maps, and writes metadata directly to the current module's `buildInfo`.
- `virtual-modules.ts` owns the resolver virtual module and writes updated virtual module content per Rsbuild environment.
- `../start-compiler/handleCreateServerFn.ts` discovers server functions while compiling caller modules.
- `../start-compiler/server-fn-resolver-module.ts` generates the resolver module from the current server-function registry.

## Environments

Start registers compiler work for each Rsbuild environment that can affect server-function metadata:

- `client` discovers functions referenced from browser code and marks them client-accessible.
- `ssr` discovers functions reachable from the server-rendered route graph.
- A separate provider environment is included when server-function providers are not compiled in `ssr` and RSC is not enabled.

The shared registry is `serverFnsById`. It is passed to `virtual-modules.ts`, which uses it to generate resolver module content.

## Cold Transform Path

`registerStartCompilerTransforms()` registers a real pre loader through `modifyBundlerChain` for each Start compiler environment.

When a matching module is compiled normally:

1. Rspack runs the Start compiler loader in the pre-loader phase.
2. The transform checks compiler virtual modules first.
3. It runs cheap code filters to skip files that cannot contain Start compiler patterns.
4. It uses the environment's `StartCompiler`, created in the Rspack plugin's `apply`.
5. It detects which compiler features are present in the current code.
6. It serializes access to the per-environment `StartCompiler` through `runCompilerTask()`.
7. It calls `compiler.compile({ id, code, detectedKinds })`.
8. During compile, `handleCreateServerFn()` reports discovered server functions through `onServerFnsById`.
9. The loader writes the discovered server functions directly to `this._module.buildInfo[SERVER_FN_BUILD_INFO_FIELD]` and returns code with composed source maps.

The compiler receives the full `this.resource`, including queries. Compilation and metadata writes happen in the same loader invocation, with no pending metadata map.

## Server-Function Discovery

Server functions are discovered in caller modules, not in provider modules. In `handleCreateServerFn()`, each discovered function records:

- `functionName`, the generated handler export name.
- `functionId`, the stable server-function ID.
- `filename`, the caller module ID.
- `extractedFilename`, the provider module ID with the server-function split query.
- `isClientReferenced`, whether client-origin calls are allowed.

`onServerFnsById` merges discoveries into the shared `serverFnsById` registry. While a compile task is active, it also merges the same discoveries into that module's `activeServerFnMetadata` object. After compile finishes, that object becomes the metadata payload for the module.

Per-environment compiler tasks are serialized because `StartCompiler` owns mutable module caches and because `activeServerFnMetadata` must only describe the module currently being compiled in that environment.

## Loading And Resolving Modules

The compiler sometimes needs to read or resolve imported modules while compiling a source file.

`start-compiler-host.ts` uses two native Rsbuild/Rspack surfaces for this:

- `ctx.resolve()` from the active Rspack loader context resolves module IDs.
- `compiler.inputFileSystem` reads source through Rspack's input filesystem.

An `AsyncLocalStorage` value binds `loadModule` and `resolveId` back to the active loader context. That lets the compiler add dependencies to the current Rspack module without reaching into Rspack private resolver internals.

## Why A Real Loader Is Used

Rsbuild `api.transform()` is implemented as a loader, but its callback only exposes the transform context. It does not expose the current `NormalModule` or `module.buildInfo`.

Rspack persists custom `module.buildInfo` fields. Start replaces `api.transform()` and the separate metadata loader with one pre loader:

1. `start-compiler-host.ts` registers the rule in `modifyBundlerChain`, preserving pre-transform ordering.
2. The rule points to the emitted `start-compiler-loader.js` file.
3. The loader checks virtual modules, filters code, detects kinds and invokes the host's queued compile callback.
4. The loader writes metadata directly to `this._module.buildInfo['tanstack.start.serverFns']`, then returns code and the composed source map.

Only string-keyed, JSON-serializable `buildInfo` fields are used. Rspack persists those fields with the module cache. Symbol keys and private cache internals are intentionally avoided.

## Cache-Enabled And Cache-Disabled Behavior

The compiler loader is installed regardless of `performance.buildCache`.

When persistent cache is enabled, Rspack may later restore a module without rerunning the compiler loader. The `buildInfo` payload is then replayed from the cached module.

When persistent cache is disabled, the same loader path still runs during normal compilation and writes in-memory `buildInfo`. Keeping one path avoids conditional behavior and keeps cold, watch, cache-disabled, and cache-enabled builds aligned.

The cache-specific part is not the loader itself. The cache-specific part is that Rspack can persist and later restore the `buildInfo` field.

## Stale Metadata Clearing

If a module previously contained server functions and then no longer produces metadata, the compiler loader writes an empty payload:

```ts
{ version: 1, serverFnsById: {} }
```

This prevents stale server-function entries from surviving on a cached module's `buildInfo` after a file edit removes or renames server functions.

## Warm Cache Replay

Each relevant compiler installs a `finishMake` hook at stage `-20`.

At that point Rspack has built or restored the module graph for the environment, and module `buildInfo` is available. The hook:

1. Iterates over `compilation.modules`.
2. Reads `module.buildInfo['tanstack.start.serverFns']`.
3. Validates the payload with the versioned schema.
4. Merges valid module metadata into an environment snapshot.
5. Stores the snapshot in `serverFnsByEnvironment`.
6. Rebuilds the shared `serverFnsById` registry from all environment snapshots.
7. Notifies virtual modules that resolver content may have changed.

The shared registry is rebuilt from snapshots instead of being append-only. This is what lets deleted or renamed server functions disappear after watch rebuilds or warm-cache restores.

## Why Snapshots Are Per Environment

Each Rsbuild environment can see different information for the same file. For example, client and SSR caller environments can mark functions as client-accessible, while server and provider environments own server execution details. The merged registry preserves the broadest known access information.

A single global replay pass would either drop another environment's metadata or keep stale metadata too long. The model is therefore:

- Build one current snapshot per environment.
- Replace the shared registry with the union of all available snapshots.
- Regenerate resolver content from that shared registry.

This keeps the global registry convergent while allowing Rspack environments to finish independently.

## Resolver Rebuild Ordering

The resolver virtual module must be rebuilt after cached metadata has been replayed.

The ordering is:

1. `finishMake` stage `-20`: replay `buildInfo` into environment snapshots and rebuild `serverFnsById`.
2. `finishMake` stage `-10`: write resolver virtual module content and rebuild modules that import the resolver.

For non-RSC builds, each server-like environment that needs the resolver installs the stage `-10` rebuild hook.

For RSC builds, the server environment installs the RSC resolver rebuild hook at stage `-10`. It generates provider-style resolver content because RSC server actions run inside the server/RSC environment and do not need the client-reference check in that resolver layer.

## Compiler Ordering

Non-RSC Rsbuild uses Rspack `MultiCompiler.setDependencies()` to make resolver-owning environments wait for metadata-producing environments.

The intended order is:

- `client` runs before every server-like environment.
- If a separate provider environment exists, the provider runs after `client`.
- If a separate provider environment exists, `ssr` runs after both `client` and the provider.

That ordering prevents the `ssr` resolver module from being finalized before provider metadata is available.

RSC builds intentionally do not add these dependencies. Rspack's native RSC coordinator interleaves server and client compilation phases. Adding MultiCompiler dependencies on top of it can deadlock the build.

## Native APIs Used

The implementation uses Rsbuild/Rspack integration points instead of cache internals:

- Rsbuild `modifyBundlerChain()` to register the compiler pre loader.
- Rspack loader `ctx.resolve()` for module resolution.
- Rspack `compiler.inputFileSystem` for source reads.
- Rspack loaders for access to the loader pipeline.
- Rspack `module.buildInfo` for module-scoped persisted metadata.
- Rspack `compiler.hooks.finishMake` for module graph replay and resolver rebuild ordering.
- Rspack `compilation.rebuildModule()` through the local `rebuildModulesContaining()` helper.
- Rspack `MultiCompiler.setDependencies()` for non-RSC compiler ordering.
- Rspack `experiments.VirtualModulesPlugin` for virtual module content.

The implementation avoids private persistent-cache files, direct cache mutation, global handoff state, and disabling module caching with `this.cacheable(false)`.

## When A New Server Function Is Compiled

For a new server function in a normal cold compile:

1. Rsbuild sends the source module through the Start compiler pre loader.
2. `StartCompiler.compile()` rewrites the caller module and discovers the server function.
3. `onServerFnsById` merges the function into `serverFnsById` and the active module metadata object.
4. The compile callback returns code, a source map, and the discovered server functions to the loader.
5. The loader writes that payload into `module.buildInfo['tanstack.start.serverFns']` and returns code with composed source maps.
6. Rspack owns the module from there. If persistent cache is enabled, Rspack persists the module and its string-keyed `buildInfo` with its normal cache machinery.
7. At `finishMake -20`, Start reads current module `buildInfo` and rebuilds the environment snapshot.
8. At `finishMake -10`, Start rewrites and rebuilds the resolver virtual module so runtime lookups can find the new function.
