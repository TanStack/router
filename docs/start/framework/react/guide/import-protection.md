---
id: import-protection
title: Import Protection
---

Import protection prevents server-only code from leaking into client bundles and client-only code from leaking into server bundles. It runs inside TanStack Start and is enabled by default.

## How It Works

TanStack Start builds your application for two environments: **client** and **server**. Some code should only run in one environment. Import protection checks every import in your source files during development and build, and either blocks or mocks imports that cross environment boundaries.

There are two ways an import can be denied:

- **File patterns** match on the resolved file path. By default, `*.server.*` files are denied in the client environment and `*.client.*` files are denied in the server environment.
- **Specifier patterns** match on the raw import string. By default, `@tanstack/react-start/server` is denied in the client environment.

## Default Rules

Import protection is enabled out of the box with these defaults:

| Setting            | Default                                         |
| ------------------ | ----------------------------------------------- |
| `behavior` (dev)   | `'mock'` -- warn and replace with a mock module |
| `behavior` (build) | `'error'` -- fail the build                     |
| `log`              | `'once'` -- deduplicate repeated violations     |
| Scope              | Files inside Start's `srcDirectory`             |

**Client environment denials:**

- Files matching `**/*.server.*`
- The specifier `@tanstack/react-start/server`
- Excluded from file checks: `**/node_modules/**`

**Server environment denials:**

- Files matching `**/*.client.*`
- Excluded from file checks: `**/node_modules/**`

