# Import Protection Plugin — Internal Technical Documentation

## Overview

The import protection plugin prevents server-only code from leaking into client
bundles (and vice versa). It operates as a Vite plugin that intercepts module
resolution, detects violations, and either errors or replaces the offending
module with a safe mock.

The plugin must handle **two axes of configuration**:

|           | **Dev** (`vite dev`)                                                 | **Build** (`vite build`)                                       |
| --------- | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Error** | `ctx.error()` immediately in `resolveId`                             | Defer to `generateBundle`; error if mock survived tree-shaking |
| **Mock**  | Defer to transform-cache; warn if reachable via post-transform graph | Defer to `generateBundle`; warn if mock survived tree-shaking  |

## Plugin Architecture

`importProtectionPlugin()` returns **three** Vite plugins:

### 1. `tanstack-start-core:import-protection` (enforce: `'pre'`)

The main enforcement plugin. Hooks: `applyToEnvironment`, `configResolved`,
`configureServer`, `buildStart`, `hotUpdate`, `resolveId`, `load`, and
`generateBundle`. All violation detection starts in `resolveId`.

### 2. `tanstack-start-core:import-protection-transform-cache`

Runs after all `enforce: 'pre'` hooks (including the Start compiler). Caches
transformed code and composed sourcemaps for accurate source-location mapping
in violation messages. Also resolves post-transform imports and triggers
`processPendingViolations()` for the dev mock deferral path.

### 3. `tanstack-start-core:import-protection-mock-rewrite` (enforce: `'pre'`, dev only)

Records expected named exports per importer so that dev mock-edge modules can
provide explicit ESM named exports. Only active in dev + mock mode.

## Violation Types

| Type        | Trigger                                                                                 | Example                                                 |
| ----------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `file`      | Resolved path matches a deny glob (e.g. `**/*.server.*`)                                | `import './db.server'` in client env                    |
| `specifier` | Import specifier matches a deny pattern                                                 | `import '@tanstack/react-start/server'` in client env   |
| `marker`    | File imports `'server-only'` or `'client-only'` marker, then is loaded in the wrong env | File with `import 'server-only'` resolved in client env |

## The False-Positive Problem

### Barrel re-exports

A common pattern:

```
db/index.ts        →  export { getUsers } from './db.server'
                       export { userColumns } from './shared'

route.tsx          →  import { getUsers, userColumns } from '../db'
                       // getUsers used only in createServerFn().handler()
                       // userColumns used in JSX
```

