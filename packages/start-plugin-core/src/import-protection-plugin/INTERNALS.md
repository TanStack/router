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

`importProtectionPlugin()` returns **two** Vite plugins:

### 1. `tanstack-start-core:import-protection` (enforce: `'pre'`)

The main enforcement plugin. Hooks: `applyToEnvironment`, `configResolved`,
`configureServer`, `buildStart`, `hotUpdate`, `resolveId`, `load`, and
`generateBundle`. All violation detection starts in `resolveId`.

### 2. `tanstack-start-core:import-protection-transform-cache`

Runs after all `enforce: 'pre'` hooks (including the Start compiler). Caches
transformed code and composed sourcemaps for accurate source-location mapping
in violation messages. Also resolves post-transform imports and triggers
`processPendingViolations()` for the dev mock deferral path.

In both build and dev modes, this plugin performs **self-denial**: when a file
matches a deny pattern in the current environment (e.g. a `.server.ts` file
transformed in the client environment), its entire content is replaced with a
mock module. This is the core mechanism for preventing cross-environment cache
contamination — `resolveId` never returns virtual module IDs for file-based
violations, so there is nothing for third-party resolver caches
(e.g. `vite-tsconfig-paths`) to leak across environments. In dev mode, the
mock imports a `mock-runtime` module for runtime diagnostics; in build mode,
the mock is fully self-contained.

