/**
 * Known Start compiler bugs. Each test asserts correct behaviour for a bug on
 * main and is marked .fails; remove .fails when the bug is fixed.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { createServer, isRunnableDevEnvironment, transformWithOxc } from 'vite'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { startCompilerPlugin } from '../src/vite/start-compiler-plugin/plugin'
import { buildStart, startBundlers } from './build-harness'
import {
  callProvider,
  callReportedServerFns,
  clientOnlyError,
  compileAll,
  compileCode,
  compileErrorMessage,
  compileFor,
  compileServer,
  createServerGraph,
  createStartCompiler,
  directivePrologue,
  evaluateModule,
  expectNoClientHandler,
  expectOutputsFreeOfHandler,
  importSources,
  misplacedServerFnRejection,
  outputs,
  renderThingTransform,
  serverOnlyError,
  serverOnlyModule,
  settle,
} from './regression-helpers'
import { createModuleGraph } from '@tanstack/compiler-test-utils/module-linker'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import {
  capturingPlacement,
  placementHeads,
  placementModule,
  placements,
} from './createServerFn/placements'
import type { ModuleStub, Output, OutputResult } from './regression-helpers'
import type { PlacementHead } from './createServerFn/placements'

const head = `import { createServerFn } from '@tanstack/react-start'\n`

/** Server-only module that must never reach the client bundle. */
const serverOnly = serverOnlyModule

/**
 * Calls every server fn the client build reports through the provider
 * module and export it names, like the server-function router
 * (`callReportedServerFns`). Returns the compiled outputs and the results of
 * the calls.
 */
async function callServerFns(
  code: string,
  options: {
    directives?: Array<string>
    files?: Record<string, string>
    stubs?: Record<string, ModuleStub>
  } = {},
) {
  const compiled = await compileAll(code, options)
  const results = await callReportedServerFns(
    compiled,
    compiled.serverFns,
    options.stubs,
  )
  return { ...compiled, results }
}

/**
 * A clear compile error rejecting a chain method called through a computed
 * member (`builder['handler'](...)`), matched against the message without
 * its code frame.
 */
