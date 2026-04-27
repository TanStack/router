# Vite Import Protection - Adapter Internals

## Scope

This document covers the Vite-specific orchestration around the shared
import-protection core in `src/import-protection/INTERNALS.md`.

Vite owns:

- `resolveId`-first violation discovery
- dev/build deferral decisions tied to Vite lifecycle hooks
- the transform-cache plugin and post-transform graph bookkeeping
- Vite virtual-module id resolution and loading
- bundle-time survival checks in `generateBundle`

Shared AST analysis, rewrite logic, source extraction, mock export discovery,
usage lookup, source locations, and mock code generation are described in the
shared internals doc.

## Plugin Shape

`importProtectionPlugin()` returns two Vite plugins:

1. `tanstack-start-core:import-protection`
2. `tanstack-start-core:import-protection-transform-cache`

The first plugin owns resolve-time detection and reporting decisions. The
second plugin owns transformed-result caching, post-transform import graph
updates, self-denial transforms, and dev pending-violation verification.

## Why Vite Uses Two Plugins

Vite discovers many violations in `resolveId`, but accurate source locations and
post-transform graph truth require transformed code that only exists later.

So the adapter splits responsibilities:

- `resolveId`: detect, classify, defer/report, substitute mock ids where needed
- later transform hook: cache transformed code/maps, self-deny files, compute
  post-transform imports, and process pending violations

## Vite State Model

Per environment, Vite keeps `EnvState` with:

- `graph`
- `mockExportsByImporter`
- `resolveCache`
- `resolveCacheByFile`
- `importLocCache`
- `seenViolations`
- `serverFnLookupModules`
- `transformResultCache`
- `transformResultKeysByFile`
- `transformResultProvider`
- `postTransformImports`
- `pendingViolations`
- `deferredBuildViolations`

Cross-environment shared state is intentionally small:

- `fileMarkerKind`

This is larger than the Rsbuild state model because Vite must bridge resolve-
time detection with later transform/bundle verification.

## Detection Flow

Vite is `resolveId`-driven.

That means the adapter may see violations before:

- the Start compiler removes safe-boundary imports
- tree-shaking removes false-positive edges
- transformed importer code is available

So Vite must decide whether to report immediately or defer.

## Deferral Policy

The shared helper is:

```ts
shouldDefer = isBuild || isDevMock
```

Adapter meaning:

- dev + error: report immediately with `ctx.error()`
- dev + mock: store `pendingViolations`, then verify later from post-transform
  edges and reachability
- build + mock/error: store `deferredBuildViolations`, then verify in
  `generateBundle`

This is the main adapter-specific state machine difference from Rsbuild.

## Dev Strategy

### Dev + Error

Vite throws immediately in `resolveId`.

This is intentionally aggressive and can still produce known barrel false
positives because there is no tree-shaking in the dev server.

Pre-transform resolve paths like `SERVER_FN_LOOKUP` are silenced in this mode
because there is no later deferred verification path.

### Dev + Mock

Vite defers all violations into `pendingViolations`.

Later, the transform-cache plugin:

1. caches transformed code and sourcemaps
2. resolves post-transform imports
3. records graph edges from transformed code
4. runs `processPendingViolations()`

Pending verification uses two checks:

1. edge survival after the Start compiler transform
2. graph reachability from entries using post-transform edges

This is how Vite suppresses many dev false positives without bundling.

## Build Strategy

Vite build uses mock-first, verify-later behavior.

At resolve time it substitutes mocks silently and records deferred violations.
At `generateBundle`, it checks whether each unique mock id survived tree-
shaking.

If the mock survived:

- error mode: fail the build
- mock mode: emit a warning

If the mock was removed, the violation is suppressed as a false positive.

## Self-Denial In Vite

For file-based violations, `resolveId` does not return a virtual mock id.
Instead it returns the physical file path, and the later transform-cache plugin
replaces the file contents with a mock module.

This Vite-specific choice exists for two reasons:

- avoid cross-environment cache contamination in shared resolver caches
- avoid cold-start export-resolution issues when importer AST data is not yet
  available

## Vite Virtual Modules

The shared mock generators use abstract ids like:

- `\0tanstack-start-import-protection:mock`
- `\0tanstack-start-import-protection:mock-edge:...`
- `\0tanstack-start-import-protection:mock-runtime:...`
- `\0tanstack-start-import-protection:marker:*`

The Vite adapter adds:

- resolved Vite ids via `resolveViteId(...)`
- support for browser-prefixed ids via `__x00__`
- `loadResolvedVirtualModule()` for serving the generated code

This id transport is adapter-specific. The generated module contents are shared.

## Warm-Start Considerations

Vite can skip `resolveId` on warm cache hits, so the adapter maintains its own
graph and transform-result caches to recover enough information for traces and
pending-violation verification.

Special care is taken not to treat pre-transform lookup edges as authoritative
reachability edges.

## Practical Maintainer Rule

When changing Vite import protection, ask:

1. Is this really about Vite lifecycle timing or state?
2. If not, should it move into the shared import-protection core?
3. If yes, does it belong in resolve-time detection, transform-cache handling,
   or bundle-time verification?