See the [Self-Denial Transform](#self-denial-transform-in-detail) section below
for a detailed walkthrough with code examples.

## Violation Types

| Type        | Trigger                                                                                 | Example                                                 |
| ----------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `file`      | Resolved path matches a deny glob (e.g. `**/*.server.*`)                                | `import './db.server'` in client env                    |
| `specifier` | Import specifier matches a deny pattern                                                 | `import '@tanstack/react-start/server'` in client env   |
| `marker`    | File imports `'server-only'` or `'client-only'` marker, then is loaded in the wrong env | File with `import 'server-only'` resolved in client env |

## The False-Positive Problem

### Barrel re-exports

A common pattern:

```text
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
`isPreTransformResolve`. In dev mock mode, pre-transform violations are
deferred like all other violations (verified via edge-survival and graph
reachability). In dev error mode, they are silenced because no deferred
verification path exists.

## Violation Handling Flow

### Central functions

- **`handleViolation()`**: Formats + reports (or silences) the violation. Returns
  a resolve result so `resolveId` can substitute the offending import: for
  file-based violations, returns the physical file path (self-denial handles
  the rest in transform); for specifier/marker violations, returns a mock-edge
  module ID. May also return `undefined` (suppressed by `onViolation` or
  silent+error in dev) or throw via `ctx.error()` (dev+error).
- **`reportOrDeferViolation()`**: Dispatch layer. Either defers (stores for later
  verification) or reports immediately, depending on `shouldDefer`.

### `shouldDefer` logic

```ts
shouldDefer = isBuild || isDevMock
```

- **Dev mock**: ALL violations (including pre-transform resolves) are deferred
  to `pendingViolations` → verified via edge-survival and post-transform graph
  reachability in `processPendingViolations()`. Pre-transform violations are
  tagged with `fromPreTransformResolve` so the pending-violation processor
  knows to wait for post-transform data before emitting.
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

Pre-transform resolves (e.g. server-fn-lookup) are silenced in error mode
because they fire before the Start compiler runs — imports inside `.server()`
callbacks haven't been stripped yet, and error mode has no deferred verification
path.

### Dev + Mock

1. `resolveId` detects the violation and calls `reportOrDeferViolation()`.
2. For **file-based violations**: `handleViolation()` returns the **physical
   file path** (same as build mode). The self-denial transform in the
   transform-cache plugin will replace the file's content with a dev mock
   module that imports `mock-runtime` for runtime diagnostics.
3. For **specifier/marker violations**: `handleViolation()` returns a mock-edge
   module ID so the dev server can serve a Proxy-based mock.
4. The violation is stored in `pendingViolations` keyed by the importer's file
   path.
5. The transform-cache plugin, after resolving post-transform imports, calls
   `processPendingViolations()`.
6. `processPendingViolations()` first applies **edge-survival**: if
   post-transform import data is available for the importer, it checks whether
   the denied import survived the Start compiler transform. Imports stripped
   by the compiler (e.g. inside `.server()` callbacks) are discarded. For
   pre-transform violations (`fromPreTransformResolve`), the function waits
   until post-transform data is available before proceeding.
7. After edge-survival, `processPendingViolations()` checks graph reachability
   from entry points using only post-transform edges. If the violating
   importer is reachable → confirm (warn). If unreachable → discard. If
   unknown → keep pending or emit conservatively (warm-start fallback).

Warm-start stability guardrails:

- Resolve-time edges discovered through pre-transform paths
  (`isPreTransformResolve`, especially `SERVER_FN_LOOKUP`) are **not** recorded
  into the reachability graph.
- In `'unknown'` reachability status, pre-transform pending violations are
  kept pending (not fallback-emitted) until non-lookup transform evidence is
  available.

This approach can't fully eliminate barrel false-positives in dev because
there's no tree-shaking. The barrel's import of `.server` always resolves,
and the barrel is reachable. This is a known and accepted limitation.

### Dev mock modules

Dev violations are handled differently depending on their type:

- **File-based violations** use **self-denial** (same mechanism as build mode):
  the denied file's content is replaced by the transform-cache plugin with a
  mock that imports `mock-runtime` for runtime diagnostics. The export list
  comes from the **denied file's AST** (what it exports), generated by
  `generateDevSelfDenialModule()`. This approach avoids the cold-start problem
  where the importer's AST is unavailable at `resolveId` time, and prevents
  cross-environment cache contamination from third-party resolver plugins.

- **Specifier/marker violations** use **mock-edge modules**: each violation
  gets a per-importer mock edge module that explicitly exports the names the
  importer expects (extracted lazily by `resolveExportsForDeniedSpecifier()`
  which parses the importer's AST) and delegates to a **runtime mock module**
  that contains a recursive Proxy and optional runtime diagnostics.

### Mock edge modules (in detail)

A **mock edge module** is a lightweight, auto-generated virtual module that sits
between an importing file and a base mock module. Its purpose is to provide
**explicit ESM named exports** so that bundlers (Rollup, Rolldown) and Vite's dev
server can correctly resolve `import { foo } from './denied.server'` — even
though the real module has been replaced by a mock.

#### Why they exist

The base mock module (`\0tanstack-start-import-protection:mock`) exports only a
`default` export — a recursive Proxy. But consumers of the denied module may use
named imports:

```typescript
import { getSecret, initDb } from './credentials.server'
```

Without explicit named exports, this would fail: the bundler would complain that
`getSecret` and `initDb` don't exist on the mock module. Using
`syntheticNamedExports: true` in Rollup could solve this, but Rolldown (which
Vite can now use) doesn't support it. Mock edge modules solve the problem
portably by generating real ESM export statements.

#### Structure

Each mock edge module is identified by a virtual ID:

```text
\0tanstack-start-import-protection:mock-edge:<BASE64_PAYLOAD>
```

The Base64URL payload encodes two fields:

- `exports` — the list of named export identifiers the importer needs
- `runtimeId` — the module ID of the backing mock to import from

When Vite's `load` hook encounters this virtual ID, `loadMockEdgeModule()`
decodes the payload and generates code like this:

```typescript
// Generated mock edge module for exports: ["getSecret", "initDb"]
import mock from '\0tanstack-start-import-protection:mock'
export const getSecret = mock.getSecret
export const initDb = mock.initDb
export default mock
```

Each `mock.getSecret` access returns the Proxy itself (the Proxy's `get` trap
returns `mock` for any property), so the named exports are valid callable/
constructable values that won't crash at runtime.

#### How exports are determined

The export list comes from **parsing the importer's AST** — not the denied
file's AST. The function `resolveExportsForDeniedSpecifier()` performs this:

1. Gets the importer's code from the transform cache or `getModuleInfo`.
2. Calls `collectMockExportNamesBySource()` to extract which names the
   importer uses from each import source (parses the AST internally):
   - **Named imports**: `import { getSecret, initDb } from './creds.server'`
     → `['getSecret', 'initDb']`
   - **Namespace member access**: `import * as creds from './creds.server'` then
     `creds.getSecret()` → `['getSecret']`
   - **Default import member access**: `import creds from './creds.server'` then
     `creds.getSecret` → `['getSecret']`
   - **Re-exports**: `export { getSecret } from './creds.server'`
     → `['getSecret']`
3. Caches the result per importer so multiple violations from the same file
   don't re-parse.

This "importer-driven" approach means the mock edge module only exports the
names the consumer actually references — not all exports from the denied file.

#### Dev vs build mock edge modules

| Aspect           | Dev mock edge                                                    | Build mock edge                                                  |
| ---------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Backing mock** | `mock-runtime:BASE64` (runtime diagnostics) or `mock` (silent)   | `mock:build:N` (per-violation unique, silent)                    |
| **Purpose**      | Serve mocks in dev server + runtime warnings                     | Track tree-shaking survival in `generateBundle`                  |
| **Created for**  | Specifier/marker violations only (file uses self-denial instead) | Specifier/marker violations only (file uses self-denial instead) |
| **Uniqueness**   | Per-importer per-specifier                                       | Per-violation (unique counter)                                   |

In **dev**, the backing `runtimeId` is a `mock-runtime:BASE64` module that
includes diagnostic metadata (environment, import path, trace). When the mock
is accessed in the browser, it logs a console warning or error. For SSR or
when `mockAccess` is `'off'`, the backing mock is the shared silent
`MOCK_MODULE_ID`.

In **build**, the backing mock uses a unique counter ID
(`mock:build:0`, `mock:build:1`, ...) so `generateBundle` can check whether
each specific violation's mock survived tree-shaking.

#### Handling non-identifier export names

ES2022 allows string-keyed exports like `export { x as "foo-bar" }`. Mock edge
modules handle these via an intermediate variable:

```typescript
import mock from '\0tanstack-start-import-protection:mock'
export const validName = mock.validName
const __tss_str_0 = mock['foo-bar']
export { __tss_str_0 as 'foo-bar' }
```

The `default` export name is always filtered out (handled separately as
`export default mock`).

### File-based violations: self-denial (dev and build)

File-based violations (e.g. `import './db.server'` in client env) use
self-denial in **both** dev and build modes. `handleViolation()` returns the
physical file path, and the transform-cache plugin replaces the file's
contents with a mock module.

- **Build mode**: Uses `generateSelfContainedMockModule()` — a fully
  self-contained mock with an inlined Proxy factory (no `import` statements).
  This is important because build-mode mocks must be tree-shakeable.

- **Dev mode**: Uses `generateDevSelfDenialModule()` — a mock that imports
  `mock-runtime` for runtime diagnostics (console warnings/errors when the
  mock is accessed in the browser). The `mock-runtime` module ID encodes
  violation metadata (environment, import path, trace).

Self-denial avoids creating virtual mock-edge module IDs that could
contaminate third-party resolver caches across Vite environments.

### Non-file violations: mock-edge modules (dev and build)

Specifier and marker violations use **mock-edge modules** because the denied
specifier doesn't resolve to a physical file that could be "self-denied."

- **Build mode**: Each violation gets a **per-violation mock edge module**
  wrapping a unique base mock module
  (`\0tanstack-start-import-protection:mock:build:N`). The edge module
  re-exports the named exports the importer expects, ensuring compatibility
  with both Rollup and Rolldown (which doesn't support
  `syntheticNamedExports`).

- **Dev mode**: Each violation gets a **per-importer mock edge module**
  wrapping a `mock-runtime` module for runtime diagnostics.

## Build Mode Strategy

### The "mock first, verify later" pattern

Both mock and error build modes follow the same pattern:

1. **`resolveId`**: Call `handleViolation({ silent: true })`.
   - For **file-based violations**: Returns the physical file path. The
     self-denial transform will replace its content.
   - For **specifier/marker violations**: Generates a **unique per-violation
     mock-edge module** wrapping a base mock module
     (`\0tanstack-start-import-protection:mock:build:N`). Stores the violation +
     mock-edge ID in `env.deferredBuildViolations`. Returns the mock-edge ID.

2. **`transform`** (self-denial): For file-based violations, the transform-cache
   plugin detects that the current file is denied in this environment and
   replaces its content with a self-contained mock module
   (`generateSelfContainedMockModule()`).

3. **`load`**: For base mock modules, returns a silent Proxy-based mock. For
   mock-edge modules, returns code that imports from the base mock and
   re-exports the expected named bindings (e.g. `export const Foo = mock.Foo`).

4. **Tree-shaking**: The bundler processes the bundle normally. If no binding from
   the mock module is actually used at runtime, the modules are eliminated.

5. **`generateBundle`**: Inspect the output chunks. For each deferred violation,
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
"something survived" but not which violation it corresponds to. Each violation
gets a unique mock-edge module (wrapping a unique base mock
`...mock:build:0`, `...mock:build:1`, etc.) to provide this granularity.

### Why mocking doesn't affect tree-shaking

From the consumer's perspective, the import bindings are identical whether they
point to the real module or the mock. The bundler tree-shakes based on binding
usage, not module content. If a binding from the barrel's re-export of `.server`
is unused after the Start compiler strips server fn handlers, tree-shaking
eliminates it regardless of whether it points to real DB code or a Proxy mock.

### Per-environment operation

`generateBundle` runs once per Vite environment (client, SSR, etc.). Each
environment has its own `EnvState` with its own `deferredBuildViolations` array.
The check only inspects chunks from THAT environment's bundle, ensuring correct
per-environment verification.

## Marker violations vs. file/specifier violations

|                               | Marker                                              | Specifier                                    | File                                          |
| ----------------------------- | --------------------------------------------------- | -------------------------------------------- | --------------------------------------------- |
| **What triggers it**          | The _importer_ has a conflicting directive          | The _import specifier_ matches a deny rule   | The _resolved path_ matches a deny glob       |
| **resolveId returns (dev)**   | Marker module ID (`RESOLVED_MARKER_*`) \*           | Mock edge module ID (per-importer)           | Physical file path (self-denial in transform) |
| **resolveId returns (build)** | Unique build mock ID                                | Unique build mock ID                         | Physical file path (self-denial in transform) |
| **Can be tree-shaken away?**  | Yes — if the importer is eliminated by tree-shaking | Yes — if no binding from the target survives | Yes — if no binding from the target survives  |
| **Deferred in build?**        | Yes — deferred to `generateBundle`                  | Yes — deferred to `generateBundle`           | Yes — deferred to `generateBundle`            |
| **Deferred in dev mock?**     | Yes — deferred to pending graph                     | Yes — deferred to pending graph              | Yes — deferred to pending graph               |

\* In dev mock, `handleViolation` internally returns the physical file path
(stored as the deferred result in `pendingViolations`), but `resolveId` ignores
it for markers and falls through to return the marker module ID. The file path
is only used for deferral bookkeeping, not for module resolution.

## State Management

### `EnvState` (per Vite environment)

Key fields for violation handling:

- `seenViolations: Set<string>` — deduplication of logged violations.
- `pendingViolations: Map<string, Array<PendingViolation>>` — dev mock
  deferral. Keyed by importer file path.
- `deferredBuildViolations: Array<DeferredBuildViolation>` — build mode
  deferral. Each entry has `{ info, mockModuleId }`.

Per-build/watch iteration, `buildStart` clears `pendingViolations` and resets
`deferredBuildViolations` so deferred entries don't leak across rebuilds.

- `graph: ImportGraph` — import dependency graph for reachability checks.
- `serverFnLookupModules: Set<string>` — modules transitively loaded during
  server-fn analysis (false-positive suppression).

### `SharedState` (cross-environment)

- `fileMarkerKind: Map<string, 'server' | 'client'>` — cached per-file marker
  detection. A file's directive is inherent to the file, not the environment.

## Virtual Module IDs

| ID Pattern                                               | Usage                                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `\0tanstack-start-import-protection:mock`                | Shared silent mock (dev mock only)                                                                                              |
| `\0tanstack-start-import-protection:mock:build:N`        | Per-violation build mock (unique counter)                                                                                       |
| `\0tanstack-start-import-protection:mock-edge:BASE64`    | Per-importer mock with explicit named exports (specifier/marker violations, dev + build)                                        |
| `\0tanstack-start-import-protection:mock-runtime:BASE64` | Runtime diagnostic mock (dev client, console warnings)                                                                          |
| `\0tanstack-start-import-protection:marker:*`            | Marker module (empty `export {}`). Suffixed `server-only` or `client-only`; derived from `MARKER_PREFIX` in `virtualModules.ts` |

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

Tests live in `e2e/react-start/import-protection/` and
`e2e/react-start/import-protection-custom-config/`:

### Main test suite (`import-protection/`)

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

### Custom-config test suite (`import-protection-custom-config/`)

Uses non-default deny patterns (`**/*.backend.*` / `**/*.frontend.*`) to verify
that import protection works with user-configured file patterns. This ensures
the plugin doesn't hardcode any assumption about `.server`/`.client` naming
conventions. The `vite.config.ts` provides custom `client.files` and
`server.files` arrays; no `vite-tsconfig-paths` is used.

## Self-Denial Transform (In Detail)

The self-denial transform is the mechanism by which the plugin prevents cross-
environment contamination without creating virtual module IDs that could leak
through third-party resolver caches. It applies to **file-based violations in
both dev and build modes**.

### The problem it solves

In Vite 7+, client and SSR environments run within the same Vite process. Some
plugins (e.g. `vite-tsconfig-paths`) maintain a global resolution cache shared
across environments. If the import-protection plugin resolves a specifier to a
virtual mock module ID (e.g.
`\0tanstack-start-import-protection:mock-edge:...`) in the client environment,
that virtual ID can leak into the SSR environment's cache. When the SSR
environment later resolves the same specifier, it finds the cached virtual ID
instead of the real file — breaking the server.

In dev mode, self-denial also solves a **cold-start problem**: on cold start
(no `.vite` cache), the importer's AST is unavailable when `resolveId` runs
(neither the transform cache nor `getModuleInfo` have content yet). If mock-edge
module IDs were generated at `resolveId` time, the export list would be empty
(since it's derived from parsing the importer), producing a mock with no named
exports — causing runtime errors like
`does not provide an export named: 'getSecret'`.

### How it works

Instead of returning a virtual module ID from `resolveId`, the self-denial
transform works at the **transform** stage:

1. **`resolveId`**: For file-based violations, `handleViolation()` returns the
   **physical file path**. The import resolves normally. No virtual ID is
   created.

2. **transform-cache plugin**: When the transform-cache hook processes a file,
   it checks whether the file matches any deny pattern for the current
   environment using `checkFileDenial()`. If the file is denied, the plugin:

   a. Extracts the file's named exports using `collectNamedExports()` (parses
   the AST internally).
   b. **Build mode**: Generates a self-contained mock module via
   `generateSelfContainedMockModule()` — no imports, inlined Proxy factory.
   c. **Dev mode**: Generates a dev mock module via
   `generateDevSelfDenialModule()` — imports `mock-runtime` for runtime
   diagnostics (console warnings/errors when the mock is accessed).
   d. Returns the mock code as the transform result, completely replacing the
   original file content.

3. **Fallback**: If AST parsing fails (e.g. due to syntax errors in the denied
   file), `exportNames` defaults to `[]` (empty) and the mock module has no
   named exports:
   - Build: `generateSelfContainedMockModule([])`.
   - Dev: `generateDevSelfDenialModule([], runtimeId)` where `runtimeId` is
     computed via `mockRuntimeModuleIdFromViolation()` (which may internally
     fall back to the shared silent `MOCK_MODULE_ID` for SSR or when
     `mockAccess` is `'off'`).

### Code transformation example

**Original file** (`src/lib/credentials.server.ts`):

```typescript
import { db } from './database'

export function getSecret(): string {
  return db.query('SELECT secret FROM config LIMIT 1')
}

export const API_KEY = process.env.API_KEY!

export default { getSecret, API_KEY }
```

**After self-denial transform in build mode** (client environment):

```typescript
/* @__NO_SIDE_EFFECTS__ */
function createMock() {
  const handler = {
    get: (_, prop) => {
      if (prop === Symbol.toPrimitive) return () => 'MOCK'
      if (typeof prop === 'symbol') return undefined
      return mock
    },
    apply: () => mock,
    construct: () => mock,
  }
  const mock = /* @__PURE__ */ new Proxy(function () {}, handler)
  return mock
}
const mock = /* @__PURE__ */ createMock()
export const getSecret = mock.getSecret
export const API_KEY = mock.API_KEY
export default mock
```

**After self-denial transform in dev mode** (client environment):

```typescript
import mock from '\0tanstack-start-import-protection:mock-runtime:eyJ...'
export const getSecret = mock.getSecret
export const API_KEY = mock.API_KEY
export default mock
```

The `mock-runtime` module ID encodes violation metadata (environment, importer,
specifier, trace) as a Base64URL payload. When the mock is accessed in the
browser, it logs a console warning or error with this metadata.

### Key properties

**Build-mode mock** (`generateSelfContainedMockModule`):

- **Self-contained**: No `import` statements — the Proxy factory is inlined.
- **Tree-shakeable**: All exports are marked pure (`@__NO_SIDE_EFFECTS__`,
  `@__PURE__`), so the bundler can eliminate unused exports.

**Dev-mode mock** (`generateDevSelfDenialModule`):

- **Runtime diagnostics**: Imports `mock-runtime` which provides console
  warnings/errors when the mock is accessed in the browser.
- **Lightweight**: No inlined Proxy factory — delegates to the mock-runtime
  virtual module.

**Both modes**:

- **Same export interface**: Named exports match the original file's exports,
  so consumers' import bindings remain valid.
- **Safe at runtime**: Every access returns the same Proxy, which is callable,
  constructable, and returns "MOCK" when coerced to a string.
- **Export accuracy from denied file**: Unlike mock-edge modules (which parse
  the importer's AST), self-denial parses the **denied file's own AST**.
  This provides a safe over-approximation — all exports the file offers — and
  avoids the cold-start problem where the importer hasn't been transformed yet.

### Why self-denial instead of virtual modules for file-based violations

| Approach           | Virtual mock ID                                                | Self-denial                                                    |
| ------------------ | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `resolveId` return | `\0mock-edge:BASE64` (virtual)                                 | Physical file path (resolves normally)                         |
| Cache risk         | Virtual ID stored in shared resolver cache → leaks to SSR      | Physical path cached → correct in both environments            |
| Module identity    | New virtual module per violation                               | Same physical file, different content per environment          |
| Export accuracy    | From importer's AST (what it imports)                          | From denied file's AST (what it exports)                       |
| Cold-start safety  | Fails — importer AST unavailable on cold start → empty exports | Safe — denied file's source code always available in transform |

### When self-denial is NOT used

Self-denial only applies to **file-based** violations.

- **Specifier violations** (e.g. `import '@tanstack/react-start/server'`):
  These are bare specifiers, not file paths. They use virtual mock-edge module
  IDs because the specifier doesn't resolve to a physical file that could be
  "self-denied."
- **Marker violations**: Use virtual mock IDs in build mode for
  `generateBundle` tracking (see marker section above). In dev mode, markers
  resolve to the marker module ID directly.

## Module Dependency Architecture

The import-protection plugin is structured to avoid heavy transitive
dependencies in its utility modules:

```text
constants.ts          ← lightweight (no heavy imports)
├── IMPORT_PROTECTION_DEBUG
├── KNOWN_SOURCE_EXTENSIONS
├── SERVER_FN_LOOKUP_QUERY  ← imports SERVER_FN_LOOKUP from parent constants.ts
└── VITE_BROWSER_VIRTUAL_PREFIX

defaults.ts           ← lightweight (type-only imports)
├── getDefaultImportProtectionRules
└── getMarkerSpecifiers

matchers.ts           ← picomatch only
├── compileMatcher
├── compileMatchers
└── matchesAny

utils.ts              ← vite + node:path + local constants
├── normalizeFilePath, stripViteQuery, ...
└── extractImportSources, dedupePatterns, ...

trace.ts              ← imports from utils only
├── ImportGraph
├── buildTrace
└── formatViolation

virtualModules.ts     ← imports ../utils (parent), ../constants (parent)
├── generateSelfContainedMockModule, generateDevSelfDenialModule
├── loadMockEdgeModule, loadMockRuntimeModule
└── MOCK_MODULE_ID, MOCK_EDGE_PREFIX, ...

plugin.ts             ← main plugin, imports everything above
```

The `SERVER_FN_LOOKUP` constant lives in the shared parent `constants.ts`
(not in `start-compiler-plugin/plugin.ts`) to avoid pulling in
`@tanstack/start-server-core` when unit-testing import-protection modules.