const computedCallRejection = /\b(computed|\[\s*['"](handler|server)['"]\s*\])/i

/**
 * A clear compile error rejecting a server fn builder returned by a function,
 * matched against the message without its code frame (`compileErrorMessage`).
 */
const returnedBuilderRejection =
  /createServerFn\b[^]*\b(returned|returning|returns)\b/i

/**
 * Compiles `code` for the client and calls its `read` export: the client
 * must not import the server-only module, and calling the server-only fn
 * must throw the server-only error.
 */
async function expectServerOnlyRead(code: string) {
  const client = (await compileCode('client', code)) ?? code
  expect(importSources(client)).not.toContain(serverOnly)
  const { read } = await evaluateModule(client, {
    [serverOnly]: { db: { secret: () => 'secret' } },
  })
  expect(settle(() => read())).toBe(serverOnlyError)
}

describe('harness controls', () => {
  test('callServerFns calls a top-level server fn through its provider', async () => {
    const { results } = await callServerFns(
      `${head}import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())`,
      { stubs: { [serverOnly]: { db: { x: () => 'from the server' } } } },
    )
    expect(results).toEqual(['from the server'])
  })

  test('expectNoClientHandler accepts a top-level server fn', async () => {
    await expectNoClientHandler(`${head}import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.inner())`)
  })

  describe('expectNoClientHandler checks each output on its own', () => {
    const code = `${head}import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.inner())`
    const rejection = {
      error: new Error(
        'createServerFn must be assigned to a top-level variable',
      ),
    }
    const compileOutputs = async () => {
      const results = {} as Record<Output, OutputResult>
      for (const output of outputs) {
        results[output] = await compileFor(output, code)
      }
      return results
    }

    test('it accepts outputs that each reject the code', async () => {
      await expectOutputsFreeOfHandler(code, {
        client: rejection,
        ssr: rejection,
        provider: rejection,
      })
    })

    test('it accepts a rejecting output next to outputs free of the handler', async () => {
      await expectOutputsFreeOfHandler(code, {
        ...(await compileOutputs()),
        ssr: rejection,
      })
    })

    test('it rejects a client output with the handler body next to rejecting outputs', async () => {
      await expect(
        expectOutputsFreeOfHandler(code, {
          client: { code, serverFns: {} },
          ssr: rejection,
          provider: rejection,
        }),
      ).rejects.toThrow('client')
    })

    // Only the client must be free of the handler: the SSR caller may keep
    // it in place.
    test('it accepts an SSR output that keeps the handler in place', async () => {
      await expectOutputsFreeOfHandler(code, {
        ...(await compileOutputs()),
        ssr: { code, serverFns: {} },
      })
    })

    test('it rejects a provider that does not run the reported server fn', async () => {
      const results = await compileOutputs()
      await expect(
        expectOutputsFreeOfHandler(code, {
          ...results,
          client: rejection,
          provider: { code: 'export {}', serverFns: {} },
        }),
      ).rejects.toThrow()
    })
  })

  test('an unrelated compile error quoting createServerFn is not a rejection of a misplaced server fn', async () => {
    const error = await compileFor(
      'client',
      `${head}const args: Array<() => unknown> = []
export const fn = createServerFn().handler(...args)`,
    ).catch((caught: unknown) => caught)
    const message = compileErrorMessage(error)
    expect(message).toMatch(/handler\(\) must be called with an expression/)
    expect(message).not.toMatch(misplacedServerFnRejection)
    expect(message).not.toMatch(returnedBuilderRejection)
  })

  test.each([
    {
      name: 'a nested createServerOnlyFn',
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
export function getRead() { return createServerOnlyFn(() => db.secret()) }
export const read = () => getRead()()`,
    },
    {
      name: 'a top-level renamed createServerOnlyFn',
      code: `import { createServerOnlyFn as serverOnly } from '@tanstack/react-start'
import { db } from './db.server'
export const read = serverOnly(() => db.secret())`,
    },
  ])(
    'expectServerOnlyRead accepts $name compiled for the client',
    async ({ code }) => {
      await expectServerOnlyRead(code)
    },
  )

  test('a server fn in a plain .ts module compiles by its id', async () => {
    const { code, serverFns } = await compileFor(
      'client',
      `${head}import { db } from './db.server'
const input = <string>(globalThis as any).input
export const fn = createServerFn().handler(async () => db.x(input))`,
      { id: '/test/src/fns.ts' },
    )
    expect(Object.keys(serverFns)).toHaveLength(1)
    expect(importSources(code!)).not.toContain(serverOnly)
  })
})

/** The server-only module, as the provider reads it. */
const dbStub = { db: { x: () => 'from the server', log: () => 'logged' } }

/**
 * A server fn builder of a project module, as the client (`rpc` only) and
 * the provider (`rpc` and the implementation) call it.
 */
const serverFnBuilderStub = {
  handler: (rpc: unknown, impl?: (opts: unknown) => unknown) =>
    impl
      ? Object.assign((opts: unknown) => impl(opts ?? {}), {
          __executeServer: impl,
        })
      : { rpc },
}

/**
 * Asserts the client output of `code` (with project modules `files`, linked
 * to `stubs` when evaluated) keeps no server-only import and calls its
 * server fn `fn` through an RPC, and that the provider runs the handler.
 */
async function expectServerFnThroughRpc(
  code: string,
  client: string,
  files: Record<string, string>,
  stubs: Record<string, ModuleStub>,
) {
  expect(importSources(client)).not.toContain(serverOnly)
  const linked = { ...stubs, [serverOnly]: dbStub }
  const { fn } = await evaluateModule(client, linked)
  expect(fn).toEqual({ rpc: { client: expect.any(String) } })
  const { results } = await callServerFns(code, { files, stubs: linked })
  expect(results).toEqual(['from the server'])
}

describe('server code in the client bundle', () => {
  /**
   * Compiles an importer of the `base` builder of `/test/src/d.ts` through
   * each module of `reExports`, all with one client compiler like a
   * production build, and checks that each calls its server fn `via`
   * through an RPC and that the provider runs the handler.
   */
  async function expectImportersThroughRpc(reExports: Record<string, string>) {
    const files = {
      '/test/src/d.ts': `${head}export const base = createServerFn()`,
      ...reExports,
    }
    const importers = Object.keys(reExports).map((file) => {
      const name = path.posix.basename(file, '.ts')
      return [
        `/test/src/via-${name}.tsx`,
        `import { base } from './${name}'
import { db } from './db.server'
export const via = base.handler(async () => db.x())`,
      ] as const
    })
    const { compile } = createStartCompiler({ env: 'client', files })
    const stubs = {
      ...Object.fromEntries(
        Object.keys(reExports).map((file) => [
          `./${path.posix.basename(file, '.ts')}`,
          { base: serverFnBuilderStub },
        ]),
      ),
      [serverOnly]: dbStub,
    }
    for (const [id, code] of importers) {
      const client = (await compile(code, id)) ?? code
      expect(importSources(client), id).not.toContain(serverOnly)
      const { via } = await evaluateModule(client, stubs)
      expect(via, id).toEqual({ rpc: { client: expect.any(String) } })
      const { results } = await callServerFns(code, { files, stubs })
      expect(results, id).toEqual(['from the server'])
    }
  }

  // Control for the pin below (same harness): a chain without a diamond or
  // a cycle.
  test('importers through an export * chain call their server fn through its RPC', async () => {
    await expectImportersThroughRpc({
      '/test/src/a.ts': `export * from './b'`,
      '/test/src/b.ts': `export * from './d'`,
    })
  })

  // Bug: build-mode export lookups are cached per module, but parallel
  // `export *` branches share one visited set, so in a diamond or a cycle a
  // module that re-exports the builder is cached as "not found".
  // Impact: a later importer through that module is left untransformed and
  // ships its handler and server-only imports to the client.
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
      await expectImportersThroughRpc(reExports)
    },
  )

  /**
   * Compiles `code` (with project modules `files`) for the client: it keeps
   * no server-only import, and `check` passes on the client output
   * evaluated with the project modules linked to `stubs`.
   */
  async function expectClientCompiled(
    code: string,
    files: Record<string, string>,
    stubs: Record<string, ModuleStub>,
    check?: (module: Record<string, any>) => void,
  ) {
    const client = (await compileCode('client', code, { files })) ?? code
    expect(client).not.toContain(serverOnly)
    check?.(await evaluateModule(client, { ...stubs, [serverOnly]: dbStub }))
  }

  /**
   * A middleware builder of the client runtime: `.server()` throws, as the
   * client runtime's does when called uncompiled.
   */
  const middlewareStub = (options: unknown) => ({
    options,
    server: () => {
      throw new Error('uncompiled .server()')
    },
  })

  // Control for the pin below (same harness): with `createMiddleware`
  // imported too, the module is compiled.
  test('client builds compile a middleware builder finished in another module when the module imports createMiddleware', async () => {
    await expectClientCompiled(
      `import { createMiddleware } from '@tanstack/react-start'
import { mw } from './mw'
import { db } from './db.server'
export const logged = mw.server(async ({ next }) => { db.log(); return next() })`,
      {
        '/test/src/mw.ts': `import { createMiddleware } from '@tanstack/react-start'
export const mw = createMiddleware({ type: 'function' })`,
      },
      { './mw': { mw: middlewareStub({ type: 'function' }) } },
      (module) => expect(module.logged.options).toEqual({ type: 'function' }),
    )
  })

  // Bug: middleware, isomorphic and env-only fns are detected by the
  // `createMiddleware` / `createIsomorphicFn` / `createServerOnlyFn` text, so
  // a module that only finishes a builder imported from another module, or
  // calls a factory re-exported or aliased under another name, is never
  // compiled.
  // Impact: the `.server()` implementation (the server-only implementation,
  // which the uncompiled factory returns as is) and its server-only imports
  // ship to the client.
  test.fails.each<{
    name: string
    files: Record<string, string>
    code: string
    stubs: Record<string, ModuleStub>
    check: (module: Record<string, any>) => void
  }>([
    {
      name: 'a middleware builder',
      files: {
        '/test/src/mw.ts': `import { createMiddleware } from '@tanstack/react-start'
export const mw = createMiddleware({ type: 'function' })`,
      },
      code: `import { mw } from './mw'
import { db } from './db.server'
export const logged = mw.server(async ({ next }) => { db.log(); return next() })`,
      stubs: { './mw': { mw: middlewareStub({ type: 'function' }) } },
      check: (module) =>
        expect(module.logged.options).toEqual({ type: 'function' }),
    },
    {
      // Source: createMiddleware.test.ts "slow path for a factory alias"
      // (asserted resolveId calls only).
      name: 'a createMiddleware alias',
      files: {
        '/test/src/mw.ts': `import { createMiddleware } from '@tanstack/react-start'
export const createFooMiddleware = createMiddleware`,
      },
      code: `import { createFooMiddleware } from './mw'
import { db } from './db.server'
export const logged = createFooMiddleware({ type: 'function' }).server(async ({ next }) => {
  db.log()
  return next()
})`,
      stubs: { './mw': { createFooMiddleware: middlewareStub } },
      check: (module) =>
        expect(module.logged.options).toEqual({ type: 'function' }),
    },
    {
      name: 'an isomorphic builder',
      files: {
        '/test/src/iso.ts': `import { createIsomorphicFn } from '@tanstack/react-start'
export const iso = createIsomorphicFn()`,
      },
      code: `import { iso } from './iso'
import { db } from './db.server'
export const fn = iso.server(() => db.x()).client(() => 'client')`,
      // Like the client runtime: `.server()` throws when called uncompiled.
      stubs: {
        './iso': {
          iso: {
            server: () => {
              throw new Error('uncompiled .server()')
            },
            client: (impl: unknown) => impl,
          },
        },
      },
      check: (module) => expect(module.fn()).toBe('client'),
    },
    {
      // Source: #8504 compiler.test.ts "resolves distinct re-export aliases
      // without conflating their source bindings". The module's text names
      // no factory, so the text detection the bundler plugins run before
      // compiling skips it and the module is left untransformed. #8504's
      // test calls the compiler without that detection; with it, #8504 has
      // the same bug.
      name: 'a renamed createServerOnlyFn re-export',
      files: {
        '/test/src/env.ts': `export { createServerOnlyFn as serverOnly } from '@tanstack/react-start'`,
      },
      code: `import { serverOnly } from './env'
import { db } from './db.server'
export const read = serverOnly(() => db.x())`,
      // Uncompiled, the factory returns the implementation as is.
      stubs: { './env': { serverOnly: (impl: unknown) => impl } },
      check: (module) => expect(settle(module.read)).toBe(serverOnlyError),
    },
  ])(
    'client builds compile $name finished or called in another module',
    async ({ files, code, stubs, check }) => {
      await expectClientCompiled(code, files, stubs, check)
    },
  )

  // Control for the two pins below (same harness): the builder imported by
  // name.
  test('client builds compile a builder imported by name', async () => {
    const code = `import { authed } from './fns'
import { db } from './db.server'
export const fn = authed.handler(async () => db.x())`
    const files = {
      '/test/src/fns.ts': `${head}export const authed = createServerFn({ method: 'POST' })`,
    }
    const client = (await compileCode('client', code, { files })) ?? code
    await expectServerFnThroughRpc(code, client, files, {
      './fns': { authed: serverFnBuilderStub },
    })
  })

  // Bug: a server fn builder read as a member of a namespace import
  // (`F.authed.handler`) is not resolved, unlike the same builder imported by
  // name.
  // Impact: the module is left untransformed and ships its handler and
  // server-only imports to the client.
  test.fails(
    'client builds compile a builder read from a namespace import',
    async () => {
      const code = `import * as F from './fns'
import { db } from './db.server'
export const fn = F.authed.handler(async () => db.x())`
      const files = {
        '/test/src/fns.ts': `${head}export const authed = createServerFn({ method: 'POST' })`,
      }
      const client = (await compileCode('client', code, { files })) ?? code
      await expectServerFnThroughRpc(code, client, files, {
        './fns': { authed: serverFnBuilderStub },
      })
    },
  )

  // Bug: a namespace of the Start package re-exported by a project module
  // (`export * as Start from '@tanstack/react-start'`) is not resolved.
  // Impact: `Start.createServerFn()` modules are left untransformed and ship
  // their handler and server-only imports to the client.
  test.fails(
    'client builds compile factories of a re-exported Start namespace',
    async () => {
      const code = `import { Start } from './start'
import { db } from './db.server'
export const fn = Start.createServerFn().handler(async () => db.x())`
      const files = {
        '/test/src/start.ts': `export * as Start from '@tanstack/react-start'`,
      }
      const client = (await compileCode('client', code, { files })) ?? code
      await expectServerFnThroughRpc(code, client, files, {
        './start': { Start: { createServerFn: () => serverFnBuilderStub } },
      })
    },
  )

  /**
   * Stub of the `./fns` module of the rows below, as the client (`rpc`
   * only) and the provider (`rpc` and the implementation) call it.
   */
  const returnedBuilderStub = {
    './fns': {
      authed: () => ({
        handler: (rpc: unknown, impl?: (opts: unknown) => unknown) =>
          impl
            ? Object.assign((opts: unknown) => impl(opts ?? {}), {
                __executeServer: impl,
              })
            : { rpc },
      }),
    },
  }

  // Bug: the builder of a `.handler()` chain is resolved through identifiers
  // and member expressions only, so a builder returned by a function call
  // (`authed().handler(...)`) is not traced. Rejecting it with a clear
  // compile error is a valid fix; supporting it means the client calls an
  // RPC and the provider runs the handler.
  // Impact: the module is left untransformed and ships its handler and
  // server-only imports to the client, without an RPC.
  test.fails.each<{
    name: string
    code: string
    files: Record<string, string>
  }>([
    {
      name: 'the same module',
      code: `${head}import { db } from './db.server'
const authed = () => createServerFn({ method: 'POST' })
export const fn = authed().handler(async () => db.x())`,
      files: {},
    },
    {
      name: 'another module',
      code: `import { authed } from './fns'
import { db } from './db.server'
export const fn = authed().handler(async () => db.x())`,
      files: {
        '/test/src/fns.ts': `${head}export const authed = () => createServerFn({ method: 'POST' })`,
      },
    },
  ])(
    'client builds compile a builder returned by a function of $name',
    async ({ code, files }) => {
      const client = await compileCode('client', code, { files }).catch(
        (error: Error) => error,
      )
      if (client instanceof Error) {
        expect(compileErrorMessage(client)).toMatch(returnedBuilderRejection)
        return
      }
      expect(importSources(client ?? code)).not.toContain(serverOnly)
      const stubs = {
        ...returnedBuilderStub,
        [serverOnly]: { db: { x: () => 'from the server' } },
      }
      const { fn } = await evaluateModule(client ?? code, stubs)
      expect(fn).toEqual({ rpc: { client: expect.any(String) } })
      const { results } = await callServerFns(code, { files, stubs })
      expect(results).toEqual(['from the server'])
    },
  )

  // Bug: chain methods are only recognized when called through a static
  // member (`.handler(...)`), so one called through a computed member
  // (`builder['handler'](...)`) leaves the module untransformed. Unusual
  // input: rejecting it with a clear compile error naming the computed call
  // is a valid fix; supporting it means each output follows its contract.
  // Impact: the server implementation and its server-only imports ship to
  // the client.
  test.fails.each([
    {
      name: 'a server fn handler',
      code: `${head}import { db } from './db.server'
export const fn = createServerFn()['handler'](async () => db.x())`,
      check: (module: Record<string, any>) =>
        expect(module.fn).toEqual({ rpc: { client: expect.any(String) } }),
    },
    {
      name: 'a middleware server implementation',
      code: `import { createMiddleware } from '@tanstack/react-start'
import { db } from './db.server'
export const mw = createMiddleware()['server'](async ({ next }) => {
  db.x()
  return next()
})`,
      // The client runtime's `.server()` throws: evaluating proves it is gone.
      check: (module: Record<string, any>) => expect(module.mw).toBeDefined(),
    },
    {
      name: 'an isomorphic server implementation',
      code: `import { createIsomorphicFn } from '@tanstack/react-start'
import { db } from './db.server'
export const fn = createIsomorphicFn()['server'](() => db.x()).client(() => 'client')`,
      check: (module: Record<string, any>) =>
        expect(module.fn()).toBe('client'),
    },
  ])(
    'client builds compile $name called through a computed member',
    async ({ code, check }) => {
      const client = await compileCode('client', code).catch(
        (error: Error) => error,
      )
      if (client instanceof Error) {
        expect(compileErrorMessage(client)).toMatch(computedCallRejection)
        return
      }
      expect(importSources(client ?? code)).not.toContain(serverOnly)
      check(
        await evaluateModule(client ?? code, {
          [serverOnly]: { db: { x: () => 'x' } },
        }),
      )
    },
  )

  // Bug: env-only factories nested in other code are found by the factory's
  // exported name (`isNestedDirectCallCandidate`), so a renamed import or a
  // local alias is only compiled as a top-level variable initializer.
  // Impact: the implementation and its server-only imports ship to the
  // client, where calling the server-only fn runs it instead of throwing.
  test.fails.each([
    {
      name: 'a renamed import in a function body',
      code: `import { createServerOnlyFn as serverOnly } from '@tanstack/react-start'
import { db } from './db.server'
export function getRead() { return serverOnly(() => db.secret()) }
export const read = () => getRead()()`,
    },
    {
      name: 'a renamed import in an object property',
      code: `import { createServerOnlyFn as serverOnly } from '@tanstack/react-start'
import { db } from './db.server'
export const api = { read: serverOnly(() => db.secret()) }
export const read = () => api.read()`,
    },
    {
      name: 'a local alias in a function body',
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
const so = createServerOnlyFn
export function getRead() { return so(() => db.secret()) }
export const read = () => getRead()()`,
    },
    {
      name: 'a local alias in a function-local const',
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
const so = createServerOnlyFn
export function getRead() { const fn = so(() => db.secret()); return fn }
export const read = () => getRead()()`,
    },
    {
      name: 'a local alias in a top-level block',
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
const so = createServerOnlyFn
export let read: () => unknown
{
  const fn = so(() => db.secret())
  read = () => fn()
}`,
    },
  ])(
    'client: a createServerOnlyFn called through $name is compiled',
    async ({ code }) => {
      await expectServerOnlyRead(code)
    },
  )

  // Bug: a call whose result is immediately member-called (`f().bind()`) is
  // recorded as the inner call of a method chain and never visited as a
  // candidate itself. Same root cause as the `renderServerComponent(...).then()`
  // pin in react-start-rsc/tests/rscCssTransform.test.tsx.
  // Impact: the implementation and its server-only imports ship to the
  // client, where calling the server-only fn runs it instead of throwing.
  test.fails(
    'client: a createServerOnlyFn whose result is member-called is compiled',
    async () => {
      await expectServerOnlyRead(`import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
export const read = createServerOnlyFn(() => db.secret()).bind(null)`)
    },
  )

  // Bug: when createServerFn is the only factory imported, the compiler only
  // visits top-level variable declarations, so a server fn anywhere else is
  // neither extracted nor rejected. With another Start factory imported, a
  // server fn initializing a declarator below the top level (in a function,
  // a block or a switch case) is extracted on the client, but its provider
  // module exports a handler it never declares. Rejecting a placement with a
  // clear compile error is a valid fix; supporting it is the goal
  // (createServerFn/declaration-sites.test.ts "supports a server fn in ...").
  // Impact: the handler and its server-only imports ship to the client
  // (createServerFn alone), or the server build fails (another factory).
  describe.each([
    { importHead: 'createServerFn alone' as const, rows: placements },
    {
      importHead: 'another Start factory' as const,
      rows: placements.filter((placement) => placement.declarator),
    },
  ])('with $importHead imported', ({ importHead, rows }) => {
    test.fails.each(rows)(
      'a createServerFn in $name does not ship its handler to the client',
      async ({ code }) => {
        await expectNoClientHandler(placementModule(importHead, code))
      },
    )
  })

  // Bug: same cause as above; a server fn nested in a function whose
  // handler reads a local of that function (here `id`) cannot run on its own
  // in the provider, and is not rejected either.
  // Impact: its handler and server-only imports ship to the client
  // (createServerFn alone), or the server build fails (another factory).
  // Once the callers reject the module, no provider is requested for it.
  // Source: user ruling D13 (the one placement that must be rejected).
  test.fails.each(Object.keys(placementHeads) as Array<PlacementHead>)(
    'with %s imported, a nested server fn whose handler reads a local of its function is rejected by the callers',
    async (importHead) => {
      const code = placementModule(importHead, capturingPlacement.code)
      for (const output of ['client', 'ssr'] as const) {
        const error = await compileFor(output, code).then(
          () => undefined,
          (caught: unknown) => caught,
        )
        expect(error, output).toBeInstanceOf(Error)
        expect(compileErrorMessage(error), output).toMatch(
          misplacedServerFnRejection,
        )
      }
    },
  )

  // Bug: the export a re-export forwards is looked up by its local name
  // (`wrap`) only, so two re-exports of different modules' `wrap` under
  // distinct names resolve to the same factory.
  // Impact: here both aliases compile as createClientOnlyFn: the server-only
  // implementation ships to the client and runs there, and throws on the
  // server.
  // Source: #8504 compiler.test.ts "resolves distinct re-export aliases
  // without conflating their source bindings" (red on main).
  test.fails(
    'distinct re-export aliases of two factories keep their own kind',
    async () => {
      const files = {
        '/test/src/barrel.ts': `export { wrap as allowed } from './server'
export { wrap as denied } from './client'`,
        '/test/src/server.ts': `export { createServerOnlyFn as wrap } from '@tanstack/start-fn-stubs'`,
        '/test/src/client.ts': `export { createClientOnlyFn as wrap } from '@tanstack/start-fn-stubs'`,
      }
      // The direct createServerOnlyFn call makes the module a candidate of
      // the compiler's text detection.
      const code = `import { createServerOnlyFn } from '@tanstack/react-start'
import { allowed, denied } from './barrel'
export const a = allowed(() => 'server-value')
export const b = denied(() => 'client-value')
export const c = createServerOnlyFn(() => 'direct')`
      const results: Record<string, Array<unknown>> = {}
      for (const output of ['client', 'ssr'] as const) {
        const { a, b } = await evaluateModule(
          (await compileCode(output, code, { files })) ?? code,
          {
            './barrel': {
              allowed: (fn: unknown) => fn,
              denied: (fn: unknown) => fn,
            },
          },
        )
        results[output] = [settle(a), settle(b)]
      }
      expect(results).toEqual({
        client: [serverOnlyError, 'client-value'],
        ssr: ['server-value', clientOnlyError],
      })
    },
  )

  // Bug: Start factories are matched by name without scope analysis, so a
  // parameter shadowing the imported factory or namespace is compiled as the
  // factory.
  // Impact: the client replaces the local call with the server-only stub,
  // which throws.
  test.fails.each([
    {
      name: 'a parenthesized namespace receiver',
      code: `import * as Start from '@tanstack/react-start'
export function make(Start) {
  return (Start).createServerOnlyFn(() => 'local')
}`,
      local: { createServerOnlyFn: (fn: () => string) => fn },
    },
    {
      name: 'a factory name',
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
export function make(createServerOnlyFn) {
  return createServerOnlyFn(() => 'local')
}`,
      local: (fn: () => string) => fn,
    },
  ])(
    'client: a parameter shadowing $name is left alone',
    async ({ code, local }) => {
      const client = (await compileCode('client', code)) ?? code
      const { make } = await evaluateModule(client)
      expect(settle(() => make(local)())).toBe('local')
    },
  )

  // Same bug, every factory and every output, next to a compiled factory
  // call. Source: #8504 start-compiler-factories.test.ts "parameters and
  // locals shadowing the factories are left alone next to a compiled factory
  // call" (red on main).
  test.fails.each(outputs)(
    '%s: parameters and locals shadowing the factories are left alone next to a compiled factory call',
    async (output) => {
      const code = `import * as Start from '@tanstack/react-start'
import { createServerFn, createServerOnlyFn, createClientOnlyFn, createIsomorphicFn, createMiddleware } from '@tanstack/react-start'
export const real = createServerOnlyFn(() => 'real')
export function wrap(createServerOnlyFn) {
  return createServerOnlyFn(() => 'param')
}
export function receiver(Start) {
  return (Start).createServerOnlyFn(() => 'receiver')
}
export function local() {
  const createClientOnlyFn = (fn: () => string) => fn
  return createClientOnlyFn(() => 'local')
}
export function iso(createIsomorphicFn) {
  return createIsomorphicFn().server(() => 's').client(() => 'c')
}
export function mw(createMiddleware) {
  return createMiddleware().server(() => 's')
}
export function make(createServerFn) {
  const made = createServerFn().handler(() => 'param')
  return made
}`
      const module = await evaluateModule((await compileCode(output, code))!)
      const identity = (fn: () => string) => fn
      const builder = {
        server: (server: () => string) => ({
          client: (client: () => string) => [server(), client()],
        }),
        handler: (handler: () => string) => handler(),
      }
      expect({
        real: settle(module.real),
        wrap: settle(() => module.wrap(identity)()),
        receiver: settle(() =>
          module.receiver({ createServerOnlyFn: identity })(),
        ),
        local: settle(() => module.local()()),
        iso: settle(() => module.iso(() => builder)),
        mw: settle(() =>
          module.mw(() => ({ server: (fn: () => string) => fn() })),
        ),
        make: settle(() => module.make(() => builder)),
      }).toEqual({
        real: output === 'client' ? serverOnlyError : 'real',
        wrap: 'param',
        receiver: 'receiver',
        local: 'local',
        iso: ['s', 'c'],
        mw: 's',
        make: 'param',
      })
    },
  )
})

describe('server function handlers', () => {
  // Bug: generated imports and handler names are not made unique against
  // user bindings, so a user binding named like one of them collides with it.
  // Impact: the module fails to build.
  test.fails.each([
    'createClientRpc',
    'createSsrRpc',
    'createServerRpc',
    'fn_createServerFn_handler',
  ])(
    'a user binding named %s does not collide with generated code',
    async (binding) => {
      const { results } =
        await callServerFns(`${head}const ${binding} = (value: unknown) => value
export const used = ${binding}('user')
export const fn = createServerFn().handler(async () => 'from the server')`)
      expect(results).toEqual(['from the server'])
    },
  )

  // Bug: the provider calls each server fn from a generated wrapper,
  // `opts => fn.__executeServer(opts)`, whose `opts` parameter shadows a
  // server fn named `opts`.
  // Impact: every call of a server fn named `opts` fails on the server.
  test.fails('a server fn named opts runs on the server', async () => {
    const { results } = await callServerFns(
      `${head}export const opts = createServerFn().handler(async () => 'from the server')`,
    )
    expect(results).toEqual(['from the server'])
  })

  // Bug: when the handler passed to `.handler()` is a `createServerOnlyFn()`
  // call, the inner call is compiled first and the caller is never rewritten
  // into an RPC.
  // Impact: the server fn cannot be called (the client caller throws the
  // server-only error, the SSR caller is a bare id).
  test.fails.each(['client', 'ssr'] as const)(
    '%s: a createServerOnlyFn handler still produces an RPC caller',
    async (output) => {
      const code = `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
export const fn = createServerFn().handler(createServerOnlyFn(async () => db.x()))`
      const stubs = { './db.server': { db: { x: () => 'x' } } }
      if (output === 'client') {
        const module = await evaluateModule(
          (await compileCode('client', code)) ?? code,
          stubs,
        )
        expect(module.fn).toEqual({ rpc: { client: expect.any(String) } })
        return
      }
      const ssr = await createServerGraph(
        await compileServer(code),
        stubs,
      ).ssr()
      expect(await ssr.fn()).toBe('x')
    },
  )

  // Bug: the provider drops the module's exports so that only what the
  // handlers need is left (compiler.test.ts "removes browser-only
  // dependencies of stripped exports"), but it keeps `export * from` and an
  // `export default` of an identifier, with the code that export reads.
  // Impact: a server fn call evaluates the browser-only code of its route
  // module on the server, and fails there (`window is not defined`) before
  // the handler runs: a common component-file shape (`export default Page`).
  // Source: handleCreateServerFn.ts safeRemoveExports (no case for
  // ExportAllDeclaration; a default-exported identifier is kept as is);
  // mutation-testing round 3 (sc-handlers A3, A4).
  test.fails.each([
    {
      name: 'export * from a browser-only module',
      code: `export * from './browser'`,
    },
    {
      name: 'export default of a component reading browser-only state',
      code: `const browserState = { window }
function Page() { return browserState }
export default Page`,
    },
  ])('a provider call does not evaluate $name', async ({ code }) => {
    const server = await compileServer(
      `${head}export const getMessage = createServerFn().handler(() => 'server message')
${code}`,
      { id: '/test/src/routes/message.tsx' },
    )
    expect(
      await callProvider(server, 'getMessage', {
        './browser': `throw new Error('browser-only module evaluated on the server')
export const Widget = 1`,
      }),
    ).toBe('server message')
  })

  // Bug: the provider module (`?tss-serverfn-split`) keeps the `'use client'`
  // directive of its source module.
  // Impact: in RSC builds every export of the provider becomes a client
  // reference, so a server fn declared in a `'use client'` file cannot run.
  test.fails(
    "the provider of a 'use client' module is not a client module",
    async () => {
      const { provider, results } = await callServerFns(
        `'use client'
${head}import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())`,
        {
          // What react-start's Rsbuild RSC configuration passes.
          directives: ['use server-entry'],
          stubs: { './db.server': { db: { x: () => 'from the server' } } },
        },
      )
      expect(results).toEqual(['from the server'])
      expect(directivePrologue(provider)).not.toContain('use client')
    },
  )
})

describe('dead-code elimination', () => {
  // Bug: removing the other environment's implementation of an env function
  // declared in a hook leaves the locals only that implementation read
  // unreferenced, and dead-code elimination (babel-dead-code-elimination,
  // which removes newly unreferenced bindings) deletes their declarators,
  // hook calls included.
  // Impact: the hooks after it run in a different order on the server and
  // the client (`useId` mismatches, hydration errors).
  test.fails.each([
    {
      output: 'client' as const,
      code: `import { createIsomorphicFn } from '@tanstack/react-start'
import { useId } from 'react'
export function useField() {
  const serverId = useId()
  const describe = createIsomorphicFn().server(() => serverId).client(() => 'client')
  const inputId = useId()
  return [describe(), inputId]
}`,
    },
    {
      output: 'ssr' as const,
      code: `import { createClientOnlyFn } from '@tanstack/react-start'
import { useId } from 'react'
export function useField() {
  const clientId = useId()
  const describe = createClientOnlyFn(() => clientId)
  const inputId = useId()
  return [describe, inputId]
}`,
    },
  ])(
    '$output: hook calls read only by the removed implementation still run',
    async ({ output, code }) => {
      const calls: Array<string> = []
      const { useField } = await evaluateModule(
        (await compileCode(output, code)) ?? code,
        { react: { useId: () => calls.push('useId') } },
      )
      useField()
      expect(calls).toHaveLength(2)
    },
  )

  const pragmaModule = `/** @jsx h */
import { h } from './jsx'
import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => h('p', null))
export const Card = () => <div />`
  const pragmaStubs = { './jsx': { h: (type: string) => `h(${type})` } }

  // Control for the JSX pragma pin below (same harness).
  test('evaluateModule renders JSX through the factory of a classic JSX pragma', async () => {
    const { Card } = await evaluateModule(pragmaModule, pragmaStubs)
    expect(Card()).toBe('h(div)')
  })

  // Bug: dead-code elimination does not count a classic JSX pragma
  // (`/** @jsx h */`) as a use of the factory it names, so the factory import
  // is removed when no other code reads it (the generated imports also land
  // above the pragma comment, where Oxc no longer reads it). Same root cause
  // as the JSX pragma pins in known-bugs-hydrate.test.ts and
  // router-plugin/tests/known-bugs-code-splitter.test.ts.
  // Impact: the module's components throw "h is not defined" or render
  // through another JSX factory than the one the module selects.
  test.fails(
    'client: the factory of a classic JSX pragma stays imported',
    async () => {
      const client = (await compileCode('client', pragmaModule)) ?? pragmaModule
      const { Card } = await evaluateModule(client, pragmaStubs)
      expect(settle(() => Card())).toBe('h(div)')
    },
  )

  /**
   * A module with a classic JSX runtime pragma whose `Hero` renders `Chart`
   * in `<ClientOnly>`; `heroBody` runs first in `Hero`.
   */
  const classicRuntimeModule = (heroBody: string) => `/** @jsxRuntime classic */
import * as React from 'react'
import { ClientOnly } from '@tanstack/react-router'
export function Hero() {
  ${heroBody}
  return <div><ClientOnly><Chart /></ClientOnly></div>
}
function Chart() {
  const ref = React.useRef(false)
  return <canvas data-rendered={ref.current} />
}`

  // Control for the pin below (same harness): code the SSR output keeps
  // still reads `React`.
  test('ssr: a module with a classic JSX runtime pragma that reads React elsewhere stays valid', async () => {
    const code = classicRuntimeModule('React.useId()')
    expect(
      await getModuleErrors((await compileCode('ssr', code)) ?? code),
    ).toEqual([])
  })

  // Bug: same family as the pin above: under a classic JSX runtime pragma
  // (`/** @jsxRuntime classic */`, whose JSX reads `React`), the SSR output
  // removes the `<ClientOnly>` children, then dead-code elimination drops
  // `import * as React`, which only the JSX still reads.
  // Source: start-compiler/handleClientOnlyJSX.ts:26-27 (children removed),
  // start-compiler/compiler.ts:1349,1410 (dead-code elimination does not
  // count the JSX as a read of `React`); fuzzing (oracle mode); one
  // unmodified corpus file (a charts hero background).
  // Impact: the server render throws "React is not defined".
  test.fails(
    'ssr: a module with a classic JSX runtime pragma keeps its React import',
    async () => {
      const code = classicRuntimeModule('')
      expect(
        await getModuleErrors((await compileCode('ssr', code)) ?? code),
      ).toEqual([])
    },
  )

  // Bug: a type-only import re-exported without `type` (`export { Settings }`,
  // which TypeScript accepts unless verbatimModuleSyntax is on) loses its
  // import in the client and SSR outputs, which keep the export that the
  // TypeScript transform can then no longer erase. The code splitter has the
  // same bug (pin in router-plugin/tests/known-bugs-code-splitter.test.ts).
  // Impact: the module fails to load ("Export 'Settings' is not defined").
  test.fails.each([
    `import type { Settings } from './settings'`,
    `import { type Settings } from './settings'`,
  ])(
    'client and SSR: a type-only import re-exported as `export { Settings }` is erased (%s)',
    async (importDeclaration) => {
      const code = `${head}${importDeclaration}
export { Settings }
export const fn = createServerFn().handler(async () => 1)`
      const errors: Record<string, Array<string>> = {}
      for (const output of ['client', 'ssr'] as const) {
        errors[output] = await getModuleErrors(
          (await compileCode(output, code)) ?? code,
        )
      }
      expect(errors).toEqual({ client: [], ssr: [] })
    },
  )

  /** A server-only module that fails loudly when a client module loads it. */
  const serverModuleStub = {
    [serverOnly]: `throw new Error('server module loaded on the client')
export const db = {}`,
  }

  // Control for the pin below (same harness): a plain function only the
  // server code uses leaves with its server-only import.
  test('client: a function only server code uses does not load its server-only import', async () => {
    const code = `${head}import { db } from './db.server'
function find() { return db.users() }
export const fn = createServerFn().handler(async () => find())`
    const client = (await compileCode('client', code)) ?? code
    const module = await evaluateModule(client, serverModuleStub)
    expect(module.fn).toBeDefined()
  })

  // Bug: dead-code elimination (babel-dead-code-elimination) removes
  // unreferenced functions and variables but never class declarations, TS
  // enums, namespaces, overloaded functions or redeclared `var`s, so such a
  // declaration that only server code used keeps its server-only import.
  // Impact: the client (always in dev; in builds, the server module's
  // top-level code, see the Vite build pin) loads the server-only module.
  // Source: gap D2/D3 (gaps/dead-code.md); #8504 caller-dead-code.test.ts:563
  // covers server fns.
  test.fails.each([
    {
      name: 'a class used by a server fn handler',
      code: `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
class Repo { get() { return db.users() } }
export const fn = createServerFn().handler(async () => new Repo().get())`,
      check: (module: Record<string, any>) => expect(module.fn).toBeDefined(),
    },
    {
      name: 'an enum used by a server fn handler',
      code: `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
enum Kind { A = db.a }
export const fn = createServerFn().handler(async () => Kind.A)`,
      check: (module: Record<string, any>) => expect(module.fn).toBeDefined(),
    },
    {
      name: 'a namespace used by a server fn handler',
      code: `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
namespace Repo { export const get = () => db.users() }
export const fn = createServerFn().handler(async () => Repo.get())`,
      check: (module: Record<string, any>) => expect(module.fn).toBeDefined(),
    },
    {
      name: 'an overloaded function used by a server fn handler',
      code: `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
function get(): string
function get(id?: string) { return db.users(id) }
export const fn = createServerFn().handler(async () => get())`,
      check: (module: Record<string, any>) => expect(module.fn).toBeDefined(),
    },
    {
      name: 'a redeclared var used by a server fn handler',
      code: `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
var repo = db.a
var repo = db.b
export const fn = createServerFn().handler(async () => repo)`,
      check: (module: Record<string, any>) => expect(module.fn).toBeDefined(),
    },
    {
      name: 'a class used by a middleware .server()',
      code: `import { createMiddleware } from '@tanstack/react-start'
import { db } from './db.server'
class Repo { get() { return db.users() } }
export const mw = createMiddleware().server(async ({ next }) => {
  new Repo().get()
  return next()
})`,
      check: (module: Record<string, any>) => expect(module.mw).toBeDefined(),
    },
    {
      name: 'a class used by an isomorphic .server()',
      code: `import { createIsomorphicFn } from '@tanstack/react-start'
import { db } from './db.server'
class Repo { get() { return db.users() } }
export const iso = createIsomorphicFn().server(() => new Repo().get()).client(() => 'client')`,
      check: (module: Record<string, any>) =>
        expect(module.iso()).toBe('client'),
    },
    {
      name: 'an overloaded function used by a createServerOnlyFn',
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
function get(): string
function get(id?: string) { return db.users(id) }
export const read = createServerOnlyFn(() => get())`,
      check: (module: Record<string, any>) =>
        expect(settle(() => module.read())).toBe(serverOnlyError),
    },
  ])(
    'client: $name does not load its server-only import',
    async ({ code, check }) => {
      const client = (await compileCode('client', code)) ?? code
      check(await evaluateModule(client, serverModuleStub))
    },
  )

  /**
   * The modules a compiled module still loads once TypeScript is erased with
   * `verbatimModuleSyntax` semantics, where only `import type` declarations
   * and `type` specifiers are dropped.
   */
  async function verbatimImportSources(code: string) {
    const { code: javascript } = await transformWithOxc(code, 'module.tsx', {
      lang: 'tsx',
      typescript: { onlyRemoveTypeImports: true },
    })
    return importSources(javascript)
  }

  // Control for the pin below (same harness): a server-only import that only
  // the handler read leaves the client.
  test('client: a server-only import only the handler reads is not loaded with verbatimModuleSyntax', async () => {
    const code = `${head}import { auth } from './auth'
export const fn = createServerFn().handler(async () => auth.get())`
    expect(
      await verbatimImportSources((await compileCode('client', code)) ?? code),
    ).toEqual([])
  })

  // With `verbatimModuleSyntax`, `import { type Db } from './db.server'`
  // keeps the module as a side-effect import (`import {} from`); the client
  // must still not load the server-only module for code it keeps that only
  // mentions the type.
  test('client: a server-only module imported only for a type specifier is not loaded with verbatimModuleSyntax', async () => {
    const code = `${head}import { type Db } from './db.server'
export function describeDb(db?: Db) {
  return db ? 'custom' : 'default'
}
export const fn = createServerFn().handler(async () => describeDb())`
    const client = (await compileCode('client', code)) ?? code
    expect(await verbatimImportSources(client)).not.toContain('./db.server')
    expect((await evaluateModule(client)).describeDb()).toBe('default')
  })

  // Bug: dead-code elimination counts a `typeof auth` type query in a
  // top-level type alias as a use of the `auth` import, so a server-only
  // import that the handler read and that such a type still mentions stays a
  // value import in the client output.
  // Impact: with `verbatimModuleSyntax` (TypeScript keeps value imports),
  // the client loads the server-only module and its top-level code ships
  // (see the Vite build pin).
  // Source: gap D4 (gaps/dead-code.md)
  test.fails(
    'client: a server-only import last mentioned by a type alias is not loaded with verbatimModuleSyntax',
    async () => {
      const code = `${head}import { auth } from './auth'
type Session = typeof auth.session
export const fn = createServerFn().handler(async () => auth.get() as Session)`
      expect(
        await verbatimImportSources(
          (await compileCode('client', code)) ?? code,
        ),
      ).toEqual([])
    },
  )

  /** A server fn whose validator is a module-level schema. */
  const schemaModule = (typeAlias: string) => `${head}import { z } from 'zod'
const themeValidator = z.union([z.literal('light'), z.literal('dark')])
${typeAlias}
export const setTheme = createServerFn({ method: 'POST' })
  .validator(themeValidator)
  .handler(async ({ data }) => data)`

  /** The modules a compiled module loads once TypeScript is erased. */
  async function erasedImportSources(code: string) {
    const { code: javascript } = await transformWithOxc(code, 'module.tsx', {
      lang: 'tsx',
    })
    return importSources(javascript)
  }

  // Control for the pin below (same harness): a schema only the validator
  // reads leaves the client with its import.
  test('client: a validator schema only the validator reads is not loaded', async () => {
    const code = schemaModule('')
    expect(
      await erasedImportSources((await compileCode('client', code)) ?? code),
    ).toEqual([])
  })

  // Bug: same family as above, for a module-level declaration: a validator
  // schema that a type alias also reads (`z.infer<typeof themeValidator>`)
  // stays in the client output, with what its initializer imports, although
  // types read no value at runtime. The root cause is upstream:
  // babel-dead-code-elimination 1.0.12 counts a `typeof` type query as a
  // reference (no workaround here; `deadCodeElimination` at
  // router-utils/src/ast.ts:190 runs it).
  // Source: fuzzing (oracle mode, V1); one unmodified corpus file.
  // Impact: the schema and its library (or server-only modules) ship to the
  // client, which never runs them (see the build pin in
  // start-build-env-separation.test.ts).
  test.fails(
    'client: a validator schema that a type alias reads with typeof is not loaded',
    async () => {
      const code = schemaModule('type Theme = z.infer<typeof themeValidator>')
      expect(
        await erasedImportSources((await compileCode('client', code)) ?? code),
      ).toEqual([])
    },
  )

  // Bug: removing a server fn handler from the callers keeps the comments
  // attached to it, which move to the RPC that replaces it. Middleware,
  // isomorphic and server-only fns drop them.
  // Impact: comments about server code (secrets, internals, `/*! */` legal
  // comments that minifiers keep) ship in the client module (in dev, and in
  // builds that do not minify).
  // Source: gap D5 (gaps/dead-code.md); #8504 caller-dead-code.test.ts:403
  test.fails.each([
    `/*! uses SERVICE_ROLE_KEY */\n  async () => 1,`,
    `// uses SERVICE_ROLE_KEY\n  async () => 1,`,
    `/* SERVICE_ROLE_KEY */ async () => 1,`,
    `async () => 1 /* SERVICE_ROLE_KEY */,`,
  ])(
    'client: comments around a server fn handler are dropped: %s',
    async (handler) => {
      const code = `${head}export const fn = createServerFn().handler(
  ${handler}
)`
      expect((await compileCode('client', code)) ?? code).not.toContain(
        'SERVICE_ROLE_KEY',
      )
    },
  )
})

describe('external import transforms', () => {
  /** Runtime stubs: each function returns the arguments it got. */
  const runtimeStubs = {
    '@example/runtime': {
      renderThing: (...args: Array<unknown>) => args,
      other: (...args: Array<unknown>) => ['other', ...args],
    },
  }

  beforeEach(() => {
    vi.stubGlobal('loadThing', () => 'loaded')
    return () => vi.unstubAllGlobals()
  })

  // Bug: a computed member call of the namespace import of a configured
  // transform's library (`runtime[key](...)`) is matched by the name of the
  // key expression, so `key`, a local variable that happens to be named like
  // the configured export, makes the call a candidate whatever its value.
  // Impact: the transform edits a call of another function of the library;
  // with the RSC CSS transform (react-start-rsc), CSS options are passed to
  // a function that does not expect them.
  // Source: #8504 compiler.test.ts "only transforms direct calls to
  // configured bindings" (the other rows pass on main).
  test.fails(
    'a transform leaves a computed member call named by a local variable alone',
    async () => {
      const code = `import * as runtime from '@example/runtime'
const Card = () => 'card'
const renderThing = 'other'
export const rendered = runtime[renderThing](<Card />)`
      const { compile } = createStartCompiler({
        env: 'server',
        compilerTransforms: [renderThingTransform],
      })
      const { rendered } = await evaluateModule(
        (await compile(code)) ?? code,
        runtimeStubs,
      )
      expect(rendered).toEqual(['other', 'card'])
    },
  )

  // Bug: a configured transform's export imported through a project module
  // that re-exports it (`src/rt.ts`: `export { renderThing } from
  // '@example/runtime'`) is only resolved for a top-level call in a module
  // that also uses a built-in Start factory (compiler.test.ts "runs
  // configured transforms on a top-level call imported through a project
  // re-export, next to a built-in factory"). A nested call, or a module
  // without a built-in factory, is left untransformed.
  // Impact: with the RSC CSS transform (react-start-rsc), a server component
  // rendered through the app's own re-export gets no CSS (its styles never
  // load). Declaring external transforms import-bound instead (and dropping
  // their lookup configurations) is the alternative to a fix.
  // Source: compiler.ts: external direct-call candidates are only the calls
  // of the library's own imports (`getExternalDirectCallCandidates`); other
  // calls are only resolved as top-level declarator initializers
  // (`isTopLevelDirectCallCandidate`), and only when the module has a
  // built-in direct-call kind (`checkDirectCalls`). Mutation-testing round 3
  // (sc-handlers E2/V2).
  test.fails.each([
    {
      name: 'a nested call next to a built-in factory',
      code: `import { renderThing } from './rt'
import { createServerOnlyFn } from '@tanstack/react-start'
export const only = createServerOnlyFn(() => 1)
export function rendered() { return renderThing('card') }`,
    },
    {
      name: 'a top-level call in a module without a built-in factory',
      code: `import { renderThing } from './rt'
const rendering = renderThing('card')
export function rendered() { return rendering }`,
    },
  ])(
    'a transform reaches a call imported through a project re-export: $name',
    async ({ code }) => {
      const { compile } = createStartCompiler({
        env: 'server',
        compilerTransforms: [renderThingTransform],
        files: {
          '/test/src/rt.ts': `export { renderThing } from '@example/runtime'`,
        },
        host: {
          resolveId: async (id) =>
            id.startsWith('./') ? `/test/src/${id.slice(2)}.ts` : id,
        },
      })
      const { rendered } = await evaluateModule(
        (await compile(code, '/test/src/routes/card.tsx')) ?? code,
        { './rt': runtimeStubs['@example/runtime'] },
      )
      expect(rendered()).toEqual(['card', { injected: 'loaded' }])
    },
  )
})

describe('Vue single-file components', () => {
  // Bug: the parser is chosen from the module id without its query, so the
  // `<script setup lang="ts">` block of a Vue SFC, which @vitejs/plugin-vue
  // serves in builds as `Page.vue?vue&type=script&setup=true&lang.ts`, is
  // parsed as TSX.
  // Impact: TypeScript-only syntax such as a `<string>value` assertion fails
  // the build.
  test.fails(
    'a <script setup lang="ts"> block is parsed as TypeScript',
    async () => {
      const { code, serverFns } = await compileFor(
        'client',
        `${head}import { db } from './db.server'
const input = <string>(globalThis as any).input
export const fn = createServerFn().handler(async () => db.x(input))`,
        { id: '/test/src/Page.vue?vue&type=script&setup=true&lang.ts' },
      )
      expect(Object.keys(serverFns)).toHaveLength(1)
      expect(importSources(code!)).not.toContain(serverOnly)
    },
  )
})

describe('CommonJS dependencies', () => {
  /** What the dependencies below are called with. */
  const app = { handler: (value: unknown) => ['handled', value] }

  // Bug: a module matching a detection pattern (`.handler(`) is parsed as strict ESM.
  // Impact: a sloppy-mode CommonJS dependency with such text fails the build.
  test.fails.each([
    {
      name: 'a legacy octal escape',
      id: '/test/node_modules/lib/index.cjs',
      code: `var reset = '\\033[0m'
module.exports = function (app) {
  return app.handler(reset)
}`,
      run: (module: { exports: any }) => module.exports(app),
    },
    {
      name: 'a with statement',
      id: '/test/node_modules/lib/index.cjs',
      code: `with (Math) {
  exports.run = function (app) {
    return app.handler(PI)
  }
}`,
      run: (module: { exports: any }) => module.exports.run(app),
    },
    {
      name: 'a top-level return',
      id: '/test/node_modules/lib/index.js',
      code: `if (typeof window === 'undefined') return
exports.run = function (app) {
  return app.handler(1)
}`,
      run: (module: { exports: any }) => module.exports.run,
    },
  ])(
    'a CommonJS dependency with $name compiles and keeps its meaning',
    async ({ id, code, run }) => {
      // Runs a CommonJS module (sloppy mode) and reads what `run` reads.
      const evaluate = (source: string) => {
        const module = { exports: {} as any }
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        new Function('module', 'exports', source)(module, module.exports)
        return run(module)
      }
      for (const env of ['client', 'server'] as const) {
        const { compile } = createStartCompiler({ env })
        expect(evaluate((await compile(code, id)) ?? code), env).toEqual(
          evaluate(code),
        )
      }
    },
  )
})

describe.each(startBundlers)('%s build', (bundler) => {
  const timeout = 60_000

  /** A server-only module whose top-level code marks the bundle it is in. */
  const dbModule = `globalThis.MARK_DB_LOADED = true
export const db = { users: () => 'users' }
`

  // Control for the pin below (same harness).
  test(
    'client: the server-only module of a function only server code uses is not bundled',
    async () => {
      const { client } = await buildStart({
        bundler,
        files: {
          'db.server.ts': dbModule,
          'fns.ts': `${head}import { db } from './db.server'
function find() { return db.users() }
export const fn = createServerFn().handler(async () => find())
`,
          'entry.ts': `export { fn } from './fns'\n`,
        },
      })
      expect(client.where('MARK_DB_LOADED')).toBe('nowhere')
    },
    timeout,
  )

  // Bug: the client output keeps a class only server code uses, with its
  // server-only import (compiler pin "client: a class used by a server fn
  // handler does not load its server-only import" above). Tree-shaking drops
  // the unused class but keeps the import, so the server-only module's
  // top-level code is bundled and runs in the browser.
  // Impact: server-only modules (database clients, SDKs initialised with
  // secrets) ship to the client and run their top-level code there.
  // Source: gap D2 (gaps/dead-code.md), build canary.
  test.fails(
    'client: the server-only module of a class only server code uses is not bundled',
    async () => {
      const { client } = await buildStart({
        bundler,
        files: {
          'db.server.ts': dbModule,
          'fns.ts': `${head}import { db } from './db.server'
class Repo { get() { return db.users() } }
export const fn = createServerFn().handler(async () => new Repo().get())
`,
          'entry.ts': `export { fn } from './fns'\n`,
        },
      })
      expect(client.where('MARK_DB_LOADED')).toBe('nowhere')
    },
    timeout,
  )

  /** A server fn module whose `auth` import a type still mentions. */
  const typeofFiles = (verbatimModuleSyntax: boolean) => ({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { verbatimModuleSyntax },
    }),
    'auth.ts': `globalThis.MARK_AUTH_LOADED = true
export const auth = { get: () => 'session', session: 'session' }
`,
    'fns.ts': `${head}import { auth } from './auth'
type Session = typeof auth.session
export const fn = createServerFn().handler(async () => auth.get() as Session)
`,
    'entry.ts': `export { fn } from './fns'\n`,
  })

  // Control for the pin below (same harness): without verbatimModuleSyntax,
  // TypeScript erases the import that only a type mentions.
  test(
    'client: a server-only module a type mentions is not bundled',
    async () => {
      const { client } = await buildStart({
        bundler,
        files: typeofFiles(false),
      })
      expect(client.where('MARK_AUTH_LOADED')).toBe('nowhere')
    },
    timeout,
  )

  // Bug (Vite): the client output keeps the server-only import that a
  // `typeof` type query still mentions (compiler pin "client: a server-only
  // import last mentioned by a type alias ..." above); with
  // `verbatimModuleSyntax`, Vite's TypeScript transform keeps it. Rsbuild's
  // transform of the same app drops it.
  // Impact: the server-only module's top-level code is bundled and runs in
  // the browser.
  // Source: gap D4 (gaps/dead-code.md), build canary.
  ;(bundler === 'vite' ? test.fails : test)(
    'client: a server-only module a type mentions is not bundled with verbatimModuleSyntax',
    async () => {
      const { client } = await buildStart({ bundler, files: typeofFiles(true) })
      expect(client.where('MARK_AUTH_LOADED')).toBe('nowhere')
    },
    timeout,
  )

  // Bug: with SSR as the server fn provider, the SSR caller module and the
  // provider module (`?tss-serverfn-split`) are two module instances of the
  // same file in the SSR bundle, and the provider repeats the file's
  // top-level code (exports-and-directives.test.ts "side-effect imports and
  // top-level statements stay in every output" asserts this).
  // Impact: in one server process, the file's top-level side effects run
  // twice, handlers and SSR code of the file see different module state, and
  // `instanceof` fails for a class of the file passed to a server fn.
  // Source: gap SF17 (gaps/start-env.md), PR #8656 (class identity).
  test.fails(
    'SSR: a server fn module is initialised once and shares its state with SSR code',
    async () => {
      const { ssr } = await buildStart({
        bundler,
        files: {
          'fns.ts': `${head}globalThis.initialised = (globalThis.initialised ?? 0) + 1
let count = 0
export class Session {}
export const readCount = () => count
export const fn = createServerFn().handler(async ({ data }) => {
  count++
  return data instanceof Session
})
`,
          'entry.ts': `export { fn, readCount, Session } from './fns'\n`,
        },
      })
      const { result } =
        await ssr.run(`const isSession = await entry.fn({ data: new entry.Session() })
return { initialised: globalThis.initialised, isSession, count: entry.readCount() }`)
      expect(result).toEqual({ initialised: 1, isSession: true, count: 1 })
    },
    timeout,
  )

  /**
   * An app whose client imports one server fn (`clientFn`) and whose server
   * entry imports another one only server code uses (`serverOnlyFn`), with
   * the server fn resolver the server-fn HTTP handler calls. The resolver is
   * imported by the server-only module, so the SSR build compiles that
   * module (and reports its server fn) before it generates the resolver.
   */
  const clientAccessFiles = {
    'client-fns.ts': `${head}export const clientFn = createServerFn().handler(async () => 'client fn')
`,
    'server-only-fns.ts': `${head}export const serverOnlyFn = createServerFn().handler(async () => 'server-only fn')
export { getServerFnById } from '#tanstack-start-server-fn-resolver'
`,
    'client-entry.ts': `export { clientFn } from './client-fns'
`,
    'ssr-entry.ts': `export { serverOnlyFn, getServerFnById } from './server-only-fns'
`,
  }

  /**
   * Builds `clientAccessFiles` and, in the SSR build, resolves each server fn
   * the way the server-fn HTTP handler resolves a request
   * (`origin: 'client'`), and calls the server-only one from SSR code.
   */
  async function callClientAccess() {
    const { client, ssr } = await buildStart({
      bundler,
      files: clientAccessFiles,
      entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
    })
    expect(client.where("'server-only fn'")).toBe('nowhere')
    const clientFnId = (await client.run(`return entry.clientFn.functionId`))
      .result
    const { result } = await ssr.run(`const settle = async (run) => {
  try {
    return await run()
  } catch {
    return 'rejected'
  }
}
const overHttp = (id) =>
  settle(async () => (await entry.getServerFnById(id, { origin: 'client' }))({}))
return {
  clientFn: await overHttp(${JSON.stringify(clientFnId)}),
  serverOnlyFnOverHttp: await overHttp(entry.serverOnlyFn.functionId),
  serverOnlyFnFromSsr: await settle(() => entry.serverOnlyFn()),
}`)
    return result
  }

  // Control for the pin below (same harness).
  test(
    'SSR: a server fn the client references is callable over HTTP, and a server-only one from SSR code',
    async () => {
      expect(await callClientAccess()).toMatchObject({
        clientFn: 'client fn',
        serverOnlyFnFromSsr: 'server-only fn',
      })
    },
    timeout,
  )

  // Bug: with SSR as the provider, the production resolver lists every
  // server fn the builds found and never checks the caller's origin
  // (`includeClientReferencedCheck` is off, and the flag it would check is
  // true for every SSR-caller compile, handleCreateServerFn.ts
  // `isClientReferenced`).
  // Impact: a server fn only server code uses (an SSR loader helper, a
  // server-only module) is callable over HTTP by anyone who learns its id,
  // bypassing what the server code around it checks.
  // Source: user ruling D6 (only server fns client code references are
  // HTTP-callable); the RSC-provider variant is pinned in
  // createServerFn/createServerFn.test.ts.
  test.fails(
    'SSR: a server fn only server code references is not callable over HTTP',
    async () => {
      expect(await callClientAccess()).toEqual({
        clientFn: 'client fn',
        serverOnlyFnOverHttp: 'rejected',
        serverOnlyFnFromSsr: 'server-only fn',
      })
    },
    timeout,
  )

  // Bug (Vite): the production server fn resolver is generated when the SSR
  // build first loads it, from the server fns found so far. A server fn that
  // only another server fn's handler (or a middleware `.server()`) calls is
  // found later, when the SSR build compiles the provider that imports it, so
  // it is missing from the resolver. Rsbuild rebuilds the resolver after the
  // SSR compilation found every server fn.
  // Impact: in production, calling it throws "Server function info not
  // found" (works in dev).
  // Source: issue #7213.
  ;(bundler === 'vite' ? test.fails : test)(
    'SSR: a server fn that only another server fn calls is callable',
    async () => {
      const { ssr } = await buildStart({
        bundler,
        files: {
          'inner.ts': `${head}export const inner = createServerFn().handler(async () => 'inner')
`,
          'outer.ts': `${head}import { inner } from './inner'
export const outer = createServerFn().handler(async () => 'outer:' + (await inner()))
`,
          'entry.ts': `export { outer } from './outer'\n`,
        },
      })
      expect((await ssr.run(`return await entry.outer()`)).result).toBe(
        'outer:inner',
      )
    },
    timeout,
  )

  // Control: start-build-env-separation.test.ts "a library's server fn"
  // (a library exporting a top-level server fn).
  // Bug: a library in node_modules that creates server fns for its users
  // (`createLoggedServerFn(handler)` returning
  // `createServerFn().handler(handler)`) is compiled like any module, but
  // the user's module only calls the library's function, so the compiler
  // never sees a server fn there, and nothing warns.
  // Impact: the handler the user passes, and what it imports, ship to the
  // client bundle and run there instead of on the server.
  // Source: lost-cases-campaign item 13 (b); user ruling D13 (a server fn
  // created inside a function is supported, or rejected clearly).
  test.fails(
    'a server fn created by a library function: the handler is not in the client bundle, or the build fails clearly',
    async () => {
      const outcome = await buildStart({
        bundler,
        files: {
          'node_modules/wrapper-lib/package.json': JSON.stringify({
            name: 'wrapper-lib',
            type: 'module',
            exports: './index.js',
            peerDependencies: { '@tanstack/react-start': '*' },
          }),
          'node_modules/wrapper-lib/index.js': `import { createServerFn } from '@tanstack/react-start'
export function createLoggedServerFn(handler) {
  return createServerFn().handler(handler)
}
`,
          'src/db.ts': `export const db = { secret: () => 'MARK_WRAPPED_HANDLER' }\n`,
          'src/fns.ts': `import { createLoggedServerFn } from 'wrapper-lib'
import { db } from './db'
export const fn = createLoggedServerFn(async () => db.secret())
`,
          'src/entry.ts': `export { fn } from './fns'\n`,
        },
        entry: 'src/entry.ts',
      }).then(
        async ({ client, ssr }) => ({
          client: client.where('MARK_WRAPPED_HANDLER'),
          ssr: (await ssr.run(`return await entry.fn()`)).result,
        }),
        (error: unknown) => ({ error: String(error) }),
      )
      if ('error' in outcome) {
        expect(outcome.error).toMatch(misplacedServerFnRejection)
        expect(outcome.error).not.toMatch(
          /Expected createServerFn declaration in a statement list/,
        )
      } else {
        expect(outcome).toEqual({
          client: 'nowhere',
          ssr: 'MARK_WRAPPED_HANDLER',
        })
      }
    },
    timeout,
  )

  // Bug (Rsbuild): in the SSR build, compiling a module with an isomorphic
  // fn makes the Start compiler resolve the module's `createMiddleware`
  // import (the server lookup does not know that factory). The Rsbuild
  // compiler host resolves it through the loader context, whose resolver
  // does not match the package's `import`-only exports (those of
  // `@tanstack/react-start`): the build fails with
  // `PackagePathNotExported(".")` (start-compiler-host.ts `resolveId`).
  // Impact: an app with a middleware and an isomorphic fn in one module
  // does not build with Rsbuild.
  // Source: lost-cases item 3 (BS-6 / K-13).
  ;(bundler === 'rsbuild' ? test.fails : test)(
    'a module with a middleware and an isomorphic fn builds, and its middleware runs on the server',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          'src/both.ts': `import { createIsomorphicFn, createMiddleware } from '@tanstack/react-start'
export const middleware = createMiddleware().server(({ next }) =>
  next({ context: { marker: 'MARK_MIDDLEWARE_SERVER' } }),
)
export const isomorphic = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')
`,
          'src/entry.ts': `export { middleware, isomorphic } from './both'\n`,
        },
        entry: 'src/entry.ts',
      })
      expect(client.where('MARK_MIDDLEWARE_SERVER')).toBe('nowhere')
      const { result } = await ssr.run(`return {
  middleware: entry.middleware.options.server({ next: (options) => options }),
  isomorphic: entry.isomorphic(),
}`)
      expect(result).toEqual({
        middleware: { context: { marker: 'MARK_MIDDLEWARE_SERVER' } },
        isomorphic: 'server',
      })
    },
    timeout,
  )
})

