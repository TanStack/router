/**
 * Known Start compiler bugs. Each test asserts correct behaviour for a bug on
 * main and is marked .fails; remove .fails when the bug is fixed.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createServer, isRunnableDevEnvironment, transformWithOxc } from 'vite'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { startCompilerPlugin } from '../src/vite/start-compiler-plugin/plugin'
import { buildStart } from './build-harness'
import {
  callReportedServerFns,
  clientOnlyError,
  compileAll,
  compileCode,
  compileErrorMessage,
  compileFor,
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

    test.each(['client', 'ssr'] as const)(
      'it rejects a %s output with the handler body next to rejecting outputs',
      async (leaking) => {
        const results = {
          client: rejection,
          ssr: rejection,
          provider: rejection,
          [leaking]: { code, serverFns: {} },
        }
        await expect(expectOutputsFreeOfHandler(code, results)).rejects.toThrow(
          leaking,
        )
      },
    )

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

describe('server code in the client bundle', () => {
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
      // One compiler for every importer, like a production build.
      const { compile } = createStartCompiler({
        env: 'client',
        files: {
          '/test/src/d.ts': `${head}export const base = createServerFn()`,
          ...reExports,
        },
      })
      const leaked: Array<string> = []
      for (const [id, code] of importers) {
        if (((await compile(code, id)) ?? code).includes(serverOnly)) {
          leaked.push(id)
        }
      }
      expect(leaked).toEqual([])
    },
  )

  // Bug: middleware, isomorphic and env-only fns are detected by the
  // `createMiddleware` / `createIsomorphicFn` / `createServerOnlyFn` text, so
  // a module that only finishes a builder imported from another module, or
  // calls a factory re-exported under another name, is never compiled.
  // Impact: the `.server()` implementation (the server-only implementation,
  // which the uncompiled factory returns as is) and its server-only imports
  // ship to the client.
  test.fails.each<{
    name: string
    files: Record<string, string>
    code: string
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
    },
    {
      // Source: #8504 compiler.test.ts "resolves distinct re-export aliases
      // without conflating their source bindings" (red on main with the
      // detection the bundler plugins run)
      name: 'a renamed createServerOnlyFn re-export',
      files: {
        '/test/src/env.ts': `export { createServerOnlyFn as serverOnly } from '@tanstack/react-start'`,
      },
      code: `import { serverOnly } from './env'
import { db } from './db.server'
export const read = serverOnly(() => db.x())`,
    },
  ])(
    'client builds compile $name finished or called in another module',
    async ({ files, code }) => {
      const client = (await compileCode('client', code, { files })) ?? code
      expect(client).not.toContain(serverOnly)
    },
  )

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
      expect(client).not.toContain(serverOnly)
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
      expect(client).not.toContain(serverOnly)
    },
  )

  // Bug: the builder of a `.handler()` chain is resolved through identifiers
  // and member expressions only, so a builder returned by a function call
  // (`authed().handler(...)`) is not traced. Rejecting it with a clear
  // compile error is a valid fix.
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
    },
  )

  // Bug: chain methods are only recognized when called through a static
  // member (`.handler(...)`), so one called through a computed member
  // (`builder['handler'](...)`) leaves the module untransformed.
  // Impact: the server implementation and its server-only imports ship to
  // the client.
  test.fails.each([
    {
      name: 'a server fn handler',
      code: `${head}import { db } from './db.server'
export const fn = createServerFn()['handler'](async () => db.x())`,
    },
    {
      name: 'a middleware server implementation',
      code: `import { createMiddleware } from '@tanstack/react-start'
import { db } from './db.server'
export const mw = createMiddleware()['server'](async ({ next }) => {
  db.x()
  return next()
})`,
    },
    {
      name: 'an isomorphic server implementation',
      code: `import { createIsomorphicFn } from '@tanstack/react-start'
import { db } from './db.server'
export const fn = createIsomorphicFn()['server'](() => db.x()).client(() => 'client')`,
    },
  ])(
    'client builds compile $name called through a computed member',
    async ({ code }) => {
      const client = (await compileCode('client', code)) ?? code
      expect(client).not.toContain(serverOnly)
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
  // Source: user ruling D13 (the one placement that must be rejected).
  test.fails.each(Object.keys(placementHeads) as Array<PlacementHead>)(
    'with %s imported, a nested server fn whose handler reads a local of its function is rejected in every output',
    async (importHead) => {
      const code = placementModule(importHead, capturingPlacement.code)
      for (const output of outputs) {
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
      const module = await evaluateModule(
        (await compileCode(output, code)) ?? code,
        { './db.server': { db: {} } },
      )
      expect(module.fn).toEqual({ rpc: { [output]: expect.any(String) } })
    },
  )

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
        const { compile } = createStartCompiler({ env })
        expect((await compile(code, id)) ?? code).toBe(code)
      }
    },
  )
})

describe('Vite build', () => {
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
      const { client } = await buildStart({ files: typeofFiles(false) })
      expect(client.where('MARK_AUTH_LOADED')).toBe('nowhere')
    },
    timeout,
  )

  // Bug: the client output keeps the server-only import that a `typeof` type
  // query still mentions (compiler pin "client: a server-only import last
  // mentioned by a type alias ..." above); with
  // `verbatimModuleSyntax`, Vite's TypeScript transform keeps it.
  // Impact: the server-only module's top-level code is bundled and runs in
  // the browser.
  // Source: gap D4 (gaps/dead-code.md), build canary.
  test.fails(
    'client: a server-only module a type mentions is not bundled with verbatimModuleSyntax',
    async () => {
      const { client } = await buildStart({ files: typeofFiles(true) })
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

  // Bug: the production server fn resolver is generated when the SSR build
  // first loads it, from the server fns found so far. A server fn that only
  // another server fn's handler (or a middleware `.server()`) calls is found
  // later, when the SSR build compiles the provider that imports it, so it
  // is missing from the resolver.
  // Impact: in production, calling it throws "Server function info not
  // found" (works in dev).
  // Source: issue #7213.
  test.fails(
    'SSR: a server fn that only another server fn calls is callable',
    async () => {
      const { ssr } = await buildStart({
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
})

describe('Vite dev server', () => {
  /**
   * Starts a Vite dev server (middleware mode, empty dependency cache) on a
   * temporary project with the Start compiler, `src/fn.ts` = `code` and
   * `files`, and returns the client transform of `src/fn.ts`, or `'timeout'`
   * when it has not finished after 15 s. Start packages are stubbed.
   */
  async function transformClientModule(
    code: string,
    files: Record<string, string> = {},
  ) {
    // Keep the temporary project inside the package so dependencies resolve.
    const root = await mkdtemp(path.join(__dirname, '.dev-transform-'))
    let server: Awaited<ReturnType<typeof createServer>> | undefined
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
      const transformed = server.environments.client
        .transformRequest('/src/fn.ts')
        .then((result) => result?.code ?? null)
      return await Promise.race([
        transformed,
        new Promise<'timeout'>((resolve) =>
          setTimeout(() => resolve('timeout'), 15_000),
        ),
      ])
    } finally {
      await Promise.race([
        server?.close(),
        new Promise((resolve) => setTimeout(resolve, 3_000)),
      ])
      await rm(root, { recursive: true, force: true })
    }
  }

  // Control for the pin below (same harness).
  test('transforms a client module with a server fn and a top-level call of a project function', async () => {
    const code = await transformClientModule(
      `${head}import { define } from './define'
export const schema = define()
export const fn = createServerFn().handler(() => 1)`,
      { 'define.ts': `export const define = () => ({})` },
    )
    expect(code).toContain('createClientRpc')
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
      const code = await transformClientModule(
        `${head}import { z } from 'zod'
export const schema = z.object({})
export const fn = createServerFn().handler(() => 1)`,
      )
      expect(code).toContain('createClientRpc')
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