At `resolveId` time, `db/index.ts` imports `./db.server` — the plugin sees a
`.server` file imported in the client environment. But the Start compiler strips
the `getUsers` usage from the client bundle (it's inside a server fn handler),
and Rollup's tree-shaking then eliminates the `./db.server` dependency entirely.

**No server code actually leaks.** But without deferral, the plugin fires at
`resolveId` time — before tree-shaking — producing a false positive.

### Pre-transform resolves (server-fn-lookup)

During dev, Vite's `fetchModule(?SERVER_FN_LOOKUP)` call triggers resolves for
analysing a module's exports. These are tracked via `serverFnLookupModules` and
`isPreTransformResolve`, and violations are silenced for them.

## Violation Handling Flow

### Central functions

- **`handleViolation()`**: Formats + reports (or silences) the violation. Returns
  a mock module ID (or `{ id, syntheticNamedExports }` in build) so `resolveId`
  can substitute the offending import. May also return `undefined` (suppressed by
  `onViolation` or silent+error in dev) or throw via `ctx.error()` (dev+error).
- **`reportOrDeferViolation()`**: Dispatch layer. Either defers (stores for later
  verification) or reports immediately, depending on `shouldDefer`.

### `shouldDefer` logic

```
shouldDefer = (isDevMock && !isPreTransformResolve) || isBuild
```

- **Dev mock**: Defer to `pendingViolations` → verify via post-transform graph
  reachability in `processPendingViolations()`.
- **Build (both mock and error)**: Defer to `deferredBuildViolations` → verify
  via tree-shaking survival in `generateBundle`.

All three violation types (file, specifier, AND marker) are deferred in build
mode. Marker violations through barrels can also be false positives — e.g., if
`foo.ts` has `import 'server-only'` and is re-exported through a barrel but
never used in client code, tree-shaking eliminates `foo.ts` entirely. To enable
`generateBundle` tracking for markers, `resolveId` returns the unique build
mock ID instead of the marker module. This is transparent because marker imports
are bare (`import 'server-only'` — no bindings), and the mock module is equally
side-effect-free.

## Dev Mode Strategy

### Dev + Error

Violations fire immediately via `ctx.error()` in `resolveId`. No tree-shaking
is available, so false positives for barrel patterns are expected and accepted.
(Dev + error is typically used only during explicit validation.)

### Dev + Mock

1. `resolveId` calls `handleViolation({ silent: true })` — no warning emitted.
2. The mock module ID is returned so the dev server can serve a Proxy-based
   mock instead of the real server module.
3. The violation is stored in `pendingViolations` keyed by the importer's file
   path.
4. The transform-cache plugin, after resolving post-transform imports, calls
   `processPendingViolations()`.
5. `processPendingViolations()` checks graph reachability from entry points
   using only post-transform edges. If the violating importer is reachable
   → confirm (warn). If unreachable → discard. If unknown → keep pending.

This approach can't fully eliminate barrel false-positives in dev because
there's no tree-shaking. The barrel's import of `.server` always resolves,
and the barrel is reachable. This is a known and accepted limitation.

### Dev mock modules

In dev, each violation gets a **per-importer mock edge module** that:

- Explicitly exports the names the importer expects (extracted by the
  mock-rewrite plugin).
- Delegates to a **runtime mock module** that contains a recursive Proxy and
  optional runtime diagnostics (console warnings when mocked values are used).

This differs from build mode, where `syntheticNamedExports: true` lets Rollup
handle named export resolution from the silent mock.

## Build Mode Strategy

### The "mock first, verify later" pattern

Both mock and error build modes follow the same pattern:

1. **`resolveId`**: Call `handleViolation({ silent: true })`. Generate a
   **unique per-violation mock module ID** (`\0tanstack-start-import-protection:mock:build:N`).
   Store the violation + mock ID in `env.deferredBuildViolations`. Return the
   mock ID so Rollup substitutes the offending import.

2. **`load`**: Return a silent Proxy-based mock module (same code as
   `RESOLVED_MOCK_MODULE_ID`) with `syntheticNamedExports: true`.

3. **Tree-shaking**: Rollup processes the bundle normally. If no binding from
   the mock module is actually used at runtime, the mock module is eliminated.

4. **`generateBundle`**: Inspect the output chunks. For each deferred violation,
   check whether its unique mock module ID appears in any chunk's `modules`.
   - **Survived** → real violation (the import wasn't tree-shaken away).
     - Error mode: `ctx.error()` — fail the build.
     - Mock mode: `ctx.warn()` — emit a warning.
   - **Eliminated** → false positive (tree-shaking removed it). Suppress
     silently.

### Why unique mock IDs per violation?

The original `RESOLVED_MOCK_MODULE_ID` is a single shared virtual module used
for all mock-mode violations. If multiple violations are deferred, we need to
know _which specific ones_ survived tree-shaking. A shared ID would tell us
"something survived" but not which violation it corresponds to. The unique IDs
(`...mock:build:0`, `...mock:build:1`, etc.) provide this granularity.

### Why mocking doesn't affect tree-shaking

From the consumer's perspective, the import bindings are identical whether they
point to the real module or the mock. Rollup tree-shakes based on binding usage,
not module content. If a binding from the barrel's re-export of `.server` is
unused after the Start compiler strips server fn handlers, tree-shaking
eliminates it regardless of whether it points to real DB code or a Proxy mock.

### Per-environment operation

`generateBundle` runs once per Vite environment (client, SSR, etc.). Each
environment has its own `EnvState` with its own `deferredBuildViolations` array.
The check only inspects chunks from THAT environment's bundle, ensuring correct
per-environment verification.

## Marker violations vs. file/specifier violations

|                               | Marker                                              | File / Specifier                             |
| ----------------------------- | --------------------------------------------------- | -------------------------------------------- |
| **What triggers it**          | The _importer_ has a conflicting directive          | The _import target_ matches a deny rule      |
| **resolveId returns (dev)**   | Marker module ID (`RESOLVED_MARKER_*`) \*           | Mock edge module ID (per-importer)           |
| **resolveId returns (build)** | Unique build mock ID (same as file/specifier)       | Unique build mock ID                         |
| **Can be tree-shaken away?**  | Yes — if the importer is eliminated by tree-shaking | Yes — if no binding from the target survives |
| **Deferred in build?**        | Yes — deferred to `generateBundle`                  | Yes — deferred to `generateBundle`           |
| **Deferred in dev mock?**     | Yes — deferred to pending graph                     | Yes — deferred to pending graph              |

\* In dev mock, `handleViolation` internally returns a mock edge module ID
(stored as the deferred result in `pendingViolations`), but `resolveId` ignores
it for markers and falls through to return the marker module ID. The mock edge
ID is only used for deferral bookkeeping, not for module resolution.

## State Management

### `EnvState` (per Vite environment)

Key fields for violation handling:

- `seenViolations: Set<string>` — deduplication of logged violations.
- `pendingViolations: Map<string, Array<PendingViolation>>` — dev mock
  deferral. Keyed by importer file path.
- `deferredBuildViolations: Array<DeferredBuildViolation>` — build mode
  deferral. Each entry has `{ info, mockModuleId }`.
- `graph: ImportGraph` — import dependency graph for reachability checks.
- `serverFnLookupModules: Set<string>` — modules transitively loaded during
  server-fn analysis (false-positive suppression).

### `SharedState` (cross-environment)

- `fileMarkerKind: Map<string, 'server' | 'client'>` — cached per-file marker
  detection. A file's directive is inherent to the file, not the environment.

## Virtual Module IDs

| ID Pattern                                               | Usage                                                                                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `\0tanstack-start-import-protection:mock`                | Shared silent mock (dev mock only)                                                                                      |
| `\0tanstack-start-import-protection:mock:build:N`        | Per-violation build mock (unique counter)                                                                               |
| `\0tanstack-start-import-protection:mock-edge:BASE64`    | Per-importer dev mock with explicit named exports                                                                       |
| `\0tanstack-start-import-protection:mock-runtime:BASE64` | Runtime diagnostic mock (dev client, console warnings)                                                                  |
| `\0tanstack-start-import-protection:marker:*`            | Marker module (empty `export {}`). Suffixed `server-only` or `client-only`; derived from `MARKER_PREFIX` in `plugin.ts` |

## Key Design Decisions

### Why not just skip `.server` resolves in barrels?

The plugin doesn't know at `resolveId` time whether the barrel's re-export will
survive tree-shaking. It can't inspect the consumer's usage — it only sees the
barrel importing `.server`. Skipping it would miss real violations where the
barrel's `.server` re-export IS used in client code.

### How marker violations are deferred in build

Marker violations normally resolve to `RESOLVED_MARKER_*` (empty `export {}`),
not a mock. To enable `generateBundle` tracking, in build mode `resolveId`
returns the unique build mock ID instead of the marker module. This works
because:

1. The marker import is bare (`import 'server-only'` — no bindings), so
   swapping the resolution to a mock module is transparent.
2. The mock module is side-effect-free, just like the marker module.
3. If the importer file survives tree-shaking, the mock module survives →
   `generateBundle` fires the violation. If the importer is tree-shaken away
   (e.g., barrel re-export of a marker-protected file that's never used), the
   mock is eliminated → violation suppressed.

### Why accept false positives in dev?

Dev mode uses Vite's ESM dev server — no bundling, no tree-shaking. The barrel
file's import of `.server` always resolves and is always reachable from entry
points. The graph-reachability check in `processPendingViolations` can only
eliminate violations where the _importer_ becomes unreachable after the Start
compiler transforms it, not where individual bindings are unused.

This is an accepted trade-off: dev mock mode warns about potential issues,
build mode provides definitive answers via tree-shaking.

## E2E Test Structure

Tests live in `e2e/react-start/import-protection/`:

- **Mock mode** (default): `globalSetup` builds the app, captures build warnings
  to `violations.build.json`, starts a dev server capturing to
  `violations.dev.json`. Tests read these JSON files and assert.
- **Error mode** (`BEHAVIOR=error`): `globalSetup` runs the build expecting
  failure, captures exit code + output. Tests assert the build failed with the
  expected violation.
- **False-positive test**: The `barrel-reexport` test case verifies that a barrel
  re-exporting from both a `.server` file and a marker-protected file (`foo.ts`
  with `import 'server-only'`), where all server-only bindings are tree-shaken
  away, produces **zero** violations in the build log.
