/**
 * Known Start compiler bugs, pinned as expected failures.
 *
 * Every `.fails` test asserts the CORRECT behaviour and is marked `.fails`
 * because the compiler does not implement it yet. When a fix lands, the test
 * starts passing, Vitest reports the `.fails` test as failed, and the `.fails`
 * modifier must be removed.
 *
 * Several bugs were found by porting other compilers' test suites (all MIT):
 * - the Next.js server actions transform fixtures (vercel/next.js
 *   `crates/next-custom-transforms/tests/fixture/server-actions`);
 * - babel-dead-code-elimination's tests (pcattori/babel-dead-code-elimination
 *   `src/dead-code-elimination.test.ts`);
 * - the `@vitejs/plugin-rsc` transform tests (vitejs/vite-plugin-react
 *   `packages/plugin-rsc/src/transforms`).
 * Each ported test names its source.
 */
import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import { compileStartModule } from './compile-start-module'
import { createStartModuleCompiler } from './known-bugs-helpers'
import { declarationOf, getModuleErrors } from './validate-module'

/**
 * Compiles several modules with one build-mode client compiler, like a
 * production build compiles every importer with the same compiler instance.
 */
function createBuildCompiler(files: Record<string, string>) {
  const compile = createStartModuleCompiler({ env: 'client', files })
  return async (id: string) => {
    const code = files[id]!
    // An untransformed module ships its source as is.
    return (await compile(code, id)) ?? code
  }
}

/** Server-only code that must never reach the client bundle. */
const serverOnlyImport = './db.server'