describe('Vite dev server', () => {
  /**
   * Resolves `'hang'` once `pending` has made no progress for `quietMs`: no
   * plugin hook ran (`lastActivity()`) and the main thread stayed idle (a
   * dependency optimizer bundling, or any other work the request waits for,
   * keeps it busy). Resolves `'settled'` when `pending` settles first, and
   * `'hang'` after `limitMs` at the latest.
   */
  async function settledOrHung(
    pending: Promise<unknown>,
    lastActivity: () => number,
    { quietMs = 1_500, limitMs = 15_000 } = {},
  ): Promise<'settled' | 'hang'> {
    let settled = false
    pending.then(
      () => (settled = true),
      () => (settled = true),
    )
    const started = performance.now()
    let busySince = started
    let previous = performance.eventLoopUtilization()
    while (!settled) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (settled) {
        break
      }
      const current = performance.eventLoopUtilization()
      if (
        performance.eventLoopUtilization(current, previous).utilization > 0.05
      ) {
        busySince = performance.now()
      }
      previous = current
      const now = performance.now()
      const quietFor = now - Math.max(lastActivity(), busySince)
      if (quietFor >= quietMs || now - started >= limitMs) {
        return 'hang'
      }
    }
    return 'settled'
  }

  /** Start packages of `transformClientModule`, by the names imported. */
  const clientStubs = (specifier: string, names: Set<string>): ModuleStub => {
    if (names.has('createClientRpc')) {
      return { createClientRpc: (id: string) => ({ functionId: id }) }
    }
    if (names.has('createServerFn')) {
      return {
        createServerFn: () => ({ handler: (rpc: unknown) => rpc }),
      }
    }
    if (names.has('z')) {
      return { z: { object: () => ({}) } }
    }
    throw new Error(`no stub for ${specifier}`)
  }

  /**
   * Starts a Vite dev server (middleware mode, empty dependency cache) on a
   * temporary project with the Start compiler, `src/fn.ts` = `code` and
   * `files`, and requests the client transform of `src/fn.ts`. Returns
   * `'hang'` when the transform stops making progress before it finishes
   * (`settledOrHung`); otherwise its code and the module evaluated with
   * stubbed Start packages and `zod`. Start packages are stubbed.
   */
  async function transformClientModule(
    code: string,
    files: Record<string, string> = {},
  ) {
    // Keep the temporary project inside the package so dependencies resolve.
    const root = await mkdtemp(path.join(__dirname, '.dev-transform-'))
    let server: Awaited<ReturnType<typeof createServer>> | undefined
    let lastActivity = performance.now()
    const active = () => {
      lastActivity = performance.now()
      return null
    }
    try {
      await mkdir(path.join(root, 'src'))
      for (const [file, content] of Object.entries({
        'fn.ts': code,
        ...files,
      })) {
        await writeFile(path.join(root, 'src', file), content)
      }
      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        cacheDir: path.join(root, '.vite'),
        appType: 'custom',
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
        plugins: [
          {
            name: 'record-activity',
            enforce: 'pre',
            resolveId: active,
            load: active,
            transform: active,
          },
          {
            name: 'stub-start-packages',
            resolveId: (id) =>
              id.startsWith('@tanstack/react-start') ? `\0${id}` : null,
            load: (id) =>
              id.startsWith('\0@tanstack/react-start')
                ? `export const createServerFn = () => ({ handler: (fn) => fn })
export const createClientRpc = (id) => id`
                : null,
          },
          startCompilerPlugin({
            framework: 'react',
            environments: [
              { name: 'client', type: 'client' },
              { name: 'ssr', type: 'server' },
            ],
            providerEnvName: 'ssr',
          }),
        ],
      })
      const transformed =
        server.environments.client.transformRequest('/src/fn.ts')
      if ((await settledOrHung(transformed, () => lastActivity)) === 'hang') {
        transformed.catch(() => {})
        return 'hang' as const
      }
      const served = (await transformed)!.code
      const client = server.environments.client
      const module = await createModuleGraph({
        modules: { '/src/fn.ts': served },
        // Project modules as the dev server serves them.
        load: async (id) =>
          id.startsWith('/src/')
            ? (await client.transformRequest(id))?.code
            : null,
        transform: (source) => source,
        fallbackStub: clientStubs,
      }).import('/src/fn.ts')
      return { code: served, module }
    } finally {
      await Promise.race([
        server?.close(),
        new Promise((resolve) => setTimeout(resolve, 3_000)),
      ])
      await rm(root, { recursive: true, force: true })
    }
  }

  /**
   * The client got `fn` as an RPC carrying its id, without the handler body
   * (`MARK_HANDLER`).
   */
  function expectClientRpc(
    result: Awaited<ReturnType<typeof transformClientModule>>,
  ) {
    expect(result).not.toBe('hang')
    const { code, module } = result as Exclude<typeof result, 'hang'>
    expect(code).not.toContain('MARK_HANDLER')
    expect(module.fn).toEqual({ functionId: expect.any(String) })
  }

  // Control for the pin below (same harness).
  test('transforms a client module with a server fn and a top-level call of a project function', async () => {
    expectClientRpc(
      await transformClientModule(
        `${head}import { define } from './define'
export const schema = define()
export const fn = createServerFn().handler(() => 'MARK_HANDLER')`,
        { 'define.ts': `export const define = () => ({})` },
      ),
    )
  }, 30_000)

  // Bug: next to a server fn, a top-level `const x = f()` may be a renamed or
  // re-exported Start factory, so in dev the client compiler loads the module
  // of `f` through the client environment, from inside the transform. For a
  // pre-bundled dependency (here `zod`) with an empty dependency cache, that
  // load waits for the dependency optimizer, which waits for this transform.
  // Impact: with an empty dependency cache, such a module (a `z.object()`
  // schema next to a server fn) never finishes transforming when it is
  // requested as the dev server starts (`server.warmup`, the first request
  // of a middleware-mode server, or `transformRequest()`), and the page hangs.
  test.fails(
    'transforms a client module with a server fn and a top-level call of a pre-bundled dependency',
    async () => {
      expectClientRpc(
        await transformClientModule(
          `${head}import { z } from 'zod'
export const schema = z.object({})
export const fn = createServerFn().handler(() => 'MARK_HANDLER')`,
        ),
      )
    },
    30_000,
  )

  /** Start packages of the server fn dev servers: RPCs expose their id. */
  const serverFnStubs: Record<string, string> = {
    '@tanstack/react-start': `export const createServerFn = () => ({
  handler: (rpc, impl) =>
    impl ? Object.assign((opts) => impl(opts ?? {}), { __executeServer: (opts) => impl(opts ?? {}) }) : rpc,
})`,
    '@tanstack/react-start/server-rpc': `export const createServerRpc = (meta, fn) => Object.assign(fn, { meta })`,
    '@tanstack/react-start/ssr-rpc': `export const createSsrRpc = (id) => ({ functionId: id })`,
    '@tanstack/react-start/client-rpc': `export const createClientRpc = (id) => ({ functionId: id })`,
  }

  /**
   * Starts a Vite dev server (middleware mode) with the Start compiler on
   * `root`, with SSR as the server fn provider.
   */
  function startServerFnDevServer(root: string) {
    return createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      cacheDir: path.join(root, '.vite'),
      appType: 'custom',
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      plugins: [
        {
          name: 'stub-start-packages',
          resolveId: (id) => (id in serverFnStubs ? `\0stub:${id}` : null),
          load: (id) =>
            id.startsWith('\0stub:')
              ? serverFnStubs[id.slice('\0stub:'.length)]
              : null,
        },
        startCompilerPlugin({
          framework: 'react',
          environments: [
            { name: 'client', type: 'client' },
            { name: 'ssr', type: 'server' },
          ],
          providerEnvName: 'ssr',
        }),
      ],
    })
  }

  /**
   * In a temporary project with `src/fns.ts` = a `greet` server fn, reads the
   * id of `greet` through a first dev server, then calls the id through the
   * server fn resolver (`getServerFnById`, like the server fn router) of a
   * dev server started with `fresh` (a new server, which has compiled
   * nothing) or of the same server. Returns the result or the error message.
   */
  async function callServerFnId(fresh: boolean) {
    const root = await mkdtemp(path.join(__dirname, '.dev-server-fn-'))
    const servers: Array<Awaited<ReturnType<typeof createServer>>> = []
    try {
      await mkdir(path.join(root, 'src'))
      await writeFile(
        path.join(root, 'src', 'fns.ts'),
        `${head}export const greet = createServerFn().handler(() => 'hello')\n`,
      )
      /** Imports a module in the SSR environment of a dev server. */
      const importSsr = (
        server: Awaited<ReturnType<typeof createServer>>,
        id: string,
      ) => {
        const ssr = server.environments.ssr
        if (!ssr || !isRunnableDevEnvironment(ssr)) {
          throw new Error('expected a runnable SSR environment')
        }
        return ssr.runner.import(id)
      }
      const first = await startServerFnDevServer(root)
      servers.push(first)
      const { greet } = await importSsr(first, '/src/fns.ts')
      let server = first
      if (fresh) {
        await first.close()
        server = await startServerFnDevServer(root)
        servers.push(server)
      }
      const { getServerFnById } = await importSsr(
        server,
        '#tanstack-start-server-fn-resolver',
      )
      try {
        return await (
          await getServerFnById(greet.functionId)
        )({})
      } catch (error) {
        return `throws: ${(error as Error).message}`
      }
    } finally {
      for (const server of servers) {
        await server.close()
      }
      await rm(root, { recursive: true, force: true })
    }
  }

  // Control for the pin below (same harness).
  test('calls a server fn id on the dev server that compiled its module', async () => {
    expect(await callServerFnId(false)).toBe('hello')
  }, 30_000)

  // Bug: when a server fn id is not registered yet, the dev validator
  // (`validate-server-fn-id`) transforms the source file under
  // `?server-fn-module-lookup`, the one id the compiling transform excludes,
  // so the id is never registered and the validator rejects it.
  // Impact: after a dev server restart, calling a server fn whose module the
  // new server has not compiled yet (e.g. from a page loaded before the
  // restart) fails with "Invalid server function ID" (500).
  // Source: issue #8447, gap SF8 (gaps/start-env.md).
  test.fails(
    'calls a server fn id on a fresh dev server that has not compiled its module',
    async () => {
      expect(await callServerFnId(true)).toBe('hello')
    },
    30_000,
  )
})
