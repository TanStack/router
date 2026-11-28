/**
 * Start compiler cases main gets wrong. Each test asserts the correct behaviour for a
 * bug main had, which today's compiler fixes (a regression test,
 * oracle/KNOWN-BUGS.md).
 *
 * Every row runs through the public Start host (`./start-host`: Start's
 * Vite plugin of the built `@tanstack/react-start` in a real dev server, a
 * real Chromium page for client code, Start's real server entry and request
 * context): what a page that imports the module loads and gets, what the
 * server gets, and server fns called from the client (Start's RPC through
 * the dev server) and from server code (in a real request). Each case is a
 * directory of real files (the module and every module it imports).
 *
 * Elsewhere: the build-mode export cache rows, which only a production
 * build exercises and which a real build does not reproduce (regression
 * tests now: integration/start-compiler-build-export-cache.test.ts); the
 * CommonJS dependency pins (SPEC J4.16), in
 * integration/start-build-server-fn-cases.test.ts; the Vue SFC pin, in
 * integration/start-vue-sfc-script-ts.test.ts.
 */

import { beforeAll, describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  Thrown,
  callFromClient,
  callOnServer,
  callServerFnThroughCallers,
  compileError,
  createStartHost,
  expectCompileError,
  expectNoClientHandler,
  fromPage,
  inPage,
  serveCase,
  serverFnUrls,
  serverOnlyModule,
  settle,
  settleAsync,
  throwsError,
} from './regression-helpers'
import { bindingNames } from './binding-names'
import {
  clientMiddleware,
  clientMiddlewareOf,
  runOnServerModule,
  shapeOf,
} from './page-values'
import {
  capturingPlacement,
  placementHeads,
  placementModule,
  placements,
} from './createServerFn/placements'
import type { StartHost } from './start-host'
import type { PageSettled, StartCase } from './regression-helpers'
import type { PlacementHead } from './createServerFn/placements'

const head = `import { createServerFn } from '@tanstack/react-start'\n`

/** Server-only module that must never reach the client bundle. */
const serverOnly = serverOnlyModule

/** The server-only module of the cases below (`./db.server`). */
const dbFile = `export const db = {
  x: () => 'from the server',
  log: () => 'logged',
  secret: () => 'secret',
}
`

let host: StartHost
beforeAll(async () => {
  host = await createStartHost()
  return () => host.close()
}, 60_000)

/** A case of `files` with the server-only module. */
async function newCase(files: Record<string, string>) {
  return host.case({ 'db.server.ts': dbFile, ...files })
}

/**
 * Serves a case of `files` (every environment serves and evaluates its
 * module) and calls every server fn the module exports from the client, by
 * id through the dev server (the server runs each handler). Returns the case
 * and the results of the calls.
 */
async function callServerFns(files: Record<string, string>) {
  const served = await serveCase(host, {
    'db.server.ts': dbFile,
    ...files,
  })
  const results = await inPage(
    served,
    `const results = []
for (const value of Object.values(module)) {
  if (typeof value === 'function' && typeof value.url === 'string') {
    results.push(await value({ data: undefined }))
  }
}
return results`,
  )
  return { served, results }
}

/**
 * What `expression` (a page expression with the module as `module`) gives
 * in the page: its value (`shapeOf`: functions spelled `'<function>'`), or
 * a `Thrown` with what it throws.
 */
async function clientValue(
  startCase: StartCase,
  expression: string,
  options: { file?: string } = {},
) {
  return fromPage(
    await inPage<PageSettled>(
      startCase,
      `${shapeOf}\nreturn settle(async () => shapeOf(await (${expression})))`,
      options,
    ),
  )
}

/**
 * The client of a case of `code` does not load the server-only module, and
 * the server-only fn (`fn`, a page expression with the module as `module`)
 * is a function there that throws the server-only error when its `read`
 * export calls it. Server code calling `read` gets the server's value.
 */
async function expectServerOnlyRead(code: string, fn: string) {
  const startCase = await newCase({ 'module.tsx': code })
  expectNotLoaded(await startCase.loads(), [serverOnly])
  expect(
    await clientValue(startCase, `[typeof module.read, typeof (${fn})]`),
  ).toEqual(['function', 'function'])
  expect(await clientValue(startCase, 'module.read()')).toEqual(throwsError)
  expect((await startCase.ssr()).read()).toBe('secret')
}

/**
 * The client of the case keeps no server-only import and calls its server
 * fn `fn` through an RPC (a public `url`), which reaches the handler on the
 * server.
 */
async function expectServerFnThroughRpc(startCase: StartCase) {
  expectNotLoaded(await startCase.loads(), [serverOnly])
  expect(await inPage(startCase, 'return typeof module.fn.url')).toBe('string')
  expect(await callFromClient(startCase, 'module.fn')).toBe('from the server')
}

/** `read` of a placement: a page expression, or a function of the module. */
function readOf(
  read: string | ((module: Record<string, any>) => unknown) | undefined,
) {
  if (read === undefined || typeof read === 'string') {
    return read
  }
  return `(${read.toString()})(module)`
}