describe('known Start compiler bugs: server code in the client bundle', () => {
  // Controls for the bugs below: a server fn whose builder is created in the
  // module or imported by name from another module is compiled, and the
  // server-only import its handler used is removed from the client module.
  test.each<{ name: string; files: Record<string, string>; code: string }>([
    {
      name: 'a builder created in the module',
      files: {},
      code: `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())`,
    },
    {
      name: 'a builder imported from another module',
      files: {
        '/test/src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const authed = createServerFn({ method: 'POST' })`,
      },
      code: `import { authed } from './fns'
import { db } from './db.server'
export const fn = authed.handler(async () => db.x())`,
    },
  ])(
    'client builds do not ship the server code of $name',
    async ({ files, code }) => {
      const output = await compileStartModule({ env: 'client', files, code })
      expect(output).toContain('createClientRpc')
      expect(output).not.toContain(serverOnlyImport)
    },
  )

  // Bug: `findExportInModule` caches export lookups per module in build mode,
  // but the `visitedModules` set is shared between the parallel `export *`
  // branches. In a diamond (`a` re-exports `b` and `c`, both re-export `d`) or
  // a cycle, the branch that reaches an already-visited module caches "not
  // found" for its own module. A later importer of that module is then left
  // untransformed. Impact: its server handler and server-only imports ship to
  // the client bundle. Remove `.fails` once fixed.
  test.fails.each<{ name: string; reExports: Record<string, string> }>([
    {
      name: 'diamonds',
      reExports: {
        '/test/src/a.ts': `export * from './b'
export * from './c'`,
        '/test/src/b.ts': `export * from './d'`,
        '/test/src/c.ts': `export * from './d'`,
      },
    },
    {
      name: 'cycles',
      reExports: {
        '/test/src/a.ts': `export * from './b'
export * from './d'`,
        '/test/src/b.ts': `export * from './a'`,
      },
    },
  ])(
    'export * $name do not poison the build-mode export cache',
    async ({ reExports }) => {
      // One importer of `base` through each re-exporting module.
      const importers = Object.keys(reExports).map((file) => {
        const name = file.slice('/test/src/'.length, -'.ts'.length)
        return [
          `/test/src/via-${name}.tsx`,
          `import { base } from './${name}'
import { db } from './db.server'
export const via = base.handler(async () => db.${name}())`,
        ] as const
      })
      const compile = createBuildCompiler({
        '/test/src/d.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()`,
        ...reExports,
        ...Object.fromEntries(importers),
      })
      const leaked: Array<string> = []
      for (const [id] of importers) {
        if ((await compile(id)).includes(serverOnlyImport)) {
          leaked.push(id)
        }
      }
      expect(leaked).toEqual([])
    },
  )

  // Bug: chains whose builder is reached through a namespace member, a
  // namespace re-export of the Start package, or a middleware/isomorphic
  // builder finished in a file without the detection text are not resolved.
  // The module is left untransformed. Impact: server handlers and server-only
  // imports ship to the client bundle. Remove `.fails` once fixed.
  test.fails.each<{
    name: string
    files: Record<string, string>
    code: string
  }>([
    {
      name: 'a namespace member builder (F.authed.handler)',
      files: {
        '/test/src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const authed = createServerFn({ method: 'POST' })`,
      },
      code: `import * as F from './fns'
import { db } from './db.server'
export const fn = F.authed.handler(async () => db.x())`,
    },
    {
      name: 'a namespace re-export of the Start package (Start.createServerFn)',
      files: {
        '/test/src/start.ts': `export * as Start from '@tanstack/react-start'`,
      },
      code: `import { Start } from './start'
import { db } from './db.server'
export const fn = Start.createServerFn().handler(async () => db.x())`,
    },
    {
      name: 'a middleware builder finished in another file (mw.server)',
      files: {
        '/test/src/mw.ts': `import { createMiddleware } from '@tanstack/react-start'
export const mw = createMiddleware({ type: 'function' })`,
      },
      code: `import { mw } from './mw'
import { db } from './db.server'
export const logged = mw.server(async ({ next }) => { db.log(); return next() })`,
    },
    {
      name: 'an isomorphic builder finished in another file (iso.server)',
      files: {
        '/test/src/iso.ts': `import { createIsomorphicFn } from '@tanstack/react-start'
export const iso = createIsomorphicFn()`,
      },
      code: `import { iso } from './iso'
import { db } from './db.server'
export const fn = iso.server(() => db.x()).client(() => 'client')`,
    },
  ])(
    'client builds do not ship the server code of $name',
    async ({ files, code }) => {
      const output =
        (await compileStartModule({ env: 'client', files, code })) ?? code
      expect(output).not.toContain(serverOnlyImport)
    },
  )

  // Bug: a `createServerFn` that is not declared at the module top level
  // (function body, switch case, block) is left untransformed. Impact: its
  // server handler and server-only imports ship to the client bundle. The
  // fix may also reject such declarations with a compile error.
  // Remove `.fails` once fixed.
  test.fails.each([
    {
      name: 'a function body',
      code: `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export function make() {
  const inner = createServerFn().handler(async () => db.inner())
  return inner
}`,
    },
    {
      name: 'a function body next to a top-level server fn',
      code: `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export const top = createServerFn().handler(async () => db.top())
export function make() {
  const inner = createServerFn().handler(async () => db.inner())
  return inner
}`,
    },
    {
      name: 'a switch case',
      code: `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export function pick(kind: string) {
  switch (kind) {
    case 'a':
      const inner = createServerFn().handler(async () => db.inner())
      return inner
  }
}`,
    },
    {
      name: 'a top-level block',
      code: `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export const registry: Array<unknown> = []
{
  const inner = createServerFn().handler(async () => db.inner())
  registry.push(inner)
}`,
    },
  ])(
    'a createServerFn nested in $name does not ship its handler to the client',
    async ({ code }) => {
      let output: string
      try {
        output = (await compileStartModule({ env: 'client', code })) ?? code
      } catch {
        // Rejecting the declaration at compile time also keeps it out of the client.
        return
      }
      expect(output).not.toContain('db.inner()')
    },
  )
})