By default, files inside `node_modules` are excluded from resolved-target deny checks via the `excludeFiles` option. This prevents false positives from third-party packages whose resolved filenames contain `.client.` or `.server.`. If you need to check third-party files, set `excludeFiles: []` on the relevant environment — see [Configuring Deny Rules](#configuring-deny-rules).

These defaults mean you can use the `.server.ts` / `.client.ts` naming convention to restrict files to a single environment without any configuration. To also deny entire directories (e.g. `server/` or `client/`), add them via `files` in your [deny rules configuration](#configuring-deny-rules) — for example `files: ['**/*.server.*', '**/server/**']` for the client environment.

## Pattern Imports

Imports your bundler expands from a pattern, such as `import.meta.glob`, a template literal `import()` or Rsbuild's `import.meta.webpackContext`, are checked too. A denied file one of them reaches is replaced by its mock (for every importer: the file itself is mocked) and reported. A build names each module importing it; in dev the report names the denied file, which the dev server compiles before it knows what imports it. The file is kept as it is when an exempt importer (see [Scoping and Exclusions](#scoping-and-exclusions)) imports it with a plain import, or when `onViolation` allows it. A pattern import from an exempt importer still gets the mock (see [Limitations](#limitations)).

On the client, a file rule judges the denied file itself, wherever it lives in your project: a pattern that reaches `../lib/*.server.ts`, or a file `exclude` matches, gets the mock and is reported. `srcDirectory`, `include` and `exclude` decide which importers are checked, not which files can be denied. On Vite this covers non-code files too (`./*.server.json`); on Rsbuild, `new URL` of a non-code file and asset queries. A package's own files in `node_modules` are not judged this way.

Asset queries are checked the same way: `?raw`, `?url`, `?inline`, `?worker` and `?sharedworker` of a denied file, in a plain import or through a pattern (`import.meta.glob('./*.ts', { query: '?raw' })`), give the client the mock, never the file's text. On the server, only a plain import of a file a server rule denies is checked: a text or a URL runs nothing of a client-only file there.

```ts
// src/routes/admin.tsx: reported, and the client gets a mock of db.server.ts
const modules = import.meta.glob('../lib/*.ts')
```

## Type-Only Imports

Type-only imports and re-exports are ignored by import protection because they are erased from the runtime bundle and cannot leak environment-specific code.

```ts
import type { User } from './db.server'
import { type RequestHandler } from '@tanstack/react-start/server'

export type { User } from './db.server'
```

Mixed imports still count when they include at least one runtime value. Split the type and value imports if only the type is safe to cross the environment boundary.

```ts
// This is still checked because `getUsers` is a runtime value.
import { type User, getUsers } from './db.server'
```

A value import whose bindings are only used as types (or not at all) is judged by what your bundler keeps. Its TypeScript transform erases such an import unless `verbatimModuleSyntax` applies: Vite reads it from the tsconfig that covers the file, Rsbuild from `tools.swc`. Import protection does not read tsconfig itself. It reports the import only when the bundler loads it, and an erased import is never reported. Write `import type` when only the type should cross the boundary.

```ts
// Reported only if the bundler keeps the import (verbatimModuleSyntax).
import { User } from './db.server'
export type Props = { user: User }
```

## File Markers

You can explicitly mark a module as server-only or client-only by adding a side-effect import at the top of the file:

```ts
// src/lib/secrets.ts
import '@tanstack/react-start/server-only'

export const API_KEY = process.env.API_KEY
```

```ts
// src/lib/local-storage.ts
import '@tanstack/react-start/client-only'

export function savePreferences(prefs: Record<string, string>) {
  localStorage.setItem('prefs', JSON.stringify(prefs))
}
```

When the plugin sees a marker import, it records the file as restricted. If that file is later imported from the wrong environment, the import is denied. Both markers in the same file is always an error.

Markers are useful when a file doesn't follow the `.server.*` / `.client.*` naming convention but still contains environment-specific code.

## Behavior Modes

The `behavior` option controls what happens when a violation is detected:

- **`'error'`** -- The build fails with a detailed error message. This is the default for production builds.
- **`'mock'`** -- The import is replaced with a mock module that returns safe proxy values. A warning is logged but the build continues. This is the default during development.

Mock mode is useful during development because it lets you keep working even when your import graph has violations. The mock module returns a recursive Proxy, so any property access or function call on a mocked import returns another mock instead of crashing.

You can override the defaults:

<!-- ::start:tabs variant="bundler" -->

# Vite

```ts title="vite.config.ts"
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

export default defineConfig({
  plugins: [
    tanstackStart({
      importProtection: {
        // Always error, even in dev
        behavior: 'error',
      },
    }),
  ],
})
```

# Rsbuild

```ts title="rsbuild.config.ts"
import { defineConfig } from '@rsbuild/core'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'

export default defineConfig({
  plugins: [
    tanstackStart({
      importProtection: {
        // Always error, even in dev
        behavior: 'error',
      },
    }),
  ],
})
```

<!-- ::end:tabs -->

Or set different behaviors per mode:

```ts
importProtection: {
  behavior: {
    dev: 'mock',
    build: 'error',
  },
}
```

## Configuring Deny Rules

You can add your own deny rules on top of the defaults. Rules are specified per environment using glob patterns (via [picomatch](https://github.com/micromatch/picomatch)) or regular expressions.

<!-- ::start:tabs variant="bundler" -->

# Vite

```ts title="vite.config.ts"
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

export default defineConfig({
  plugins: [
    tanstackStart({
      importProtection: {
        client: {
          // Block specific npm packages from the client bundle
          specifiers: ['@prisma/client', 'bcrypt'],
          // Block files in a custom directory
          files: ['**/db/**'],
        },
        server: {
          // Block browser-only libraries from the server
          specifiers: ['localforage'],
        },
      },
    }),
  ],
})
```

# Rsbuild

```ts title="rsbuild.config.ts"
import { defineConfig } from '@rsbuild/core'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'

export default defineConfig({
  plugins: [
    tanstackStart({
      importProtection: {
        client: {
          // Block specific npm packages from the client bundle
          specifiers: ['@prisma/client', 'bcrypt'],
          // Block files in a custom directory
          files: ['**/db/**'],
        },
        server: {
          // Block browser-only libraries from the server
          specifiers: ['localforage'],
        },
      },
    }),
  ],
})
```

<!-- ::end:tabs -->

### Checking third-party packages

By default, resolved files inside `node_modules` are excluded from resolved-target deny checks (file-pattern and marker checks). This avoids false positives from packages that happen to use `.client.` or `.server.` in their distribution filenames. If you want to re-enable checking for a specific environment, set `excludeFiles` to an empty array:

```ts
importProtection: {
  server: {
    // Re-enable file-pattern checking for node_modules in the server environment
    excludeFiles: [],
  },
}
```

When you provide `excludeFiles`, it **fully replaces** the default (`['**/node_modules/**']`). To exclude additional paths while still skipping `node_modules`, include both:

```ts
importProtection: {
  client: {
    excludeFiles: ['**/node_modules/**', '**/vendor/**'],
  },
}
```

## Scoping and Exclusions

By default, import protection only checks files inside Start's `srcDirectory`. You can change the scope with `include`, `exclude`, and `ignoreImporters`:

```ts
importProtection: {
  // Only check files matching these patterns
  include: ['src/**'],
  // Skip checking these files
  exclude: ['src/generated/**'],
  // Ignore violations when these files are the importer
  ignoreImporters: ['**/*.test.ts', '**/*.spec.ts'],
}
```

## What the Compiler Guarantees

Server code stays out of the client when it is written with these primitives:

- **Server functions** (`createServerFn`): the client gets a call to the server, never the handler.
- **`createServerOnlyFn`** and the `.server()` of `createIsomorphicFn` and `createMiddleware`: the client never gets the implementation.
- **`.server` files and `server-only` markers**, through import protection: the client build fails, or gets a mock.
- **A route's `server` option**: removed from the client.

A use of these the compiler cannot follow (a builder passed to another function, stored in an object, a namespace object holding one passed around) fails the client build.

The compiler reads your code statically, which limits this guarantee:

- `import()`, `require()` and `import.meta.glob` of a builder are not followed, and nothing reports them. Attach server code to a builder you imported statically.
- Modules other plugins generate or rewrite (virtual modules, auto-imports, `ProvidePlugin`) are not followed either.
- A `.server` file behind a neutral module outside the protected scope (`srcDirectory`, `include`) isn't caught: the scope is about importers.
- Only the route factory call bound to a file's `Route` export has its `server`, `ssr` and `headers` removed. Another call with them written in its options fails the build, including one through another name (`const f = createFileRoute`); another call with options the compiler can't read warns. Code-based `createRoute` isn't supported by Start, and nothing removes its `server`.
- Route options the compiler can't read build with a warning: a spread (`{ ...shared, component }`), options from a call or an import (`createFileRoute('/x')(makeOptions())`) or written to after their declaration, and a computed key. What they hold isn't code-split or removed, so any server code in them ships to the client. Write `server`, `ssr` and `headers` as properties of the options object in the route file, outside the spread. No warning: a spread of a local object literal only that spread reads, naming none of them, and a computed key naming a local string const (it stays unsplit). An edit of a route with options from a call or an import reloads the page.

Everything else is ordinary code. A plain call in a declaration that client code also reads ships to the client, with its import:

```ts
import { readSecret } from './secrets' // not a .server file, so not denied

const config = { name: 'app', secret: readSecret() }

export const appName = () => config.name // the client reads config, so readSecret() ships
```

Arguments ship too. A parameter only server code reads gets a build warning, because its calls keep their arguments on the client:

```ts
// warns: 'admin' still ships to the client
const requireRole = (role: string) =>
  createMiddleware().server(({ next }) => check(role, next))

export const adminOnly = requireRole('admin')
```

A parameter passed directly as the server code, as in `(fn) => createServerOnlyFn(fn)` or `(schema) => createServerFn().validator(schema)`, fails the build: the wrapper's argument would ship.

To write safe code:

- Call server-only code inside a server function, `createServerOnlyFn` or `.server()`.
- Keep modules that hold secrets in `.server` files, so import protection catches any import that survives.
- Read secrets inside the server code, not through parameters.

## Limitations

A denied file is judged when it is compiled, from the imports import protection has read so far. Some imports are not honored there, so the file is replaced by its mock even though its importer is not checked. Both err on the safe side: server code never reaches the client. A dev server warns about the denied file. A build prints one warning per denied file whose every importer is unchecked, naming the file, its importers and the fix below. These warnings are not violations: `onViolation` is not called, and the `error` behavior does not fail the build.

An exempt importer that reaches a denied file only through a pattern import:

```ts
// src/generated/registry.ts, with exclude: ['src/generated/**']
// the client gets mocks of the matched *.server.ts files
const modules = import.meta.glob('../lib/*.server.ts', { eager: true })
```

An importer outside the scope (`srcDirectory` or `include`) that imports a denied file inside it:

```ts
// lib/env.ts, outside srcDirectory: the client gets a mock of db.server.ts
import { db } from '../src/lib/db.server'
```

An importer outside the scope, or a package in `node_modules`, that reaches a denied file outside the scope only through a pattern import, or a `new URL` from an exempt or out-of-scope module on Rsbuild. A plain `import` from a module outside the scope keeps the real module of a denied file outside the scope.

To get the real module, write the import statically (a plain `import`), in a module inside the scope that `exclude` or `ignoreImporters` exempts.

A real module an unchecked importer keeps is one module: a pattern import from a checked importer that reaches the same file is reported, and under `behavior: 'mock'` may then get that real module too. Under `behavior: 'error'` the build fails either way.

Not covered, as in earlier versions: a `?worker`'s own imports and `new URL` of a denied file on Vite, a marked non-script file (`.mdx`, `.vue`) or a marked file that does not parse with an asset query, and a plain pattern of a non-code file on Rsbuild.

A dev server also warns about a denied file it compiles without any importer, for example when a `server.warmup` glob matches `*.server.ts` files. This is a warning, not a leak: the client gets the file's mock.

## Reading Violation Traces

When a violation is detected, the plugin shows a diagnostic message with the full import chain that led to the violation, a code snippet highlighting the offending line, and actionable suggestions.

### Server-only code in the client

This example shows a `*.server.*` file being imported transitively in the client environment:

```text
[import-protection] Import denied in client environment

  Denied by file pattern: **/*.server.*
  Importer: src/features/auth/session.ts:5:27
  Import: "../db/queries.server"
  Resolved: src/db/queries.server.ts

  Trace:
    1. src/routes/index.tsx:2:34 (entry) (import "../features/auth/session")
    2. src/features/auth/session.ts:5:27 (import "../db/queries.server")

  Code:
     3 | import { logger } from '../utils/logger'
     4 |
  >  5 | import { getUsers } from '../db/queries.server'
       |                           ^
     6 |
     7 | export function loadAuth() {

  src/features/auth/session.ts:5:27

  Suggestions:
    - Wrap in createServerFn().handler(() => ...) to make it callable from the client via RPC
    - Wrap in createServerOnlyFn(() => ...) if it should not be callable from the client
    - Use createIsomorphicFn().client(() => ...).server(() => ...) for environment-specific implementations
    - Split the file so client-safe exports are separate
```

### Client-only code on the server

This example shows a `*.client.*` file imported in the SSR environment. Because the code snippet contains JSX, the `<ClientOnly>` suggestion is shown first:

```text
[import-protection] Import denied in server environment

  Denied by file pattern: **/*.client.*
  Importer: src/components/dashboard.tsx:3:30
  Import: "./browser-widget.client"
  Resolved: src/components/browser-widget.client.tsx

  Trace:
    1. src/routes/dashboard.tsx:1:32 (entry) (import "../components/dashboard")
    2. src/components/dashboard.tsx:3:30 (import "./browser-widget.client")

  Code:
     1 | import { BrowserWidget } from './browser-widget.client'
     2 |
  >  3 | export function Dashboard() { return <BrowserWidget /> }
       |                              ^
     4 |

  src/components/dashboard.tsx:3:30

  Suggestions:
    - Wrap in <ClientOnly fallback={...}>...</ClientOnly> to render only after hydration
    - Wrap in createClientOnlyFn(() => ...) if it should only run in the browser
    - Use createIsomorphicFn().client(() => ...).server(() => ...) for environment-specific implementations
    - Split the file so server-safe exports are separate
```

### How to read the output

Each violation message has these sections:

| Section                          | Description                                                                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Header**                       | Environment type where the violation occurred (`"client"` or `"server"`)                                                                                         |
| **Denied by**                    | The rule that matched: file pattern, specifier pattern, or marker                                                                                                |
| **Importer / Import / Resolved** | The importing file (with `file:line:col`), the raw import string, and the resolved target path                                                                   |
| **Trace**                        | The full import chain from the entry point to the denied import. Each step shows `file:line:col` and the import specifier used. Step 1 is always the entry point |
| **Code**                         | A source code snippet with a `>` marker on the offending line and a `^` caret pointing to the exact column                                                       |
| **Suggestions**                  | Actionable steps to fix the violation, tailored to the direction (server-in-client vs client-in-server)                                                          |

The trace reads top-to-bottom, from the entry point to the denied module. This helps you find where the chain starts so you can restructure your code.

## Common Pitfall: Why Some Imports Stay Alive

It can look like Start "should have removed that server-only import". The important detail is that this is handled by the Start compiler:

1. The compiler rewrites environment-specific _implementations_ for the current target (client or server).
2. As part of that compilation, it prunes code and removes imports that become unused after the rewrite.

In practice, when the compiler replaces a `createServerFn()` handler with a client RPC stub, it can also remove server-only imports that were only used by the removed implementation.

Example (client build):

```ts
import { getUsers } from './db/queries.server'
import { createServerFn } from '@tanstack/react-start'

export const fetchUsers = createServerFn().handler(async () => {
  return getUsers()
})
```

Conceptually, the client build output becomes something like (simplified):

```ts
import { createClientRpc } from '@tanstack/react-start/client-rpc'
import { createServerFn } from '@tanstack/react-start'

// Compiler replaces the handler with a client RPC stub.
// (The id is generated by the compiler; treat it as an opaque identifier.)
export const fetchUsers = TanStackStart.createServerFn({
  method: 'GET',
}).handler(createClientRpc('sha256:deadbeef...'))

// The server-only import is removed by the compiler.
```

If the import "leaks" into code that survives compilation, it stays live and import protection will still flag it:

```ts
import { getUsers } from './db/queries.server'
import { createServerFn } from '@tanstack/react-start'

// This is fine -- the server implementation is removed for the client build
export const fetchUsers = createServerFn().handler(async () => {
  return getUsers()
})

// This keeps the import alive in the client build
export function leakyHelper() {
  return getUsers() // referenced outside server boundary
}
```

When this happens, you have a few options depending on what you want `leakyHelper` to be:

Option A: split the file so client code cannot accidentally import the leak

```ts
// src/users.server.ts
import { getUsers } from './db/queries.server'
import { createServerFn } from '@tanstack/react-start'

// Safe to import from client code (compiler rewrites the handler)
export const fetchUsers = createServerFn().handler(async () => {
  return getUsers()
})
```

```ts
// src/users-leaky.server.ts
import { getUsers } from './db/queries.server'

// Server-only helper; do not import this from client code
export function leakyHelper() {
  return getUsers()
}
```

Option B: keep it in the same file, but wrap the helper in `createServerOnlyFn`

This is useful when the helper should exist, but must never run on the client. Make sure the server-only import is only referenced inside the `createServerOnlyFn(() => ...)` callback:

```ts
import { createServerOnlyFn } from '@tanstack/react-start'
import { getUsers } from './db/queries.server'

export const leakyHelper = createServerOnlyFn(() => {
  return getUsers()
})
```

On the client, the compiler output is effectively:

```ts
export const leakyHelper = () => {
  throw new Error(
    'createServerOnlyFn() functions can only be called on the server!',
  )
}
```

Notice that the `createServerOnlyFn` import is gone, and the server-only `getUsers` import is also gone because it is no longer referenced after compilation.

The same idea applies to `createIsomorphicFn()`: the compiler removes the non-target implementation and prunes anything that becomes unused.

If you see an import-protection violation for a file you expected to be "compiled away", check whether the import is referenced outside a compiler-recognized environment boundary (or is otherwise kept live by surviving code).

## False Positives: Dev vs Build

In **build mode**, import protection defers violation checks until after tree-shaking. If an import is eliminated from the final bundle, no violation is reported. Build-time violations are definitive: if the build flags it, the import truly survived.

In **dev mode**, tree-shaking may be incomplete or unavailable, so import protection can report false positives for imports that would later be compiled away.

If a warning appears in dev but not build, that usually means the unsafe edge existed before tree-shaking but did not survive the final bundle. Even so, prefer changing the import structure so that edge does not exist in the first place.

## Mixed Barrels and Split Entry Points

Barrels are not inherently a false positive. The risky pattern is a barrel that mixes safe exports with environment-restricted ones from the same entry point.

Depending on what survives after compilation and tree-shaking, that can show up as either a real violation or a dev-only false positive. The safer structure is to split safe and restricted exports into separate entry points.

For example, avoid mixed barrels like this:

```ts
// src/lib/index.ts
export { fetchUsers } from './fetchUsers'
export { getDb } from './db.server'
```

```ts
// src/routes/users.tsx
import { fetchUsers } from '../lib'
```

Even if the client only uses `fetchUsers`, that import path still goes through a module that re-exports `getDb`.

Prefer splitting safe and server-only exports into separate entry points:

```ts
// src/lib/index.ts
export { fetchUsers } from './fetchUsers'
```

```ts
// src/lib/server.ts
export { getDb } from './db.server'
```

```ts
// src/routes/users.tsx
import { fetchUsers } from '../lib'
```

```ts
// src/server/worker.ts
import { getDb } from '../lib/server'
```

The same applies to marker-protected files (`import '@tanstack/react-start/server-only'`). If a marked file is re-exported through a mixed barrel but never consumed by client code, production may suppress the warning after tree-shaking, but the better fix is still to avoid exposing that server-only edge to client-reachable code at all.

## The `onViolation` Callback

You can hook into violations for custom reporting or to override the verdict:

```ts
importProtection: {
  onViolation: async (info) => {
    // info.env -- environment name (e.g. 'client', 'ssr', ...)
    // info.envType -- 'client' or 'server'
    // info.type -- 'specifier', 'file', or 'marker'
    // info.specifier -- the raw import string
    // info.importer -- absolute path of the importing file
    // info.resolved -- absolute path of the resolved target (if available)
    // info.trace -- array of { file, line?, column?, specifier? } objects
    // info.snippet -- { lines, highlightLine, location } with the source code snippet (if available)

    // Return false (or Promise<false>) to allow this specific import (override the denial)
    if (info.specifier === 'some-special-case') {
      return false
    }
  },
}
```

In builds, `onViolation` is called once per denied import that survives tree-shaking. Returning `false` gives that import the real module, and the build runs again until no newly allowed import remains. In dev, it is called when the importing module is compiled, or, for an import the TypeScript transform may erase (see [Type-Only Imports](#type-only-imports)), when the bundler loads the import. With `log: 'once'` (the default) it is asked once per denied import for the dev session; with `'always'`, each time the import is compiled or loaded again.

## Disabling Import Protection

To disable import protection entirely:

```ts
importProtection: {
  enabled: false,
}
```

## Full Configuration Reference

```ts
interface ImportProtectionOptions {
  enabled?: boolean
  behavior?:
    | 'error'
    | 'mock'
    | { dev?: 'error' | 'mock'; build?: 'error' | 'mock' }
  log?: 'once' | 'always'
  include?: Array<string | RegExp>
  exclude?: Array<string | RegExp>
  ignoreImporters?: Array<string | RegExp>
  maxTraceDepth?: number
  client?: {
    specifiers?: Array<string | RegExp>
    files?: Array<string | RegExp>
    excludeFiles?: Array<string | RegExp>
  }
  server?: {
    specifiers?: Array<string | RegExp>
    files?: Array<string | RegExp>
    excludeFiles?: Array<string | RegExp>
  }
  onViolation?: (
    info: ViolationInfo,
  ) => boolean | void | Promise<boolean | void>
}
```

| Option                | Type                 | Default                           | Description                                                                                                                                                           |
| --------------------- | -------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`             | `boolean`            | `true`                            | Set to `false` to disable the plugin                                                                                                                                  |
| `behavior`            | `string \| object`   | `{ dev: 'mock', build: 'error' }` | What to do on violation                                                                                                                                               |
| `log`                 | `'once' \| 'always'` | `'once'`                          | Whether to deduplicate repeated violations                                                                                                                            |
| `include`             | `Pattern[]`          | Start's `srcDirectory`            | Only check importers matching these patterns                                                                                                                          |
| `exclude`             | `Pattern[]`          | `[]`                              | Skip importers matching these patterns                                                                                                                                |
| `ignoreImporters`     | `Pattern[]`          | `[]`                              | Ignore violations from these importers                                                                                                                                |
| `maxTraceDepth`       | `number`             | `20`                              | Maximum depth for import traces                                                                                                                                       |
| `client`              | `object`             | See defaults above                | Additional deny rules for the client environment                                                                                                                      |
| `client.specifiers`   | `Pattern[]`          | Framework server specifiers       | Specifier patterns denied in the client environment (additive with defaults)                                                                                          |
| `client.files`        | `Pattern[]`          | `['**/*.server.*']`               | File patterns denied in the client environment (replaces defaults)                                                                                                    |
| `client.excludeFiles` | `Pattern[]`          | `['**/node_modules/**']`          | Resolved files matching these patterns skip resolved-target checks (file-pattern + marker) (replaces defaults)                                                        |
| `server`              | `object`             | See defaults above                | Additional deny rules for the server environment                                                                                                                      |
| `server.specifiers`   | `Pattern[]`          | `[]`                              | Specifier patterns denied in the server environment (replaces defaults; defaults for `server.specifiers` are `[]`, so unlike `client.specifiers` this isn't additive) |
| `server.files`        | `Pattern[]`          | `['**/*.client.*']`               | File patterns denied in the server environment (replaces defaults)                                                                                                    |
| `server.excludeFiles` | `Pattern[]`          | `['**/node_modules/**']`          | Resolved files matching these patterns skip resolved-target checks (file-pattern + marker) (replaces defaults)                                                        |
| `onViolation`         | `function`           | `undefined`                       | Callback invoked on every violation                                                                                                                                   |
