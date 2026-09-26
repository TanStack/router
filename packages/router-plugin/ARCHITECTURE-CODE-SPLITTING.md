# Automatic Code-Splitting Architecture

> Internal documentation for the TanStack Router code-splitting system.
> This covers the Yuku-based transform pipeline that splits route files into
> lazily-loaded modules (typically separate chunks) at build time.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Plugin Pipeline](#plugin-pipeline)
4. [Virtual File Mechanism](#virtual-file-mechanism)
5. [Shared Bindings System](#shared-bindings-system)
6. [Code Split Groupings](#code-split-groupings)
7. [Compiler Functions Reference](#compiler-functions-reference)
8. [Dead Code Elimination](#dead-code-elimination)
9. [Framework Support](#framework-support)
10. [Edge Cases and Gotchas](#edge-cases-and-gotchas)
11. [Module Graph Diagrams](#module-graph-diagrams)

---

## Overview

TanStack Router's automatic code-splitting transforms a single route file into
multiple modules at build time so that heavy route properties (components,
loaders) are loaded on demand rather than eagerly.

Given a route file like:

```tsx
// src/routes/about.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  loader: () => fetchAboutData(),
  component: () => <div>About page</div>,
})
```

The plugin produces up to three modules from the **same physical file**:

| Module                                    | What it contains                                                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `about.tsx` (reference)                   | Route config with `component` replaced by `lazyRouteComponent($$splitComponentImporter, 'component')` and an injected `const $$splitComponentImporter = () => import('about.tsx?tsr-split=component')` |
| `about.tsx?tsr-split=component` (virtual) | Only the component function, exported as `component`                                                                                                                                                   |
| `about.tsx?tsr-shared=1` (shared)         | Optional; created only when bindings are shared between split and non-split properties                                                                                                                 |

The bundler (Vite, Webpack, Rspack) treats query-parameterized imports as
distinct modules, so `about.tsx` and `about.tsx?tsr-split=component` are
separate entries in the module graph — each transformed differently by the
corresponding plugin.

### Why This Exists

Without code-splitting, every route's component tree ships in the initial
bundle. For large applications with dozens of routes, this means megabytes
of JavaScript the user downloads but never executes until they navigate to
that specific route. Automatic code-splitting solves this by:

1. Replacing component/loader values with lazy wrappers (dynamic `import()`)
2. Stripping the original implementations via dead-code elimination
3. Producing separate modules (typically separate chunks) the bundler can load on demand

---

## Architecture Diagram

```mermaid
flowchart TB
    subgraph "Physical File System"
        RF["src/routes/about.tsx<br/>(original source)"]
    end

    subgraph "Plugin 1: compile-reference-file"
        P1["Transform about.tsx<br/>• computeSharedBindings()<br/>• compileCodeSplitReferenceRoute()"]
    end

    subgraph "Plugin 2: compile-virtual-file"
        P2["Transform about.tsx?tsr-split=component<br/>• compileCodeSplitVirtualRoute()"]
    end

    subgraph "Plugin 3: compile-shared-file"
        P3["Transform about.tsx?tsr-shared=1<br/>• compileCodeSplitSharedRoute()"]
    end

    SBM[("sharedBindingsMap<br/>(closure-shared Map)")]

    RF --> P1
    P1 -->|"writes shared bindings"| SBM
    P1 -->|"emits import('...?tsr-split=...')"| P2
    P1 -->|"emits import('...?tsr-shared=1')\n(only when needed)"| P3
    SBM -->|"reads shared bindings"| P2
    SBM -->|"reads shared bindings"| P3

    subgraph "Bundler Output"
        REF["Reference module<br/>(Route config + lazy wrappers)"]
        SPLIT["Split module(s)<br/>(component, errorComponent, etc.)"]
        SHARED["Shared module<br/>(shared bindings, if any)"]
    end

    P1 --> REF
    P2 --> SPLIT
    P3 --> SHARED
```

---

## Plugin Pipeline

`unpluginRouterCodeSplitterFactory` (in `router-code-splitter-plugin.ts`)
returns an **array of 3 plugins** that share a closure containing:

- `sharedBindingsMap: Map<string, Set<string>>` — maps normalized file paths
  to their computed shared binding names
- `analyzedRoutes` — bounded LRU of immutable Yuku source analysis, reused by
  grouping detection, shared ownership, and output generation
- `userConfig` — resolved plugin configuration
- Helper functions for grouping resolution

### Immutable analysis and output ownership

`analyzeRouteModule()` parses and resolves bindings with Yuku once for a source
revision. It records route options, exports, and the dependency graph using
resolved symbol identities, so shadowed names and JSX references are distinct.
Each output gets its own AST copy with a map back to the original nodes. Output
mutation never changes the original semantic snapshot.

The plugin caches at most 128 analyses. Keys retain module query parameters
other than `tsr-split` and `tsr-shared`; cached analysis is reused only when the
source text also matches. Grouping decisions and generated output are not
cached, so client/server configuration stays local to each transform. Changed
source replaces the entry, and `buildEnd` clears retained ASTs.

### Plugin 1: `tanstack-router:code-splitter:compile-reference-file`

**Filter:** File IDs matching `/\.(m|c)?(j|t)sx?$/` whose code contains one of
`createFileRoute(`, `createRootRoute(`, or `createRootRouteWithContext(`.
Excludes file IDs that include `tsr-split` or `tsr-shared`.

**What it does:**

1. Detects per-route `codeSplitGroupings` if specified inline
2. Calls `computeSharedBindings()` and caches the result in `sharedBindingsMap`
3. Calls `compileCodeSplitReferenceRoute()` which:
   - Replaces split properties with `lazyRouteComponent()` / `lazyFn()` wrappers
   - Injects `import()` expressions pointing to `?tsr-split=<encoded>` URLs
   - Removes shared binding declarations, replacing them with
     `import { ... } from '...?tsr-shared=1'`
   - Re-exports any user-exported shared bindings via
     `export { ... } from '...?tsr-shared=1'`
   - Runs dead-code elimination
   - Optionally appends HMR handling code (dev mode)

**Vite hooks:**

- `configResolved`: Validates plugin ordering (router must come before JSX
  transformation plugins like `@vitejs/plugin-react`)
- `applyToEnvironment`: Scopes the plugin to a specific Vite environment when
  `plugin.vite.environmentName` is configured (needed for TanStack Start which
  creates separate client/SSR plugin instances)

### Plugin 2: `tanstack-router:code-splitter:compile-virtual-file`

**Filter:** File IDs containing `tsr-split`.

**What it does:**

1. Extracts the grouping from the `?tsr-split=<encoded>` query parameter
2. Decodes it via `decodeIdentifier()` to get the list of properties this
   virtual file should export (e.g., `['component']`)
3. Reads shared bindings from `sharedBindingsMap` for the base file
4. Calls `compileCodeSplitVirtualRoute()` which:
   - Constructs an output tree using the immutable source analysis
   - Keeps only the intended split properties as named exports
   - Converts user-exported declarations to imports from the base file
   - Adds `import { ... } from '...?tsr-shared=1'` if shared bindings exist
   - Runs dead-code elimination
   - Strips orphaned expression statements

**Vite hooks:**

- `applyToEnvironment`: Same environment scoping behavior as the reference
  plugin.

### Plugin 3: `tanstack-router:code-splitter:compile-shared-file`

**Filter:** File IDs containing `tsr-shared`.

**What it does:**

1. Extracts the base file path from the ID
2. Looks up shared bindings from `sharedBindingsMap`
3. Calls `compileCodeSplitSharedRoute()` which:
   - Keeps only declarations of shared bindings and their transitive
     dependencies
   - Strips `export` wrappers from kept declarations
   - Adds a single `export { ... }` statement for all shared bindings
   - Runs dead-code elimination to remove unused imports

**Vite hooks:**

- `applyToEnvironment`: Same environment scoping behavior as the reference
  plugin.

---

## Virtual File Mechanism

The system does **not** create actual virtual files. Instead, it leverages
the fact that bundlers (Vite, Webpack, Rspack) treat the same physical file
with different query parameters as distinct module IDs:

```
src/routes/about.tsx                        → Module A (reference)
src/routes/about.tsx?tsr-split=component    → Module B (virtual/split)
src/routes/about.tsx?tsr-shared=1           → Module C (shared)
```

All three modules start from the **same source code** — the bundler reads the
physical file each time. Each plugin's `transform` filter matches on different
query parameters, so each module gets a different transformation applied.

### Path ID Encoding

The `?tsr-split` query parameter value is an encoded representation of the
split grouping. The encoding (in `path-ids.ts`) works as follows:

1. Sort the property names alphabetically (grouping order is not preserved)
2. Join with `---` delimiter
3. Replace unsafe URL characters with safe tokens:
   - `/` → `--slash--`
   - `?` → `--question--`
   - `#` → `--hash--`
   - etc.

For example, a grouping of `['component']` becomes `?tsr-split=component`.
A combined grouping of `['component', 'errorComponent']` becomes
`?tsr-split=component---errorComponent`.

The decoding is the inverse: `decodeIdentifier()` reverses the token
replacements and splits on `---`.

Note: this encoding is not a general-purpose reversible scheme (it maps spaces
to `_` and decodes `_` back to spaces). It's safe here because split grouping
strings are known route option keys like `component` and `loader`.

### Resolution Flow

When the reference compiler emits:

```js
const $$splitComponentImporter = () => import('about.tsx?tsr-split=component')
```

The bundler:

1. Resolves `about.tsx?tsr-split=component` to the physical file `about.tsx`
   with the query parameter preserved
2. Reads the source of `about.tsx`
3. Runs the transform pipeline — Plugin 2 matches (`tsr-split` in ID) and
   transforms it into a module that exports only `component`
4. The result is a separate module in the output graph (often a separate chunk, depending on bundler chunking)

---

## Shared Bindings System

### The Problem

Consider a route file with a module-level variable used by both the `loader`
(non-split by default) and the `component` (split by default):

```tsx
const cache = new Map()
function getCached(key: string) {
  return cache.get(key)
}
function setCached(key: string, val: unknown) {
  cache.set(key, val)
}

export const Route = createFileRoute('/cached')({
  loader: async () => {
    setCached('data', await fetch('/api').then((r) => r.json()))
    return getCached('data')
  },
  component: () => <div>{JSON.stringify(getCached('data'))}</div>,
})
```

Without the shared bindings system, `cache` and `getCached` would be
**duplicated** — one copy in the reference module (used by `loader`) and another
in the split component module. Each would have its own `Map` instance, so
`setCached` in the loader would write to a different map than `getCached` in
the component reads from. This is a **correctness bug**, not just a bundle
size issue.

### The Solution

`computeSharedBindings()` identifies bindings that are referenced by properties
in 2+ distinct "groups" (where each split grouping index is one group, and all
non-split properties form group `-1`). These bindings are extracted into a
third virtual module (`?tsr-shared=1`) that both the reference module and the
split modules import from, ensuring a single shared instance.

### How `computeSharedBindings()` Works

**Location:** `src/core/code-splitter/compilers.ts` (`computeSharedBindings`)

**Algorithm:**

1. Use the analyzed module's root-scope symbols and resolved declarations.
   Imports and the `Route` singleton cannot be extracted.
2. Attribute each route property to a split group, or group `-1` for eager
   properties. Ignore fallback values and the grouping configuration itself.
3. Collect runtime references using Yuku's resolved references, excluding
   type-only positions and locally shadowed bindings. Follow transitive
   declaration dependencies without following `Route` into the whole route.
4. Extract symbols reached from at least two groups. Bindings from one
   destructured initializer form one unit, including unreferenced siblings.
5. Exclude every symbol that transitively depends on `Route`, including its
   destructured siblings, to preserve the single reference-module instance.

### Concrete Example

**Input** (`shared-function.tsx`):

```tsx
import { createFileRoute } from '@tanstack/react-router'

const cache = new Map()
function getCached(key: string) {
  return cache.get(key)
}
function setCached(key: string, val: unknown) {
  cache.set(key, val)
}

export const Route = createFileRoute('/cached')({
  loader: async () => {
    setCached('data', await fetch('/api').then((r) => r.json()))
    return getCached('data')
  },
  component: () => <div>{JSON.stringify(getCached('data'))}</div>,
})
```

**Analysis:**

- `loader` is non-split (group `-1`), references: `setCached`, `getCached`
- `component` is split (group `0`), references: `getCached`
- `getCached` appears in groups `-1` and `0` → **shared**
- `getCached` depends on `cache` → `cache` is transitively shared
- `setCached` appears only in group `-1` → **not shared**

**Output — Reference file** (`shared-function.tsx`):

```tsx
import { getCached, cache } from 'shared-function.tsx?tsr-shared=1'
const $$splitComponentImporter = () =>
  import('shared-function.tsx?tsr-split=component')
import { lazyRouteComponent } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
function setCached(key: string, val: unknown) {
  cache.set(key, val)
}
export const Route = createFileRoute('/cached')({
  loader: async () => {
    setCached('data', await fetch('/api').then((r) => r.json()))
    return getCached('data')
  },
  component: lazyRouteComponent($$splitComponentImporter, 'component'),
})
```

**Output — Split module** (`shared-function.tsx?tsr-split=component`):

```tsx
import { getCached } from 'shared-function.tsx?tsr-shared=1'
const SplitComponent = () => <div>{JSON.stringify(getCached('data'))}</div>
export { SplitComponent as component }
```

**Output — Shared module** (`shared-function.tsx?tsr-shared=1`):

```tsx
const cache = new Map()
function getCached(key: string) {
  return cache.get(key)
}
export { cache, getCached }
```

Note how `setCached` is **not** in the shared module — it's only used by
`loader` (non-split), so it stays in the reference file. The reference file
imports `cache` (needed by `setCached`) from the shared module.

### Cross-Plugin Communication

The three plugins share a closure containing `sharedBindingsMap`:

```
Plugin 1 (reference): computeSharedBindings() → sharedBindingsMap.set(id, bindings)
Plugin 2 (virtual):   sharedBindingsMap.get(baseId) → pass to compileCodeSplitVirtualRoute()
Plugin 3 (shared):    sharedBindingsMap.get(baseId) → pass to compileCodeSplitSharedRoute()
```

This works because all three plugins run in the same JavaScript process and
the map is captured by closure. In typical builds, the reference module is
transformed first and then the bundler resolves the emitted dynamic imports,
which triggers transformations for the virtual/shared module IDs.

---

## Code Split Groupings

### Default Groupings

Defined in `constants.ts`:

```ts
export const defaultCodeSplitGroupings: CodeSplitGroupings = [
  ['component'], // group 0 → separate module ID (often a separate chunk)
  ['errorComponent'], // group 1 → separate module ID (often a separate chunk)
  ['notFoundComponent'], // group 2 → separate module ID (often a separate chunk)
]
```

**Important:** `loader` is **not** split by default. It stays in the reference
file alongside non-split properties like `beforeLoad`, `validateSearch`,
`context`, etc.

### Splittable Properties

Only these 5 properties can be split (defined in `splitRouteIdentNodes`):

- `loader`
- `component`
- `pendingComponent`
- `errorComponent`
- `notFoundComponent`

Any property not in `splitRouteIdentNodes` is never split, regardless of
configuration.

### How Groupings Work

Each array within the groupings array represents one split module ID.
Properties in the same inner array end up in the same split module:

```ts
// Default: 3 separate split module IDs (often 3 separate chunks)
;[['component'], ['errorComponent'], ['notFoundComponent']][
  // Combined: component + loader in one module, error in another
  (['component', 'loader'], ['errorComponent'])
][
  // All in one module
  ['component', 'loader', 'errorComponent', 'notFoundComponent']
]
```

### Configuring Groupings

There are three levels of configuration, applied with this priority:

1. **Per-route inline** (highest priority):

   ```tsx
   export const Route = createFileRoute('/about')({
     codeSplitGroupings: [['component', 'loader']],
     component: ...,
     loader: ...,
   })
   ```

2. **Per-route via plugin** (`splitBehavior` callback):

   ```ts
   tanstackRouter({
     codeSplittingOptions: {
       splitBehavior: ({ routeId }) => {
         if (routeId === '/dashboard') return [['component', 'loader']]
         return undefined // use default
       },
     },
   })
   ```

3. **Global default** (`defaultBehavior`):
   ```ts
   tanstackRouter({
     codeSplittingOptions: {
       defaultBehavior: [['component', 'loader'], ['errorComponent']],
     },
   })
   ```

### `findIndexForSplitNode()`

This function determines which group a property belongs to:

```ts
function findIndexForSplitNode(str: string) {
  return opts.codeSplitGroupings.findIndex((group) =>
    group.includes(str as any),
  )
}
```

Returns the group index (`0`, `1`, `2`, ...) for split properties, or `-1`
for properties not in any group (non-split properties like `beforeLoad`,
`validateSearch`, `context`, etc.).

The group index `-1` is treated as its own group in the shared bindings
computation — it represents "stays in the reference file."

---

## Compiler Functions Reference

All compiler functions live in `compilers.ts`.

### `compileCodeSplitReferenceRoute()`

**Purpose:** Transform the original route file into the "reference" module.

**Input:** Original source code, split groupings, framework target, options.

**Output:** Modified source where split properties are replaced with lazy
wrappers, shared bindings are replaced with imports, and dead code is
eliminated.

**Key steps:**

1. Reuse source analysis and clone an output tree with semantic provenance
2. For each split-able property in route options:
   - Check if the value is exported (if so, skip splitting — warn user)
   - Generate a dynamic import URL: `splitFilename()`
   - Create importer: `const $$splitComponentImporter = () => import('...')`
   - Replace property value with `lazyRouteComponent(importer, 'component')`
     or `lazyFn(importer, 'loader')`
3. Remove unused import paths
4. If shared bindings exist:
   - Remove shared declarations from AST
   - Add `import { ... } from '...?tsr-shared=1'`
   - Re-export user-exported shared bindings
5. Run `removeUnusedBindings()`
6. Generate output code with source maps

### `compileCodeSplitVirtualRoute()`

**Purpose:** Transform a copy of the route file into a split module that
exports only specific properties.

**Input:** Original source code, split targets (e.g., `['component']`),
shared bindings set.

**Output:** A module that exports only the intended properties.

**Key steps:**

1. Reuse source analysis and clone an output tree
2. Resolve shared declaration ownership against the original symbols
3. Track split-able nodes and their metadata
4. For each intended split target:
   - Resolve the property value through bindings
   - Create a named export (e.g., `export { SplitComponent as component }`)
5. Convert remaining user exports to imports from the base file
6. Add shared bindings import if applicable
7. Run `removeUnusedBindings()`
8. Strip orphaned expression statements
9. Generate output with source maps

### `compileCodeSplitSharedRoute()`

**Purpose:** Produce the shared virtual module containing only the shared
binding declarations.

**Input:** Original source code, set of shared binding names.

**Output:** A module that declares and exports only shared bindings and their
transitive dependencies.

**Key steps:**

1. Reuse source analysis and clone an output tree
2. Build dependency graph, expand shared bindings transitively
3. Filter `program.body` to keep only:
   - Import declarations (DCE removes unused ones)
   - Declarations of bindings in the keep set
4. Strip `export` wrappers from kept declarations
5. Add `export { ... }` for all shared bindings
6. Run `removeUnusedBindings()`
7. Generate output with source maps

### `computeSharedBindings()`

**Purpose:** Analyze a route file to determine which module-level bindings
are referenced by multiple split groups.

See [Shared Bindings System](#shared-bindings-system) for the full algorithm.

### `detectCodeSplitGroupingsFromRoute()`

**Purpose:** Parse inline `codeSplitGroupings` from route options.

Traverses the AST looking for a `codeSplitGroupings` property on the route
options object (supports both `createFileRoute` and `createRoute` call sites).
If found, extracts the array-of-arrays value and returns it.

### Native helpers

| Function                    | Purpose                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `analyzeRouteModule()`      | Build the immutable route syntax and semantic model.                                          |
| `moduleDeclarationGraph()`  | Map resolved symbols to declaration units and runtime dependencies.                           |
| `collectModuleReferences()` | Collect actual module-scope references, including JSX and excluding shadowed/type-only names. |
| `expandTransitively()`      | Return a dependency closure without mutating its input.                                       |
| `cloneModuleAst()`          | Create an output AST and preserve original-node provenance.                                   |
| `removeUnusedBindings()`    | Retain output dependencies using surviving semantic references.                               |
| `generateModule()`          | Print native ASTs with Yuku and original-source maps.                                         |

---

## Dead Code Elimination

Each compiler first decides which declarations belong to its output, then calls
`removeUnusedBindings()` from `@tanstack/router-utils`. This reconstructs
liveness from **surviving** references in the output tree; the original semantic
tables are never assumed to update after mutation.

Source nodes retain their original symbol identity through the clone map.
Compiler-created references explicitly identify their intended symbol/name via
`linkGeneratedReference()`. Parsed compiler snippets carry native reference
provenance too. This avoids treating a new local or property name as a reference
to an unrelated original binding.

Exports and top-level effects seed liveness. Dependency closure keeps nested
captures and whole destructured initializers together. Originally unused user
declarations remain in the reference output rather than silently discarding
intentional initializers; shared output retains only its explicitly owned
bindings and dependencies. Unused original and generated imports are removed.

Standalone source effects stay in the reference module. Virtual outputs remove
expression statements that do not belong to their retained local declarations;
shared outputs include declarations rather than duplicating standalone effects.

Directive prologues remain at the beginning of nonempty outputs: injected imports
and lazy helpers are inserted after them. A virtual output containing only
directives is empty. Code generation preserves comments/annotations and uses the
original source spans for source maps.

Framework compiler hooks receive native programs, source modules, and explicit
insertion/renaming operations. They no longer receive Babel node paths or scope
objects.

---

## Framework Support

The code-splitting system is framework-agnostic at the native AST transform level.
Framework differences are confined to `framework-options.ts`:

| Framework | Package                  | `createFileRoute` | `lazyFn` | `lazyRouteComponent` |
| --------- | ------------------------ | ----------------- | -------- | -------------------- |
| React     | `@tanstack/react-router` | `createFileRoute` | `lazyFn` | `lazyRouteComponent` |
| Solid     | `@tanstack/solid-router` | `createFileRoute` | `lazyFn` | `lazyRouteComponent` |
| Vue       | `@tanstack/vue-router`   | `createFileRoute` | `lazyFn` | `lazyRouteComponent` |

Currently all frameworks use the same identifier names. The framework option
is used to determine which package to import `lazyRouteComponent` and `lazyFn`
from.

### Plugin Order Validation (Vite only)

The reference plugin's `configResolved` hook checks that the TanStack Router
plugin appears **before** JSX transformation plugins in the Vite config. This
is required because the code-splitter must transform the source before JSX
is compiled away. Validated plugins:

- **React:** `@vitejs/plugin-react` (Babel), `@vitejs/plugin-react-swc` (SWC),
  `@vitejs/plugin-react-oxc` (OXC)
- **Solid:** `vite-plugin-solid`

If the order is wrong, the plugin throws an error with a suggested fix.

### Environment Scoping

When `userConfig.plugin?.vite?.environmentName` is set, all three plugins use
`applyToEnvironment` to restrict themselves to that specific Vite environment.
This is necessary for TanStack Start, which creates separate plugin instances
for client and SSR environments.

---

## Edge Cases and Gotchas

### 1. Exported Identifiers Are Not Split

If a value for a splittable route option is exported from the route file
(e.g. `export const MyComp = ...` used as `component: MyComp`), the plugin
**skips** splitting it. The value stays in the reference file and a warning is
emitted:

```
[tanstack-router] These exports from "about.tsx" will not be code-split and will increase your bundle size:
- MyComp
For the best optimization, these items should either have their export statements removed, or be imported from another location that is not a route file.
```

This is because other modules may import `MyComp` directly, and splitting it
would break those imports. (In dev, the warning is also injected into the
compiled output as a `console.warn` to make it obvious during local testing.)

### 2. Root Routes Are Never Split

Only `createFileRoute()` definitions enter the splitting phase. Root factories
still receive the framework's HMR handling.

### 3. `undefined`, `null`, and `boolean` Values Are Kept In-Place

Properties with these literal values are not split:

```tsx
createFileRoute('/about')({
  component: undefined, // kept in reference
  errorComponent: false, // kept in reference
  notFoundComponent: null, // kept in reference
})
```

These represent "fall back to parent route" semantics and must not be moved.

### 4. Destructured Declarations Must Be Shared Atomically

```tsx
const { a, b } = createHelpers()
```

If `a` is used by `component` (split) and `b` is used by `loader` (non-split),
the entire `const { a, b } = createHelpers()` declaration must go to the
shared module. You can't split the initialization — calling `createHelpers()`
twice would be incorrect.

### 5. Route-Dependent Bindings Cannot Be Shared

```tsx
const routePath = Route.fullPath
function useRouteStuff() {
  return routePath
}
```

Even if `useRouteStuff` is referenced by multiple groups, it cannot be
extracted to the shared module because it depends on `Route`. Extracting it
would require `Route` in the shared module, duplicating the route singleton.
`computeSharedBindings()` excludes these bindings through the reverse dependency
graph, including their destructured declaration siblings.

### 6. Shared Imports Replace Their Original Declarations

An output cannot retain both a shared declaration and its replacement import.
The compiler removes the complete original declaration, then adds the shared
import. All dependency decisions still use the immutable source module's
symbols; output clones are never analyzed while partially transformed.
Exports, including multiple aliases and quoted names, are redirected to the
same shared binding.

### 7. Directive Prologues Survive Code-Splitting

Yuku represents directives (like `'use client'`) as expression statements with
directive metadata in `program.body`. Injected imports and helpers are placed
after the directive prologue. Shared and virtual output filtering explicitly
preserves directives; a virtual output with no other statements becomes empty.

### 8. Plugin Ordering in the Array Matters

The 3 plugins must be returned in order: reference, virtual, shared. The
reference plugin populates `sharedBindingsMap` before the other two consume
it. Bundlers process transforms in plugin array order for a given module ID.

### 9. Imported Bindings Are Never Shared

`computeSharedBindings()` only considers **locally-declared** module-level
bindings. Import statements are handled by the bundler's module system — if
both the reference file and a virtual file import the same external module,
the bundler deduplicates that import automatically. No shared module needed.

### 10. Split Strategy per Property

Each splittable property has a configured split strategy:

| Property            | Strategy             | Wrapper                                     |
| ------------------- | -------------------- | ------------------------------------------- |
| `component`         | `lazyRouteComponent` | Wraps with Suspense-compatible lazy loading |
| `pendingComponent`  | `lazyRouteComponent` | Same                                        |
| `errorComponent`    | `lazyRouteComponent` | Same                                        |
| `notFoundComponent` | `lazyRouteComponent` | Same                                        |
| `loader`            | `lazyFn`             | Wraps as a lazy function call               |

Components use `lazyRouteComponent` (framework-provided). In React this
integrates with Suspense-compatible lazy loading. Loaders use `lazyFn` which
wraps the async function for deferred loading.

### 11. Source Maps Are Preserved

All three compilers pass `sourceMaps: true` and `sourceFileName` to
`generateFromAst()`, ensuring the browser's devtools can map back to the
original source file.

---

## Module Graph Diagrams

### Simple Route (No Shared Bindings)

```mermaid
graph LR
    subgraph "Reference Module"
        REF["about.tsx"]
    end

    subgraph "Split Module"
        COMP["about.tsx?tsr-split=component"]
    end

    REF -->|"() => import()"| COMP
```

When the route has no module-level bindings shared between split and non-split
properties, there is no shared module. The reference module has a dynamic
import to the split module.

### Route With Shared Bindings

```mermaid
graph LR
    subgraph "Reference Module"
        REF["cached.tsx"]
    end

    subgraph "Split Module"
        COMP["cached.tsx?tsr-split=component"]
    end

    subgraph "Shared Module"
        SHARED["cached.tsx?tsr-shared=1"]
    end

    REF -->|"() => import()"| COMP
    REF -->|"import { getCached, cache }"| SHARED
    COMP -->|"import { getCached }"| SHARED
```

The shared module is imported synchronously by both the reference module and
the split module. Bundlers will usually dedupe this to a single module instance;
whether it becomes a separate chunk or gets inlined into another chunk depends
on the bundler's chunking strategy.

### Route With Multiple Split Groups

```mermaid
graph LR
    subgraph "Reference Module"
        REF["dashboard.tsx"]
    end

    subgraph "Split Modules"
        COMP["dashboard.tsx?tsr-split=component"]
        ERR["dashboard.tsx?tsr-split=errorComponent"]
        NF["dashboard.tsx?tsr-split=notFoundComponent"]
    end

    subgraph "Shared Module"
        SHARED["?tsr-shared=1"]
    end

    REF -->|"() => import()"| COMP
    REF -->|"() => import()"| ERR
    REF -->|"() => import()"| NF
    REF --> SHARED
    COMP --> SHARED
    ERR --> SHARED
    NF --> SHARED
```

Each split group gets its own split module. If a binding is shared across any
two of these (or between a split module and the reference module), it lives in
the shared module.

### Combined Groupings

```mermaid
graph LR
    subgraph "Reference Module"
        REF["page.tsx"]
    end

    subgraph "Split Module"
        COMBINED["page.tsx?tsr-split=component---loader"]
    end

    REF -->|"() => import()"| COMBINED
```

When `component` and `loader` are in the same grouping
(`[['component', 'loader']]`), they end up in a single split module. This
reduces the number of split modules (and likely requests) at the cost of
loading the loader even when only the component is needed (and vice versa).

---

## Key Source Files

| File                                          | Description                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/core/router-code-splitter-plugin.ts`     | Plugin factory — creates 3 plugins, manages `sharedBindingsMap`              |
| `src/core/code-splitter/compilers.ts`         | All compiler functions (~1,970 lines)                                        |
| `src/core/constants.ts`                       | `tsrSplit`, `tsrShared`, `splitRouteIdentNodes`, `defaultCodeSplitGroupings` |
| `src/core/code-splitter/framework-options.ts` | Per-framework package/ident configuration                                    |
| `src/core/code-splitter/path-ids.ts`          | URL-safe encoding/decoding for split identifiers                             |
| `src/core/config.ts`                          | Plugin configuration types and validation                                    |
| `src/core/route-hmr-statement.ts`             | HMR handling code template                                                   |
| `tests/code-splitter/`                        | Unit tests and snapshot fixtures                                             |
