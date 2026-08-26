# Rsbuild Import Protection - Adapter Internals

## Scope

This document covers the Rsbuild-specific orchestration around the shared
import-protection core in `src/import-protection/INTERNALS.md`.

Rsbuild owns:

- post-transform enforcement through `api.transform({ order: 'post' })`
- virtual-module transport through `VirtualModulesPlugin`
- compilation-truth reporting in `processAssets`
- final graph reconstruction from Rspack compilation data

Shared transform-time AST analysis, rewrite logic, source extraction, usage
lookup, source locations, trace formatting, and mock code generation are
described in the shared internals doc.

## Mental Model

Vite is primarily `resolveId`-driven. Rsbuild is primarily `transform` +
`processAssets`-driven.

That difference explains most of the adapter divergence.

Rsbuild does not emulate the Vite pending-queue state machine. It relies more
directly on post-transform code and final compilation truth.

## Native Hook Shape

Import protection is attached through Rsbuild hooks, not a dedicated mini-plugin
object:

1. `onBeforeBuild`
2. `onBeforeDevCompile`
3. `modifyRspackConfig`
4. `transform(..., { order: 'post' })`
5. `processAssets(..., { stage: 'report' })`

## State Model

Per environment, Rsbuild keeps a smaller runtime state than Vite:

- `resolveCache`
- `seenViolations`

Shared state is for virtual module transport:

- `virtualModules`
- `vmPlugins`
- `readyVmPlugins`
- `pendingWrites`

Notably absent compared to Vite:

- no `pendingViolations`
- no `postTransformImports`
- no broad `deferredBuildViolations`
- no resolve-time dev reachability pipeline

## Transform Phase

Rsbuild enforcement runs after the Start compiler in a `post` transform.

That matters because many compiler-safe imports are already stripped by the time
import protection runs. This naturally suppresses a large class of false
positives without a Vite-style pending verification pass.

The transform phase is responsible for:

- self-denial for forbidden files
- self-denial for marker-protected files in the wrong environment
- direct specifier rewrites to mock-edge modules

The transform treats the code it receives as authoritative. It does not read,
parse, or analyze original source. Imports removed by the Start compiler are no
longer part of this phase; imports with unsafe client/server usage remain in the
transformed code and are checked normally.

## Virtual Module Transport

Rsbuild reuses the shared mock generators, but not the Vite id transport.

Instead it writes environment-scoped virtual files under:

```text
<root>/node_modules/.virtual/import-protection/<env>/
```

The important forms are:

- `mock-silent.mjs`
- `mock-runtime-<base64>.mjs`
- `mock-edge-<base64>.mjs`

Writes may happen before the `VirtualModulesPlugin` instance is ready, so the
adapter queues them and flushes during compilation setup.

## Reporting Phase

`processAssets({ stage: 'report' })` is the authoritative reporting step.

It reconstructs the final view of the compilation from Rspack data by:

1. collecting every module's active outgoing connections into
   `RspackModuleGraphNode[]`, while a separate visitor classifies each node as
   soon as it is created
2. finishing marker fallback checks after all module specifiers are known
3. returning immediately when collection produces no candidates
4. building the `ImportGraph` and diagnostic indexes only for confirmed
   candidates

Each `RspackModuleGraphNode` contains only a module and its active
`{ dependency, module }` imports. For multiple active connections to the same
target `Module`, collection keeps only the first connection in Rspack's outgoing
order. Collection does not filter by source-file eligibility, because every
intermediate module is required to preserve complete entry-to-violation traces.
The classification visitor applies source-file and rule eligibility separately;
it does not traverse the node array afterward. Marker fallback retains only
pending imports until every eligible node's specifier set is available. Module
identity keeps query, layer, and other same-resource variants distinct.
Normalized file paths remain the user-facing identity for rules, traces, source
mapping, and diagnostics.

When at least one candidate exists, the adapter replays the in-memory node array
to build `ImportGraph`; it never calls
`getOutgoingConnectionsInOrder(module)` a second time. A successful compilation
therefore avoids allocating `ImportGraph`, entry data, and path-based trace
indexes entirely.

`processAssets` does not parse module source. Import requests come from
the retained `connection.dependency.request`. Diagnostic locations come from
that dependency's `loc`, then map through the compiled module sourcemap. The
adapter does not distinguish import and usage locations. When Rspack does not
expose a dependency location, the diagnostic remains valid but may omit its
source location and snippet.

When `sourceAndMap()` does not provide a sourcemap, generated dependency
locations are not reported as original source locations. Importer and trace
locations, along with the source snippet, are omitted in that case.

`module.originalSource()` plus `sourceAndMap()` are called only for modules
required to build a confirmed violation. A compilation with no violations
therefore does not read dependency locations, module sources, or compilation
entries.

This is the core Rsbuild-native replacement for Vite's `generateBundle`
verification plus dev pending-violation flow.

## Source And Compilation APIs

The Rsbuild adapter intentionally prefers native Rspack APIs where possible.

Transform-time:

- `ctx.resource`
- `ctx.context`
- `ctx.resolve(...)`

Compilation-time:

- `module.resourceResolveData?.resource`
- `module.identifier()` (normalized fallback)
- `module.originalSource().sourceAndMap()` (confirmed diagnostics only)
- sourcemap `sourcesContent`
- `moduleGraph.getOutgoingConnectionsInOrder(module)`
- `connection.dependency.request`
- `connection.dependency.loc` (confirmed diagnostics only)

Diagnostics use the retained first connection's dependency location and map it
back through the composed compilation sourcemap.

## Marker Handling

Unlike Vite, Rsbuild does not introduce plugin-owned virtual marker modules for
normal operation.

The real package marker files are used as source-level markers. The adapter
derives marker kind exclusively from dependency requests in the final module
graph.

## Practical Maintainer Rule

When changing Rsbuild import protection, ask:

1. Can the change be expressed in shared analysis/rewrite/mock codegen instead?
2. If it is adapter-specific, is it really about post-transform enforcement,
   virtual-file transport, or compilation-time reporting?
3. Can final compilation truth answer the question more simply than adding a new
   pending state machine?