describe('server code in the client bundle', () => {
  test('a server fn in a plain .ts module compiles by its id', async () => {
    const served = await serveCase(
      host,
      {
        'db.server.ts': dbFile,
        'fns.ts': `${head}import { db } from './db.server'
const input = <string>(globalThis as any).input
export const fn = createServerFn().handler(async () => db.x(input))`,
      },
      { file: 'fns.ts' },
    )
    expect(
      await serverFnUrls(served, 'module', { file: 'fns.ts' }),
    ).toHaveLength(1)
    expectNotLoaded(await served.loads('fns.ts'), [serverOnly])
  })

  /**
   * A case of `code` (with project modules `files`): its client keeps no
   * server-only import, and `expression` (a page expression) gives
   * `expected` in the page.
   */
  async function expectClientCompiled(
    code: string,
    files: Record<string, string>,
    check?: { expression: string; expected: unknown },
  ) {
    const startCase = await newCase({ 'module.tsx': code, ...files })
    expectNotLoaded(await startCase.loads(), [serverOnly])
    if (check) {
      expect(await clientValue(startCase, check.expression)).toEqual(
        check.expected,
      )
    }
  }

  // On main, the `.server()` implementation (the server-only implementation,
  // which the uncompiled factory returns as is) and its server-only imports
  // ship to the client.
  test.each<{
    name: string
    files: Record<string, string>
    code: string
    check: { expression: string; expected: unknown }
  }>([
    {
      name: 'a middleware builder',
      files: {
        'mw.ts': `import { createMiddleware } from '@tanstack/react-start'
export const mw = createMiddleware({ type: 'function' })`,
      },
      code: `import { mw } from './mw'
import { db } from './db.server'
export const logged = mw.server(async ({ next }) => { db.log(); return next() })`,
      check: {
        expression: clientMiddlewareOf('module.logged'),
        expected: clientMiddleware('function'),
      },
    },
    {
      // Source: createMiddleware.test.ts "slow path for a factory alias"
      // (asserted resolveId calls only).
      name: 'a createMiddleware alias',
      files: {
        'mw.ts': `import { createMiddleware } from '@tanstack/react-start'
export const createFooMiddleware = createMiddleware`,
      },
      code: `import { createFooMiddleware } from './mw'
import { db } from './db.server'
export const logged = createFooMiddleware({ type: 'function' }).server(async ({ next }) => {
  db.log()
  return next()
})`,
      check: {
        expression: clientMiddlewareOf('module.logged'),
        expected: clientMiddleware('function'),
      },
    },
    {
      name: 'an isomorphic builder',
      files: {
        'iso.ts': `import { createIsomorphicFn } from '@tanstack/react-start'
export const iso = createIsomorphicFn()`,
      },
      code: `import { iso } from './iso'
import { db } from './db.server'
export const fn = iso.server(() => db.x()).client(() => 'client')`,
      check: { expression: 'module.fn()', expected: 'client' },
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
        'env.ts': `export { createServerOnlyFn as serverOnly } from '@tanstack/react-start'`,
      },
      code: `import { serverOnly } from './env'
import { db } from './db.server'
export const read = serverOnly(() => db.x())`,
      check: { expression: 'module.read()', expected: throwsError },
    },
  ])(
    'client builds compile $name finished or called in another module',
    async ({ files, code, check }) => {
      await expectClientCompiled(code, files, check)
    },
  )

  // Control for the two pins below (same harness): the builder imported by
  // name.
  test('client builds compile a builder imported by name', async () => {
    await expectServerFnThroughRpc(
      await newCase({
        'module.tsx': `import { authed } from './fns'
import { db } from './db.server'
export const fn = authed.handler(async () => db.x())`,
        'fns.ts': `${head}export const authed = createServerFn({ method: 'POST' })`,
      }),
    )
  })

  // On main, the module is left untransformed and ships its handler and
  // server-only imports to the client.
  test('client builds compile a builder read from a namespace import', async () => {
    await expectServerFnThroughRpc(
      await newCase({
        'module.tsx': `import * as F from './fns'
import { db } from './db.server'
export const fn = F.authed.handler(async () => db.x())`,
        'fns.ts': `${head}export const authed = createServerFn({ method: 'POST' })`,
      }),
    )
  })

  // On main, `Start.createServerFn()` modules are left untransformed and ship
  // their handler and server-only imports to the client.
  test('client builds compile factories of a re-exported Start namespace', async () => {
    await expectServerFnThroughRpc(
      await newCase({
        'module.tsx': `import { Start } from './start'
import { db } from './db.server'
export const fn = Start.createServerFn().handler(async () => db.x())`,
        'start.ts': `export * as Start from '@tanstack/react-start'`,
      }),
    )
  })

  // On main, the module is left untransformed and ships its handler and
  // server-only imports to the client, without an RPC.
  test.each<{
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
        'fns.ts': `${head}export const authed = () => createServerFn({ method: 'POST' })`,
      },
    },
  ])(
    'client builds compile a builder returned by a function of $name',
    async ({ code, files }) => {
      await expectServerFnThroughRpc(
        await newCase({ 'module.tsx': code, ...files }),
      )
    },
  )

  // A builder the user passes through a helper function
  // (\`applyStep(createServerFn().validator(schema))\`) is not traced through
  // the call: the client build fails at the argument (R92: a build error is
  // enough for a wrapper).
  // Source: fuzzing (builders passed through user helpers).
  test('a server fn whose builder passes through a helper function fails the client', async () => {
    const code = `${head}import { schema } from './schema'
function applyStep<T>(builder: T) {
  return builder
}
export const fn = applyStep(
  createServerFn({ method: 'POST' }).validator(schema),
).handler(async ({ data }) => data)`
    const startCase = await newCase({
      'module.tsx': code,
      'schema.ts': `export const schema = (data: string) => \`\${data}!\`\n`,
    })
    expectCompileError(await compileError(startCase), {
      source: code,
      at: `createServerFn({ method: 'POST' })`,
      column: true,
    })
  })

  // Bug: same family, for an isomorphic fn whose chain passes through a
  // helper function (`withBuilder(createIsomorphicFn().server(f)).client(g)`):
  // the inner `createIsomorphicFn().server(f)` is compiled on its own into a
  // plain function, so `.client(g)` is then called on that function. Its
  // `.server()` finished the value, so nothing refuses it (R92: a wrapper is
  // not followed), and no server code ships.
  // Source: fuzzing (builders passed through user helpers).
  // Impact: the module throws when it loads ("withBuilder(...).client is not
  // a function"), on the client and on the server. A build error at the
  // helper is a fix too (R92).
  test.fails(
    'each output keeps its implementation of an isomorphic fn whose chain passes through a helper function',
    async () => {
      const startCase = await newCase({
        'module.tsx': `import { createIsomorphicFn } from '@tanstack/react-start'
function withBuilder<T>(builder: T) {
  return builder
}
export const getEnv = withBuilder(
  createIsomorphicFn().server(() => 'server'),
).client(() => 'client')`,
      })
      if ((await compileError(startCase)) !== undefined) {
        return
      }
      const client = await clientValue(startCase, 'module.getEnv()').catch(
        (error: unknown) => {
          // The bug fails the pin's assertion; any other failure of the
          // page run fails the pin as the error it is
          expect(String(error), 'the module loads in the page').not.toMatch(
            /withBuilder\(\.\.\.\)\.client is not a function/,
          )
          throw error
        },
      )
      expect({
        client,
        ssr: settle((await startCase.ssr()).getEnv),
      }).toEqual({ client: 'client', ssr: 'server' })
    },
  )

  // On main, the implementation and its server-only imports ship to the client,
  // where calling the server-only fn runs it instead of throwing.
  test.each([
    {
      name: 'a renamed import in a function body',
      fn: 'module.getRead()',
      code: `import { createServerOnlyFn as serverOnly } from '@tanstack/react-start'
import { db } from './db.server'
export function getRead() { return serverOnly(() => db.secret()) }
export const read = () => getRead()()`,
    },
    {
      name: 'a renamed import in an object property',
      fn: 'module.api.read',
      code: `import { createServerOnlyFn as serverOnly } from '@tanstack/react-start'
import { db } from './db.server'
export const api = { read: serverOnly(() => db.secret()) }
export const read = () => api.read()`,
    },
    {
      name: 'a local alias in a function body',
      fn: 'module.getRead()',
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
const so = createServerOnlyFn
export function getRead() { return so(() => db.secret()) }
export const read = () => getRead()()`,
    },
    {
      name: 'a local alias in a function-local const',
      fn: 'module.getRead()',
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
const so = createServerOnlyFn
export function getRead() { const fn = so(() => db.secret()); return fn }
export const read = () => getRead()()`,
    },
  ])(
    'client: a createServerOnlyFn called through $name is compiled',
    async ({ code, fn }) => {
      await expectServerOnlyRead(code, fn)
    },
  )

  /**
   * The server-only module of the call shapes: `x` and `secret` record a
   * call in its exported `calls`.
   */
  const callShapeDb = `export const calls: Array<string> = []
export const db = {
  x: () => {
    calls.push('x')
    return 'x'
  },
  secret: () => {
    calls.push('secret')
    return 'secret'
  },
}
`

  /**
   * A module whose server code a compiler may not recognise (SPEC J4.5,
   * J4.6, J4.12), and what each environment must do if it compiles.
   */
  interface CallShape {
    name: string
    code: string
    /** The text of the call a rejection points at. */
    at: string
    /** Server code the client must not hold. */
    body: string
    /** A page expression on the client module, and what it must give. */
    client: { expression: string; expected: unknown }
    /**
     * Checks the module the SSR environment evaluated (`calls`: the
     * server-only calls it made).
     */
    ssr?: (
      module: Record<string, any>,
      calls: Array<string>,
    ) => void | Promise<void>
    /**
     * The server fn (a page and server expression): when both environments
     * compiled the module, calling it from the client and from server code
     * gives what the handler returns.
     */
    serverFn?: string
  }

  /**
   * Each environment serving `shape.code` either rejects it with a compile
   * error at the call (`expectCompileError`: the line of `at`), or follows its
   * contract: the client neither loads the server-only module nor holds the
   * server code, and each environment runs what the runtime contract
   * promises.
   */
  async function expectWorksOrRejectedAtCall(shape: CallShape) {
    const startCase = await newCase({
      'db.server.ts': callShapeDb,
      'module.tsx': shape.code,
    })
    const compiled: Partial<Record<'client' | 'ssr', string>> = {}
    for (const environment of ['client', 'ssr'] as const) {
      const failure = await compileError(startCase, environment)
      if (failure !== undefined) {
        expectCompileError(failure, {
          source: shape.code,
          at: shape.at,
        })
        continue
      }
      compiled[environment] = await startCase.served('module.tsx', environment)
    }
    if (compiled.client !== undefined) {
      expectNotLoaded(await startCase.loads(), [serverOnly])
      expect(compiled.client, 'client').not.toContain(shape.body)
      expect(await clientValue(startCase, shape.client.expression)).toEqual(
        shape.client.expected,
      )
    }
    if (compiled.ssr !== undefined && shape.ssr) {
      const { calls } = await startCase.ssr('db.server.ts')
      calls.length = 0
      await shape.ssr(await startCase.ssr(), calls)
    }
    if (
      shape.serverFn &&
      compiled.client !== undefined &&
      compiled.ssr !== undefined
    ) {
      expect(await callServerFnThroughCallers(startCase, shape.serverFn)).toBe(
        'x',
      )
    }
  }

  // Source: #8630 pins; SPEC J4.5 ("unrecognised shapes must not silently
  // leak"), J4.12. tsc against the real declarations accepts every row.
  // On main, the server implementation and its server-only import ship to the
  // client, where the server fn, isomorphic fn or server-only fn runs it in the
  // browser.
  // Fix-agnostic: each environment either rejects the module with a compile
  // error at the call, or follows its contract: the client neither loads the
  // server-only module nor holds the server code, and each environment runs
  // what the runtime contract promises.
  // The request middleware shape (`createMiddleware()['server'](...)`, the same
  // root cause) is pinned once, in its build twin:
  // integration/start-build-call-shapes.test.ts runs it as the app's request
  // middleware in a real request (same input, same outcomes), which this file's
  // shared host has no start entry for.
  test.each<CallShape>([
    {
      name: 'a server fn handler called through a computed member',
      code: `${head}import { db } from './db.server'
export const fn = createServerFn()['handler'](async () => db.x())`,
      at: `createServerFn()['handler']`,
      body: 'db.x()',
      client: { expression: 'typeof module.fn.url', expected: 'string' },
      serverFn: 'module.fn',
    },
    {
      name: 'an isomorphic server implementation called through a computed member',
      code: `import { createIsomorphicFn } from '@tanstack/react-start'
import { db } from './db.server'
export const fn = createIsomorphicFn()['server'](() => db.x()).client(() => 'client')`,
      at: `createIsomorphicFn()['server']`,
      body: 'db.x()',
      client: { expression: 'module.fn()', expected: 'client' },
      ssr: (module) => expect(module.fn()).toBe('x'),
    },
    {
      name: 'a createServerOnlyFn whose result is bound',
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
export const read = createServerOnlyFn(() => db.secret()).bind(null)`,
      at: 'createServerOnlyFn(',
      body: 'db.secret()',
      client: { expression: 'module.read()', expected: throwsError },
      ssr: (module) => expect(module.read()).toBe('secret'),
    },
  ])(
    '$name: the client holds no server code, or the module is rejected at the call',
    async (shape) => {
      await expectWorksOrRejectedAtCall(shape)
    },
  )

  // Source: the known-bug row "a local alias in a top-level block" deleted in
  // a945fe4563, restored (the "block" position of SPEC J4.6).
  // On main, the implementation and its server-only import ship to the client,
  // where calling the server-only fn runs it instead of throwing.
  // Fix-agnostic: compiled per its contract (the client throws the server-only
  // error and loads nothing server-only, SSR runs it) or rejected with a clear
  // compile error at the call.
  test('a createServerOnlyFn local alias called in a top-level block works in each environment, or is rejected at the call', async () => {
    await expectWorksOrRejectedAtCall({
      name: 'a local alias in a top-level block',
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
const so = createServerOnlyFn
export let read: () => unknown
{
  const fn = so(() => db.secret())
  read = () => fn()
}`,
      at: 'so(() =>',
      body: 'db.secret()',
      client: { expression: 'module.read()', expected: throwsError },
      ssr: (module) => expect(module.read()).toBe('secret'),
    })
  })

  // On main, the handler and its server-only imports ship to the client
  // (createServerFn alone), or the server fails to serve the module (another
  // factory).
  // The block row covers the "block" position of SPEC J4.6.
  describe.each([
    { importHead: 'createServerFn alone' as const, rows: placements },
    {
      importHead: 'another Start factory' as const,
      rows: placements.filter((placement) => placement.declarator),
    },
  ])('with $importHead imported', ({ importHead, rows }) => {
    test.each(rows)(
      'a createServerFn in $name does not ship its handler to the client',
      async ({ code, read }) => {
        await expectNoClientHandler(host, placementModule(importHead, code), {
          read: readOf(read),
        })
      },
    )
  })

  // Source: main's start-compiler/handleCreateServerFn.ts:232 (the other rejections of
  // this handler use `codeFrameError`); SPEC G5 ("errors about the user's
  // source carry a position/code frame"), J4.6.
  // On main, in a module with several server fns the user has to find the
  // misplaced one by hand.
  test.each(placements.filter((placement) => !placement.declarator))(
    'with another Start factory imported, a server fn in $name works or is rejected at the call',
    async ({ code, read }) => {
      await expectNoClientHandler(
        host,
        placementModule('another Start factory', code),
        { read: readOf(read) },
      )
    },
  )

  // Fix-agnostic: each environment independently rejects with a clear capture
  // diagnostic or preserves each make(id) closure.
  // SSR may keep the handler inline; successful clients must use safe RPCs.
  // On main, its handler and server-only imports ship to the client
  // (createServerFn alone), or the server fails to serve the module (another
  // factory).
  test.each(Object.keys(placementHeads) as Array<PlacementHead>)(
    'with %s imported, a nested server fn whose handler reads a local of its function is supported or rejected at the capture',
    async (importHead) => {
      const code = placementModule(importHead, capturingPlacement.code)
      const startCase = await newCase({
        'module.tsx': code,
        'db.server.ts': `export const db = {
  inner: (id: string) => \`inner:\${id}\`,
  top: () => 'top',
}
`,
      })
      // Each environment has its own valid outcome: SSR may keep the
      // closure inline even when client extraction is rejected.
      for (const environment of ['client', 'ssr'] as const) {
        const failure = await compileError(startCase, environment)
        if (failure !== undefined) {
          expectCompileError(failure, {
            source: code,
            at: 'db.inner(id)',
          })
          continue
        }
        if (environment === 'client') {
          expectNotLoaded(await startCase.loads(), [serverOnly])
          expect(await startCase.served()).not.toContain('MARK_INNER_HANDLER')
          expect(
            await inPage(
              startCase,
              `return Promise.all(['a', 'b'].map((id) => module.make(id)()))`,
            ),
          ).toEqual(['inner:a', 'inner:b'])
        } else {
          const ssr = await startCase.ssr()
          expect(
            await startCase.inRequest(() =>
              Promise.all(['a', 'b'].map((id) => ssr.make(id)())),
            ),
          ).toEqual(['inner:a', 'inner:b'])
        }
      }
    },
  )

  // On main, here both aliases compile as createClientOnlyFn: the server-only
  // implementation ships to the client and runs there, and throws on the
  // server.
  // Source: #8504 compiler.test.ts "resolves distinct re-export aliases without
  // conflating their source bindings" (red on main).
  test('distinct re-export aliases of two factories keep their own kind', async () => {
    const startCase = await newCase({
      'barrel.ts': `export { wrap as allowed } from './server'
export { wrap as denied } from './client'`,
      'server.ts': `export { createServerOnlyFn as wrap } from '@tanstack/react-start'`,
      'client.ts': `export { createClientOnlyFn as wrap } from '@tanstack/react-start'`,
      // The direct createServerOnlyFn call makes the module a candidate of
      // the compiler's text detection.
      'module.tsx': `import { createServerOnlyFn } from '@tanstack/react-start'
import { allowed, denied } from './barrel'
export const a = allowed(() => 'server-value')
export const b = denied(() => 'client-value')
export const c = createServerOnlyFn(() => 'direct')`,
    })
    const ssr = await startCase.ssr()
    expect({
      client: [
        await clientValue(startCase, 'module.a()'),
        await clientValue(startCase, 'module.b()'),
      ],
      ssr: [settle(ssr.a), settle(ssr.b)],
    }).toEqual({
      client: [throwsError, 'client-value'],
      ssr: ['server-value', throwsError],
    })
  })

  /**
   * Calls the exports of the shadowing module below with the stand-ins of
   * the shadowed factories (a page script, also run on the server).
   */
  const shadowingProbe = `const identity = (fn) => fn
const builder = {
  server: (server) => ({ client: (client) => [server(), client()] }),
  handler: (handler) => handler(),
}
const run = async (call) => fromSettled(await settle(call))
const fromSettled = (settled) => ('thrown' in settled ? { thrown: settled.thrown.message } : settled.value)
return {
  real: await settle(() => module.real()),
  wrap: await run(() => module.wrap(identity)()),
  receiver: await run(() => module.receiver({ createServerOnlyFn: identity })()),
  local: await run(() => module.local()()),
  iso: await run(() => module.iso(() => builder)),
  mw: await run(() => module.mw(() => ({ server: (fn) => fn() }))),
  make: await run(() => module.make(() => builder)),
}`

  // Same bug, every factory and both environments, next to a compiled
  // factory call. Source: #8504 start-compiler-factories.test.ts "parameters
  // and locals shadowing the factories are left alone next to a compiled
  // factory call" (red on main). (The provider row of the internal harness
  // has no public counterpart: the server is the SSR row.)
  test.each(['client', 'ssr'] as const)(
    '%s: parameters and locals shadowing the factories are left alone next to a compiled factory call',
    async (environment) => {
      const startCase = await newCase({
        'module.tsx': `import * as Start from '@tanstack/react-start'
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
}`,
      })
      const observed =
        environment === 'client'
          ? await inPage<Record<string, unknown>>(startCase, shadowingProbe)
          : await runOnServerModule<Record<string, unknown>>(
              await startCase.ssr(),
              shadowingProbe,
            )
      expect({
        ...observed,
        real: fromPage(observed.real as PageSettled),
      }).toEqual({
        real: environment === 'client' ? throwsError : 'real',
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
  // On main, the module fails to build.
  test.each(['createClientRpc', 'createSsrRpc', 'createServerRpc'])(
    'a user binding named %s does not collide with generated code',
    async (binding) => {
      const { results } = await callServerFns({
        'module.tsx': `${head}const ${binding} = (value: unknown) => value
export const used = ${binding}('user')
export const fn = createServerFn().handler(async () => 'from the server')`,
      })
      expect(results).toEqual(['from the server'])
    },
  )

  // On main, every call of a server fn named `opts` fails on the server.
  test('a server fn named opts runs on the server', async () => {
    const { results } = await callServerFns({
      'module.tsx': `${head}export const opts = createServerFn().handler(async () => 'from the server')`,
    })
    expect(results).toEqual(['from the server'])
  })

  /**
   * The names the compiler introduces into what it serves for a module with
   * a server fn: bindings of the served client and SSR code that neither the
   * source nor a control module (the same imports, nothing to compile, served
   * by the same pipeline) has; digits are ignored when comparing with the
   * control, so the dev pipeline's own numbered names never count. Read from
   * the served code, not assumed: the probe follows any compiler's
   * naming.
   */
  async function introducedNames() {
    const started = host
    const source = `${head}export const fn = createServerFn().handler(async () => 'from the server')`
    const control = `${head}export const fn = createServerFn\nexport const value = 'from the server'`
    const probe = await serveCase(started, { 'module.tsx': source })
    const plain = await serveCase(started, { 'module.tsx': control })
    const shape = (name: string) => name.replace(/\d+/g, '')
    // Vite's SSR transform turns `import { x } from 'm'` into reads of
    // `__vite_ssr_import_<n>__.x`: those `x` are the module's imported names
    const ssrNames = (code: string) => [
      ...bindingNames(code),
      ...[...code.matchAll(/__vite_ssr_import_\d+__\.([A-Za-z_$][\w$]*)/g)].map(
        (match) => match[1]!,
      ),
    ]
    const known = new Set(
      [
        ...bindingNames(source),
        ...bindingNames(plain.code.client),
        ...ssrNames(plain.code.ssr),
      ].map(shape),
    )
    // Vite's own SSR wrapper names (`__vite_ssr_import_meta__` for a module
    // using `import.meta`) are Vite's, whatever compiles the module
    return [
      ...new Set([
        ...bindingNames(probe.code.client),
        ...ssrNames(probe.code.ssr),
      ]),
    ].filter(
      (name) => !known.has(shape(name)) && !/^__vite_ssr_\w+__$/.test(name),
    )
  }

  // On main, a user binding or a server fn named like generated code breaks the
  // module or its server calls.
  test('no name the compiler introduces collides with a user binding or a server fn of that name', async () => {
    const names = await introducedNames()
    expect(names.length, 'names the compiler introduced').toBeGreaterThan(0)
    const failures: Array<string> = []
    for (const name of names) {
      for (const [kind, code] of [
        [
          'a user binding',
          `${head}const ${name} = (value: unknown) => value
export const used = ${name}('user')
export const fn = createServerFn().handler(async () => 'from the server')`,
        ],
        [
          'a server fn',
          `${head}export const ${name} = createServerFn().handler(async () => 'from the server')`,
        ],
      ] as const) {
        try {
          const { results } = await callServerFns({ 'module.tsx': code })
          if (JSON.stringify(results) !== JSON.stringify(['from the server'])) {
            failures.push(`${kind} named ${name}: ${JSON.stringify(results)}`)
          }
        } catch (error) {
          failures.push(
            `${kind} named ${name}: ${String((error as Error).message).split('\n')[0]}`,
          )
        }
      }
    }
    expect(failures).toEqual([])
  }, 30_000)

  // On main, the server fn cannot be called: calling it from the client throws
  // the server-only error, and calling it from server code does not run the
  // handler.
  // The outcome (SPEC J4.1, J4.2, G5): a call from either side returns what the
  // handler returns (how the call reaches it is free), or the module is
  // reported: a compile error, or in dev a warning, naming the file.
  test.each(['client', 'ssr'] as const)(
    '%s: a server fn whose handler is a createServerOnlyFn call returns the handler result, or is reported',
    async (environment) => {
      const code = `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
export const fn = createServerFn().handler(createServerOnlyFn(async () => db.x()))`
      const startCase = await newCase({ 'module.tsx': code })
      const mark = startCase.diagnostics().length
      for (const served of ['client', 'ssr'] as const) {
        const failure = await compileError(startCase, served)
        if (failure !== undefined) {
          expectCompileError(failure, { source: code, at: undefined })
          return
        }
      }
      // What compiling the module reported (not what calling it logs)
      const reported = findDiagnostics(startCase.diagnostics().slice(mark), {
        file: startCase.file(),
      })
      if (reported.length === 0) {
        if (environment === 'client') {
          expectNotLoaded(await startCase.loads(), [serverOnly])
        }
        const call = environment === 'client' ? callFromClient : callOnServer
        expect(await call(startCase, 'module.fn')).toBe('from the server')
      }
    },
  )

  // The server fn of a `'use client'` module (#7943) is pinned through a
  // real RSC app: react-start-rsc tests/integration/rsc-start-dev.test.ts
  // "a server function of a 'use client' module runs on the server" (no
  // directive-mechanism requirement here).
})

describe('dead-code elimination', () => {
  // On main, the module fails to load ("Export 'Settings' is not defined").
  test.each([
    `import type { Settings } from './settings'`,
    `import { type Settings } from './settings'`,
  ])(
    'client and SSR: a type-only import re-exported as `export { Settings }` is erased (%s)',
    async (importDeclaration) => {
      const startCase = await newCase({
        'module.tsx': `${head}${importDeclaration}
export { Settings }
export const fn = createServerFn().handler(async () => 1)`,
        'settings.ts': `export type Settings = { theme: string }\n`,
      })
      const loaded = async (run: () => Promise<unknown>) => {
        const settled = await settleAsync(run)
        return settled instanceof Thrown
          ? `fails to load: ${(settled.error as Error).message}`
          : 'loads'
      }
      expect({
        client: await loaded(() => startCase.client('return true')),
        ssr: await loaded(() => startCase.ssr()),
      }).toEqual({ client: 'loads', ssr: 'loads' })
    },
  )

  /**
   * A server-only module that fails loudly when a client module loads it
   * (the server may load it).
   */
  const throwingServerModule = `if (typeof window !== 'undefined') {
  throw new Error('server module loaded on the client')
}
export const db = { a: 1, users: (id?: string) => [id] }
export const TaggedError = (tag: string) => () =>
  class {
    tag = tag
  }
`

  /**
   * A case of `code` with the throwing server-only module: the client does
   * not load it, the page imports the module, and `expression` gives
   * `expected`.
   */
  async function expectClientWithoutServerModule(
    code: string,
    check: { expression: string; expected: unknown },
  ) {
    const startCase = await host.case({
      'module.tsx': code,
      'db.server.ts': throwingServerModule,
    })
    // (Import protection hands the page a mock of a `.server` module the
    // client imports: the module graph still holds the denied import.)
    expectNotLoaded(await startCase.loads(), [serverOnly])
    expect(await clientValue(startCase, check.expression)).toEqual(
      check.expected,
    )
  }

  // On main, the client (always in dev; in builds, the server module's
  // top-level code, see the Vite build pin) loads the server-only module.
  // Source: review; #8504 caller-dead-code.test.ts:563 covers server fns.
  test.each([
    {
      name: 'a class used by a server fn handler',
      code: `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
class Repo { get() { return db.users() } }
export const fn = createServerFn().handler(async () => new Repo().get())`,
      check: { expression: 'module.fn !== undefined', expected: true },
    },
    {
      // A class whose `extends` clause calls an imported factory, as error
      // classes of effect (`Data.TaggedError('NotFound')<...>`) and
      // better-result are written.
      // Source: fuzzing (two files of real apps).
      name: 'a class with a call in its extends clause used by a server fn handler',
      code: `import { createServerFn } from '@tanstack/react-start'
import { TaggedError } from './db.server'
class NotFound extends TaggedError('NotFound')<{ id: string }>() {}
export const fn = createServerFn().handler(async () => {
  throw new NotFound({ id: '1' })
})`,
      check: { expression: 'module.fn !== undefined', expected: true },
    },
    {
      name: 'an enum used by a server fn handler',
      code: `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
enum Kind { A = db.a }
export const fn = createServerFn().handler(async () => Kind.A)`,
      check: { expression: 'module.fn !== undefined', expected: true },
    },
    {
      name: 'a namespace used by a server fn handler',
      code: `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
namespace Repo { export const get = () => db.users() }
export const fn = createServerFn().handler(async () => Repo.get())`,
      check: { expression: 'module.fn !== undefined', expected: true },
    },
    // A namespace's own helpers only a server-only fn reads, as in
    // hikma-health's models (`const sha256 = … createHash(…)`).
    // Source: review round 4 fact-check (N1).
    {
      name: 'a namespace-local const only a createServerOnlyFn reads',
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
namespace Repo {
  const run = (s: string) => db.users(s)
  export const read = createServerOnlyFn(() => run('get'))
}
export const read = Repo.read`,
      check: { expression: 'module.read()', expected: throwsError },
    },
    {
      name: 'a namespace-local function only a createServerOnlyFn reads',
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
namespace Repo {
  function run(s: string) { return db.users(s) }
  export const read = createServerOnlyFn(() => run('get'))
}
export const read = Repo.read`,
      check: { expression: 'module.read()', expected: throwsError },
    },
    {
      name: 'a namespace-local class only a createServerOnlyFn reads',
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
namespace Repo {
  class Run { static get(s: string) { return db.users(s) } }
  export const read = createServerOnlyFn(() => Run.get('get'))
}
export const read = Repo.read`,
      check: { expression: 'module.read()', expected: throwsError },
    },
    // The same in the other nested statement lists.
    // Source: splicing gate (removal matrix).
    {
      name: 'a function in a switch case only a createServerOnlyFn reads',
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
export function pick(kind: string) {
  switch (kind) {
    case 'server':
      function run(s: string) { return db.users(s) }
      return createServerOnlyFn(() => run('get'))
    default:
      return 'client'
  }
}`,
      check: { expression: "module.pick('client')", expected: 'client' },
    },
    {
      name: 'a function in a class static block only a createServerOnlyFn reads',
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
export class Repo {
  static read: () => string
  static label = 'client'
  static {
    function run(s: string) { return db.users(s) }
    Repo.read = createServerOnlyFn(() => run('get'))
  }
}`,
      check: {
        expression: '[module.Repo.label, typeof module.Repo.read]',
        expected: ['client', 'function'],
      },
    },
    {
      name: 'an overloaded function used by a server fn handler',
      code: `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
function get(): string
function get(id?: string) { return db.users(id) }
export const fn = createServerFn().handler(async () => get())`,
      check: { expression: 'module.fn !== undefined', expected: true },
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
      check: { expression: 'module.mw !== undefined', expected: true },
    },
    {
      name: 'a class used by an isomorphic .server()',
      code: `import { createIsomorphicFn } from '@tanstack/react-start'
import { db } from './db.server'
class Repo { get() { return db.users() } }
export const iso = createIsomorphicFn().server(() => new Repo().get()).client(() => 'client')`,
      check: { expression: 'module.iso()', expected: 'client' },
    },
    {
      name: 'an overloaded function used by a createServerOnlyFn',
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
function get(): string
function get(id?: string) { return db.users(id) }
export const read = createServerOnlyFn(() => get())`,
      check: { expression: 'module.read()', expected: throwsError },
    },
  ])(
    'client: $name does not load its server-only import',
    async ({ code, check }) => {
      await expectClientWithoutServerModule(code, check)
    },
  )

  /**
   * A tsconfig.json of a case: TypeScript erased with or without
   * `verbatimModuleSyntax` (the app's own setting, which Vite's TypeScript
   * transform reads).
   */
  const tsconfig = (verbatimModuleSyntax: boolean) =>
    JSON.stringify({ compilerOptions: { verbatimModuleSyntax } })

  /** The server-only `./auth` module of the rows below. */
  const authFile = `export const auth = { get: () => 'auth', session: 'session' }\n`

  /**
   * What the client of a case of `code` loads when TypeScript is erased with
   * `verbatimModuleSyntax` (only `import type` declarations and `type`
   * specifiers are dropped).
   */
  async function verbatimLoads(code: string) {
    const startCase = await host.case({
      'tsconfig.json': tsconfig(true),
      'module.tsx': code,
      'auth.ts': authFile,
      'db.server.ts': dbFile,
    })
    return { startCase, loads: await startCase.loads() }
  }

  // With `verbatimModuleSyntax`, `import { type Db } from './db.server'`
  // keeps the module as a side-effect import (`import {} from`); the client
  // must still not load the server-only module for code it keeps that only
  // mentions the type.
  test('client: a server-only module imported only for a type specifier is not loaded with verbatimModuleSyntax', async () => {
    const { startCase, loads } =
      await verbatimLoads(`${head}import { type Db } from './db.server'
export function describeDb(db?: Db) {
  return db ? 'custom' : 'default'
}
export const fn = createServerFn().handler(async () => describeDb())`)
    expectNotLoaded(loads, ['./db.server'])
    expect(await inPage(startCase, 'return module.describeDb()')).toBe(
      'default',
    )
  })

  // On main, with `verbatimModuleSyntax` (TypeScript keeps value imports), the
  // client loads the server-only module and its top-level code ships (see the
  // Vite build pin).
  // Source: review.
  test('client: a server-only import last mentioned by a type alias is not loaded with verbatimModuleSyntax', async () => {
    const { loads } = await verbatimLoads(`${head}import { auth } from './auth'
type Session = typeof auth.session
export const fn = createServerFn().handler(async () => auth.get() as Session)`)
    expectNotLoaded(loads, ['./auth'])
  })

  /** A server fn whose validator is a module-level schema. */
  const schemaModule = (typeAlias: string) => `${head}import { z } from 'zod'
const themeValidator = z.union([z.literal('light'), z.literal('dark')])
${typeAlias}
export const setTheme = createServerFn({ method: 'POST' })
  .validator(themeValidator)
  .handler(async ({ data }) => data)`

  /**
   * A case of `code` whose TypeScript is erased without
   * `verbatimModuleSyntax` (imports nothing reads go too), with the
   * client-only chart module.
   */
  async function erasedCase(code: string) {
    return host.case({
      'tsconfig.json': tsconfig(false),
      'module.tsx': code,
      'chart.client.ts': `export const createChart = () => ({ draw: () => 'drawn' })\n`,
    })
  }

  // Source: fuzzing (an unmodified file of a real app).
  // On main, the schema and its library (or server-only modules) ship to the
  // client, which never runs them (see the build pin in
  // start-build-env-separation.test.ts).
  test('client: a validator schema that a type alias reads with typeof is not loaded', async () => {
    const startCase = await erasedCase(
      schemaModule('type Theme = z.infer<typeof themeValidator>'),
    )
    expectNotLoaded(await startCase.loads(), ['zod'])
  })

  /**
   * A client-only fn whose implementation reads a module-level chart that a
   * client-only module creates.
   */
  const clientOnlyChartModule = (
    typeAlias: string,
  ) => `import { createClientOnlyFn } from '@tanstack/react-start'
import { createChart } from './chart.client'
const chart = createChart()
${typeAlias}
export const draw = createClientOnlyFn(() => chart.draw())`

  // Source: fuzzing (an unmodified file of tanstack.com,
  // src/components/ThemeProvider.tsx).
  // On main, the server loads the client-only module and runs the initializer
  // (e.g. `window.matchMedia(...)`), which can throw during SSR.
  test('ssr: a declaration a client-only fn reads and a type alias reads with typeof is not loaded', async () => {
    const startCase = await erasedCase(
      clientOnlyChartModule('type Chart = typeof chart'),
    )
    expectNotLoaded(await startCase.serverLoads(), ['./chart.client'])
  })

  // On main, the server loads the client-only module and runs its top-level
  // code; a browser-only package that reads `window` when it loads crashes SSR
  // (Vite dev and build, Rsbuild build).
  // Source: review (dead-code investigation, server direction).
  test('ssr: a class only a client-only fn uses does not load its client-only import', async () => {
    const startCase =
      await erasedCase(`import { createClientOnlyFn } from '@tanstack/react-start'
import { createChart } from './chart.client'
class Chart { draw() { return createChart().draw() } }
export const draw = createClientOnlyFn(() => new Chart().draw())`)
    expectNotLoaded(await startCase.serverLoads(), ['./chart.client'])
    expect(await inPage(startCase, 'return module.draw()')).toBe('drawn')
  })
})