describe('known Start compiler bugs: server function handlers', () => {
  /**
   * Evaluates a provider module with minimal runtime stubs and returns its
   * only export: the function the server-function router calls for a request.
   */
  async function loadProviderHandler(provider: string) {
    const stub = (code: string) =>
      `data:text/javascript,${encodeURIComponent(code)}`
    const runtime: Record<string, string> = {
      '@tanstack/react-start/server-rpc': stub(
        `export const createServerRpc = (meta, fn) => fn`,
      ),
      '@tanstack/react-start': stub(
        `export const createServerFn = () => ({ handler: (_rpc, impl) => ({ __executeServer: (opts) => impl(opts) }) })`,
      ),
    }
    const { code } = await transformWithOxc(provider, 'provider.ts')
    const linked = code.replace(
      /from\s*(["'])([^"']+)\1/g,
      (match, _quote: string, source: string) =>
        source in runtime ? `from ${JSON.stringify(runtime[source])}` : match,
    )
    const module: Record<string, (opts: unknown) => unknown> = await import(
      /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(linked)}`
    )
    const handlers = Object.values(module)
    expect(handlers).toHaveLength(1)
    return handlers[0]!
  }

  // Control for the bug below: the provider of a server fn calls its handler.
  test('a server fn keeps working in the provider', async () => {
    const provider = await compileStartModule({
      env: 'server',
      provider: true,
      code: `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'from the server')`,
    })
    expect(provider).not.toBeNull()
    const handler = await loadProviderHandler(provider!)
    expect(await handler({ data: undefined })).toBe('from the server')
  })

  // Bug: generated names are not checked against user bindings (see also the
  // next test). The provider module wraps each handler as
  // `createServerRpc(meta, (opts) => <name>.__executeServer(opts))`. For a
  // server fn named `opts`, the parameter shadows it and the declaration of
  // `opts` is removed as unused. The module stays valid, so only running it
  // shows the bug. Impact: every call of that server fn fails on the server.
  // Remove `.fails` once fixed.
  test.fails(
    'a server fn named opts keeps working in the provider',
    async () => {
      const provider = await compileStartModule({
        env: 'server',
        provider: true,
        code: `import { createServerFn } from '@tanstack/react-start'
export const opts = createServerFn().handler(async () => 'from the server')`,
      })
      expect(provider).not.toBeNull()
      expect(provider).toMatch(declarationOf('opts'))
      const handler = await loadProviderHandler(provider!)
      expect(await handler({ data: undefined })).toBe('from the server')
    },
  )

  // Bug: generated names are not checked against user bindings. A user binding
  // named like a generated import (`createClientRpc`, `createSsrRpc`,
  // `createServerRpc`) or like a generated handler
  // (`fn_createServerFn_handler`) collides with it. Main throws
  // `Duplicate declaration` at compile time; the Yuku PR emits a module that
  // redeclares the name. Impact: the module cannot be built.
  // Remove `.fails` once fixed.
  test.fails.each([
    { name: 'createClientRpc', env: 'client' as const, provider: false },
    { name: 'createSsrRpc', env: 'server' as const, provider: false },
    { name: 'createServerRpc', env: 'server' as const, provider: true },
    {
      name: 'fn_createServerFn_handler',
      env: 'server' as const,
      provider: true,
    },
  ])(
    'a user binding named $name does not collide with generated code',
    async ({ name, env, provider }) => {
      const output = await compileStartModule({
        env,
        provider,
        code: `import { createServerFn } from '@tanstack/react-start'
const ${name} = (value: unknown) => value
export const used = ${name}(1)
export const fn = createServerFn().handler(async () => 1)`,
      })
      expect(output).not.toBeNull()
      expect(await getModuleErrors(output!)).toEqual([])
    },
  )
  // Bug: when the handler passed to `.handler()` is itself a Start call
  // (`createServerOnlyFn(fn)`), the inner call is compiled first. Main then
  // silently miscompiles the server fn: the client caller gets the
  // server-only "can only be called on the server" stub instead of an RPC,
  // and the SSR caller gets a bare id string. The Yuku PR throws "Cannot
  // replace a detached output node". Impact: the server fn cannot be called.
  // Remove `.fails` once fixed.
  test.fails.each([
    { env: 'client' as const, rpc: 'createClientRpc' },
    { env: 'server' as const, rpc: 'createSsrRpc' },
  ])(
    'a createServerOnlyFn handler still produces a $rpc caller',
    async ({ env, rpc }) => {
      const output = await compileStartModule({
        env,
        code: `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
export const fn = createServerFn().handler(createServerOnlyFn(async () => db.x()))`,
      })
      expect(output).not.toBeNull()
      expect(output).toMatch(new RegExp(String.raw`\.handler\(${rpc}\(`))
      expect(output).not.toContain('can only be called on the server')
      expect(await getModuleErrors(output!)).toEqual([])
    },
  )

  // Bug: the provider module (`?tss-serverfn-split`) keeps the `'use client'`
  // directive of its source module, although it only holds server code. In an
  // RSC build the provider environment turns every export of a `'use client'`
  // module into a client reference that throws when called on the server.
  // Impact: a server fn declared in a `'use client'` file cannot run in RSC
  // apps. Remove `.fails` once fixed.
  // Next.js server actions: server-graph/3, server-graph/4 (module-level
  // directives)
  test.fails(
    "the provider of a 'use client' module is not a client module",
    async () => {
      const provider = await compileStartModule({
        env: 'server',
        provider: true,
        code: `'use client'
import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())`,
      })
      expect(provider).not.toBeNull()
      expect(await getModuleErrors(provider!)).toEqual([])
      expect(provider).toMatch(/export\s*\{\s*fn_createServerFn_handler\s*\}/)
      expect(provider).not.toMatch(/['"]use client['"]/)
    },
  )
})

describe('known Start compiler bugs: dead-code elimination', () => {
  // Bug: when the compiler drops the other environment's implementation of a
  // `createIsomorphicFn`/`createServerOnlyFn`/`createClientOnlyFn` declared
  // inside a hook, it also deletes the hook's locals that only that
  // implementation read, including their initializers. Here the first
  // `useId()` disappears from one environment only, so the next `useId()`
  // returns a different id on the server and on the client. Impact: hydration
  // mismatches (and any other side effect of such an initializer runs in one
  // environment only). Remove `.fails` once fixed.
  // babel-dead-code-elimination: "only eliminates newly unreferenced
  // identifiers" (applied to locals of a surviving function).
  test.fails.each([
    {
      name: 'client',
      env: 'client' as const,
      code: `import { createIsomorphicFn } from '@tanstack/react-start'
import { useId } from 'react'
export function useField() {
  const serverId = useId()
  const describe = createIsomorphicFn().server(() => serverId).client(() => 'client')
  const inputId = useId()
  return [describe(), inputId]
}
`,
    },
    {
      name: 'server',
      env: 'server' as const,
      code: `import { createClientOnlyFn } from '@tanstack/react-start'
import { useId } from 'react'
export function useField() {
  const clientId = useId()
  const describe = createClientOnlyFn(() => clientId)
  const inputId = useId()
  return [describe, inputId]
}
`,
    },
  ])(
    '$name: hook calls read only by the removed implementation still run',
    async ({ env, code }) => {
      const output = await compileStartModule({ env, code })
      expect(output).not.toBeNull()
      expect(await getModuleErrors(output!)).toEqual([])
      expect(output!.match(/\buseId\(\)/g)).toHaveLength(2)
    },
  )
})

describe('known Start compiler bugs: CommonJS dependencies', () => {
  // Bug: every `.js`/`.cjs` file whose text matches a detection pattern (for
  // example `.handler(`) is parsed as a strict ES module, including CommonJS
  // dependencies that client builds bundle. Sloppy-mode syntax such as a
  // legacy octal escape, a `with` statement or a top-level `return` throws a
  // SyntaxError although the file has no Start import to compile. Impact: a
  // CommonJS dependency containing such code and text like `app.handler(`
  // fails the build. Remove `.fails` once fixed.
  // @vitejs/plugin-rsc: cjs.test.ts (fixtures/cjs: CommonJS modules are
  // sloppy-mode scripts)
  test.fails.each([
    {
      name: 'a legacy octal escape',
      id: '/test/node_modules/lib/index.cjs',
      code: `var reset = '\\033[0m'
module.exports = function (app) {
  return app.handler(reset)
}`,
    },
    {
      name: 'a with statement',
      id: '/test/node_modules/lib/index.cjs',
      code: `with (Math) {
  exports.run = function (app) {
    return app.handler(PI)
  }
}`,
    },
    {
      name: 'a top-level return',
      id: '/test/node_modules/lib/index.js',
      code: `if (typeof window === 'undefined') return
exports.run = function (app) {
  return app.handler(1)
}`,
    },
  ])(
    'a CommonJS dependency with $name is left untouched',
    async ({ id, code }) => {
      for (const env of ['client', 'server'] as const) {
        const compile = createStartModuleCompiler({ env })
        await expect(compile(code, id)).resolves.toBeNull()
      }
    },
  )
})
