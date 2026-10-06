/**
 * Known Start compiler bugs, pinned as expected failures.
 *
 * Every test asserts the CORRECT behaviour and is marked `.fails` because the
 * compiler does not implement it yet. When a fix lands, the test starts
 * passing, Vitest reports the `.fails` test as failed, and the `.fails`
 * modifier must be removed.
 */
import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../src/start-compiler/config'
import { compileStartModule } from './compile-start-module'
import { declarationOf, getModuleErrors } from './validate-module'

/**
 * One build-mode client compiler shared by several modules, like a production
 * build compiles every importer with the same compiler instance.
 */
function createBuildCompiler(files: Record<string, string>) {
  const compiler: StartCompiler = new StartCompiler({
    env: 'client',
    envName: 'client',
    root: '/test',
    framework: 'react',
    providerEnvName: 'ssr',
    mode: 'build',
    lookupKinds: getLookupKindsForEnv('client'),
    lookupConfigurations: getLookupConfigurationsForEnv('client', 'react'),
    getKnownServerFns: () => ({}),
    loadModule: async (id) => {
      const code = files[id]
      if (code !== undefined) {
        compiler.ingestModule({ code, id })
      }
    },
    resolveId: async (id) => {
      if (id.startsWith('@tanstack/')) {
        return id
      }
      const file = id.startsWith('./') ? `/test/src/${id.slice(2)}.ts` : id
      return file in files ? file : null
    },
  })
  return async (id: string) => {
    const code = files[id]!
    const result = await compiler.compile({
      code,
      id,
      detectedKinds: detectKindsInCode(code, 'client'),
    })
    // An untransformed module ships its source as is.
    return result?.code ?? code
  }
}

/** Server-only code that must never reach the client bundle. */
const serverOnlyImport = './db.server'

describe('known Start compiler bugs: server code in the client bundle', () => {
  // Bug: `findExportInModule` caches export lookups per module in build mode,
  // but the `visitedModules` set is shared between the parallel `export *`
  // branches. In a diamond (`a` re-exports `b` and `c`, both re-export `d`) or
  // a cycle, the branch that reaches an already-visited module caches "not
  // found" for its own module. A later importer of that module is then left
  // untransformed. Impact: its server handler and server-only imports ship to
  // the client bundle. Remove `.fails` once fixed.
  test.fails(
    'export * diamonds do not poison the build-mode export cache',
    async () => {
      const compile = createBuildCompiler({
        '/test/src/d.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()`,
        '/test/src/b.ts': `export * from './d'`,
        '/test/src/c.ts': `export * from './d'`,
        '/test/src/a.ts': `export * from './b'
export * from './c'`,
        '/test/src/via-a.tsx': `import { base } from './a'
import { db } from './db.server'
export const viaA = base.handler(async () => db.a())`,
        '/test/src/via-b.tsx': `import { base } from './b'
import { db } from './db.server'
export const viaB = base.handler(async () => db.b())`,
        '/test/src/via-c.tsx': `import { base } from './c'
import { db } from './db.server'
export const viaC = base.handler(async () => db.c())`,
      })
      const leaked: Array<string> = []
      for (const id of [
        '/test/src/via-a.tsx',
        '/test/src/via-b.tsx',
        '/test/src/via-c.tsx',
      ]) {
        if ((await compile(id)).includes(serverOnlyImport)) {
          leaked.push(id)
        }
      }
      expect(leaked).toEqual([])
    },
  )

  test.fails(
    'export * cycles do not poison the build-mode export cache',
    async () => {
      const compile = createBuildCompiler({
        '/test/src/d.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()`,
        '/test/src/a.ts': `export * from './b'
export * from './d'`,
        '/test/src/b.ts': `export * from './a'`,
        '/test/src/via-a.tsx': `import { base } from './a'
import { db } from './db.server'
export const viaA = base.handler(async () => db.a())`,
        '/test/src/via-b.tsx': `import { base } from './b'
import { db } from './db.server'
export const viaB = base.handler(async () => db.b())`,
      })
      const leaked: Array<string> = []
      for (const id of ['/test/src/via-a.tsx', '/test/src/via-b.tsx']) {
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

  // Bug: the provider module wraps each handler as
  // `createServerRpc(meta, (opts) => <name>.__executeServer(opts))`. For a
  // server fn named `opts`, the parameter shadows it and the declaration of
  // `opts` is removed as unused. Impact: every call of that server fn fails
  // on the server. Remove `.fails` once fixed.
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
})
