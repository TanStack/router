/**
 * Known Start compiler bugs. Each test asserts correct behaviour for a bug on
 * main and is marked .fails; remove .fails when the bug is fixed.
 *
 * Every row runs through the public Start host (`./start-host`: Start's
 * Vite plugin of the built `@tanstack/react-start` in a real dev server, a
 * real Chromium page for client code, Start's real server entry and request
 * context): what a page that imports the module loads and gets, what the
 * server gets, and server fns called from the client (Start's RPC through
 * the dev server) and from server code (in a real request). Each case is a
 * directory of real files (the module and every module it imports).
 *
 * Elsewhere: the harness controls of the legacy internal harness
 * (outside-compiler-corpus/known-bugs-start-compiler-controls.test.ts); the
 * build-mode export cache rows, which only a production build exercises and
 * which a real build does not reproduce (regression tests now:
 * integration/start-compiler-build-export-cache.test.ts); the CommonJS
 * dependency pin (ruling Q7) and the Vue SFC pin (needs `@vitejs/plugin-vue`),
 * both in tests/pending-rulings/.
 */

import { describe, expect, test } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  Thrown,
  callFromClient,
  callOnServer,
  callServerFnThroughCallers,
  clientOnlyError,
  compileError,
  expectCompileError,
  expectNoClientHandler,
  fromPage,
  inPage,
  serveCase,
  serverFnUrls,
  serverOnlyError,
  serverOnlyModule,
  settle,
  settleAsync,
  useStartHost,
} from './regression-helpers'
import { runOnServerModule, shapeOf, withHostDefaults } from './page-values'
import {
  capturingPlacement,
  placementHeads,
  placementModule,
  placements,
} from './createServerFn/placements'
import type { PageSettled, StartCase, StartHost } from './regression-helpers'
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

/**
 * The dev-edit pins' app (its own host, which runs no cases: a dev edit
 * settles once the watcher reported every app file, and case directories
 * are not watched): its files are on disk before the dev server starts, and
 * a server route of the app calls the aliased server fn from server code.
 */
const editDirs = {
  reexportChain: 'src/edits/reexport-chain',
  aliasedEnvOnly: 'src/edits/aliased-env-only',
}
const editFiles = {
  [`${editDirs.reexportChain}/factory.ts`]: `export { createServerOnlyFn } from './factory-inner'\n`,
  [`${editDirs.reexportChain}/factory-inner.ts`]: `export { createServerOnlyFn } from '@tanstack/react-start'\n`,
  [`${editDirs.reexportChain}/module.tsx`]: `import { createServerOnlyFn } from './factory'
export const myFn = createServerOnlyFn(() => 'server-only-value')
`,
  [`${editDirs.aliasedEnvOnly}/factory.ts`]: `export { createServerOnlyFn as createServerFnHmrFactory } from '@tanstack/react-start'\n`,
  [`${editDirs.aliasedEnvOnly}/module.tsx`]: `import { createServerFn } from '@tanstack/react-start'
import { createServerFnHmrFactory } from './factory'

const serverOnlyImpl = createServerFnHmrFactory(() => 'server-only-value')

export const serverFn = createServerFn().handler(async () => {
  return serverOnlyImpl()
})
`,
  'src/routes/edit-probe.ts': `import { createFileRoute } from '@tanstack/react-router'
import { serverFn } from '../edits/aliased-env-only/module'
export const Route = createFileRoute('/edit-probe')({
  server: {
    handlers: {
      GET: async () => {
        try {
          return Response.json({ value: await serverFn() })
        } catch (error) {
          return Response.json({ thrown: { name: error.name, message: error.message } })
        }
      },
    },
  },
})
`,
}

const host = useStartHost(withHostDefaults())
const editHost = useStartHost(withHostDefaults({ files: editFiles }))

/** A case of `files` with the server-only module. */
async function newCase(files: Record<string, string>) {
  return (await host()).case({ 'db.server.ts': dbFile, ...files })
}

/**
 * Serves a case of `files` (every environment serves and evaluates its
 * module) and calls every server fn the module exports from the client, by
 * id through the dev server (the server runs each handler). Returns the case
 * and the results of the calls.
 */
async function callServerFns(files: Record<string, string>) {
  const served = await serveCase(await host(), {
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
 * calling its `read` export throws the server-only error.
 */
async function expectServerOnlyRead(code: string) {
  const startCase = await newCase({ 'module.tsx': code })
  expectNotLoaded(await startCase.loads(), [serverOnly])
  expect(await clientValue(startCase, 'module.read()')).toEqual(serverOnlyError)
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
      await host(),
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

  // Control for the pin below (same harness): with `createMiddleware`
  // imported too, the module is compiled.
  test('client builds compile a middleware builder finished in another module when the module imports createMiddleware', async () => {
    await expectClientCompiled(
      `import { createMiddleware } from '@tanstack/react-start'
import { mw } from './mw'
import { db } from './db.server'
export const logged = mw.server(async ({ next }) => { db.log(); return next() })`,
      {
        'mw.ts': `import { createMiddleware } from '@tanstack/react-start'
export const mw = createMiddleware({ type: 'function' })`,
      },
      { expression: 'module.logged.options', expected: { type: 'function' } },
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
        expression: 'module.logged.options',
        expected: { type: 'function' },
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
        expression: 'module.logged.options',
        expected: { type: 'function' },
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
      check: { expression: 'module.read()', expected: serverOnlyError },
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

  // Bug: a server fn builder read as a member of a namespace import
  // (`F.authed.handler`) is not resolved, unlike the same builder imported by
  // name.
  // Impact: the module is left untransformed and ships its handler and
  // server-only imports to the client.
  test.fails(
    'client builds compile a builder read from a namespace import',
    async () => {
      await expectServerFnThroughRpc(
        await newCase({
          'module.tsx': `import * as F from './fns'
import { db } from './db.server'
export const fn = F.authed.handler(async () => db.x())`,
          'fns.ts': `${head}export const authed = createServerFn({ method: 'POST' })`,
        }),
      )
    },
  )

  // Bug: a namespace of the Start package re-exported by a project module
  // (`export * as Start from '@tanstack/react-start'`) is not resolved.
  // Impact: `Start.createServerFn()` modules are left untransformed and ship
  // their handler and server-only imports to the client.
  test.fails(
    'client builds compile factories of a re-exported Start namespace',
    async () => {
      await expectServerFnThroughRpc(
        await newCase({
          'module.tsx': `import { Start } from './start'
import { db } from './db.server'
export const fn = Start.createServerFn().handler(async () => db.x())`,
          'start.ts': `export * as Start from '@tanstack/react-start'`,
        }),
      )
    },
  )

  // Bug: the builder of a `.handler()` chain is resolved through identifiers
  // and member expressions only, so a builder returned by a function call
  // (`authed().handler(...)`) is not traced. Builders returned by user
  // factories are a supported recognition form (SPEC J4.5), so the fix
  // supports it: the client calls an RPC and the server runs the handler
  // (a rejection is no fix; FIX-PLAN S16).
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

  // Bug: same family as above, for a builder the user passes through a
  // helper function (`applyStep(createServerFn().validator(schema))`): the
  // `.handler()` chain is not traced through the call, so the module is
  // left untransformed. Transparent wrappers are a supported form (SPEC
  // J4.5): the client gets neither the validator nor the handler, and the
  // server runs both (a rejection is no fix; FIX-PLAN S16).
  // Source: fuzzing (oracle mode, round 2: builders passed through user
  // helpers, 88 mutants).
  // Impact: the validator, the handler and what they import ship to the
  // client, and the client runs the handler instead of calling the server.
  test.fails(
    'client builds compile a server fn whose builder passes through a helper function',
    async () => {
      const served = await serveCase(await host(), {
        'module.tsx': `${head}import { schema } from './schema'
function applyStep<T>(builder: T) {
  return builder
}
export const fn = applyStep(
  createServerFn({ method: 'POST' }).validator(schema),
).handler(async ({ data }) => data)`,
        'schema.ts': `export const schema = (data: string) => \`\${data}!\`\n`,
      })
      expectNotLoaded(await served.loads(), ['./schema'])
      expect(await callFromClient(served, 'module.fn', 'data')).toBe('data!')
    },
  )

  // Bug: same family, for an isomorphic fn whose chain passes through a
  // helper function (`withBuilder(createIsomorphicFn().server(f)).client(g)`):
  // the inner `createIsomorphicFn().server(f)` is compiled on its own into a
  // plain function, so `.client(g)` is then called on that function. The
  // fix supports it (SPEC J4.5): each output runs its implementation (a
  // rejection is no fix; FIX-PLAN S16).
  // Source: fuzzing (oracle mode, round 2: builders passed through user
  // helpers).
  // Impact: the module throws when it loads ("withBuilder(...).client is not
  // a function"), on the client and on the server.
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
      expect({
        client: await clientValue(startCase, 'module.getEnv()'),
        ssr: settle((await startCase.ssr()).getEnv),
      }).toEqual({ client: 'client', ssr: 'server' })
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
  ])(
    'client: a createServerOnlyFn called through $name is compiled',
    async ({ code }) => {
      await expectServerOnlyRead(code)
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
    /** What a rejection names (a list: any one of its alternatives). */
    names: Array<string | Array<string>>
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
   * Each environment serving `shape.code` either rejects it with a clear
   * compile error at the call (`expectCompileError`: the line of `at`,
   * naming `names`, explaining its cause in its own words), or follows its
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
          names: shape.names,
          explains: true,
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

  // Bug: chain methods are only recognised when called through a static
  // member (`.handler(...)`, `.server(...)`), and a call whose result is
  // member-called (`createServerOnlyFn(...).bind(null)`) is taken for the
  // inner call of a method chain and never visited as a candidate itself:
  // each module below is left untransformed in every environment.
  // Source: corpus inputs U078-U081 (#8630 pins), restored by user ruling
  // 2026-10-20; SPEC J4.5 ("unrecognised shapes must not silently leak"),
  // J4.12. tsc against the real declarations accepts every row.
  // Impact: the server implementation and its server-only import ship to the
  // client, where the server fn, isomorphic fn or server-only fn runs it in
  // the browser.
  // Fix-agnostic: each environment either rejects the module with a clear
  // compile error at the call (naming the API and explaining why), or
  // follows its contract: the client neither loads the server-only module
  // nor holds the server code, and each environment runs what the runtime
  // contract promises.
  test.fails.each<CallShape>([
    {
      name: 'a server fn handler called through a computed member',
      code: `${head}import { db } from './db.server'
export const fn = createServerFn()['handler'](async () => db.x())`,
      at: `createServerFn()['handler']`,
      names: [['createServerFn', 'handler']],
      body: 'db.x()',
      client: { expression: 'typeof module.fn.url', expected: 'string' },
      serverFn: 'module.fn',
    },
    {
      name: 'a request middleware server implementation called through a computed member',
      code: `import { createMiddleware } from '@tanstack/react-start'
import { db } from './db.server'
export const mw = createMiddleware()['server'](async ({ next }) => {
  db.x()
  return next()
})`,
      at: `createMiddleware()['server']`,
      names: [['createMiddleware', 'server']],
      body: 'db.x()',
      client: { expression: 'typeof module.mw', expected: 'object' },
      ssr: async (module, calls) => {
        expect(await module.mw.options.server({ next: () => 'next' })).toBe(
          'next',
        )
        expect(calls).toEqual(['x'])
      },
    },
    {
      name: 'an isomorphic server implementation called through a computed member',
      code: `import { createIsomorphicFn } from '@tanstack/react-start'
import { db } from './db.server'
export const fn = createIsomorphicFn()['server'](() => db.x()).client(() => 'client')`,
      at: `createIsomorphicFn()['server']`,
      names: [['createIsomorphicFn', 'server']],
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
      names: [['createServerOnlyFn', 'bind']],
      body: 'db.secret()',
      client: { expression: 'module.read()', expected: serverOnlyError },
      ssr: (module) => expect(module.read()).toBe('secret'),
    },
  ])(
    '$name: the client holds no server code, or the module is rejected at the call',
    async (shape) => {
      await expectWorksOrRejectedAtCall(shape)
    },
  )

  // Bug: env-only factories nested in other code are found by the factory's
  // exported name (`isNestedDirectCallCandidate`), so a local alias of
  // createServerOnlyFn called in a top-level block is neither compiled nor
  // rejected.
  // Source: the KB row "a local alias in a top-level block" deleted in
  // a945fe4563, restored (coordinator 2026-10-20: the J4.6 "block" position
  // of the user ruling "restore the two borderline corpus removals").
  // Impact: the implementation and its server-only import ship to the
  // client, where calling the server-only fn runs it instead of throwing.
  // Fix-agnostic: compiled per its contract (the client throws the
  // server-only error and loads nothing server-only, SSR runs it) or
  // rejected with a clear compile error at the call.
  test.fails(
    'a createServerOnlyFn local alias called in a top-level block works in each environment, or is rejected at the call',
    async () => {
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
        names: [['createServerOnlyFn', 'so']],
        body: 'db.secret()',
        client: { expression: 'module.read()', expected: serverOnlyError },
        ssr: (module) => expect(module.read()).toBe('secret'),
      })
    },
  )

  // Bug: when createServerFn is the only factory imported, the compiler only
  // visits top-level variable declarations, so a server fn anywhere else is
  // neither extracted nor rejected. With another Start factory imported, a
  // server fn initializing a declarator below the top level (in a function,
  // a block or a switch case) is extracted on the client, but the server
  // has no handler for it. Rejecting a placement with a clear compile error
  // at the call is a valid fix here; supporting it is the goal
  // (createServerFn/declaration-sites.test.ts "supports a server fn in
  // ..."), and a supported one must reach its handler through an RPC.
  // Impact: the handler and its server-only imports ship to the client
  // (createServerFn alone), or the server fails to serve the module
  // (another factory).
  // Source: the block row restores corpus inputs U082/U086 (SPEC J4.6
  // "block"; user ruling 2026-10-20).
  describe.each([
    { importHead: 'createServerFn alone' as const, rows: placements },
    {
      importHead: 'another Start factory' as const,
      rows: placements.filter((placement) => placement.declarator),
    },
  ])('with $importHead imported', ({ importHead, rows }) => {
    test.fails.each(rows)(
      'a createServerFn in $name does not ship its handler to the client',
      async ({ code, read }) => {
        await expectNoClientHandler(
          await host(),
          placementModule(importHead, code),
          { read: readOf(read) },
        )
      },
    )
  })

  // Bug: next to another Start factory, a server fn that is not assigned to
  // a variable (an object property, a class field, a default export, an
  // assignment, a call argument, a JSX attribute, a conditional, a
  // destructuring) is rejected with a plain `Error` ("createServerFn must
  // be assigned to a variable!") that carries no position: the user is told
  // the file (by the bundler) but not where in it.
  // Source: start-compiler/handleCreateServerFn.ts:232 (the other rejections
  // of this handler use `codeFrameError`); SPEC G5 ("errors about the
  // user's source carry a position/code frame"), J4.6.
  // Impact: in a module with several server fns the user has to find the
  // misplaced one by hand. Loosened twin (rejection naming createServerFn
  // only): declaration-sites.test.ts "next to another Start factory, ...".
  // (A declarator below the top level, e.g. in a top-level block, is
  // extracted instead: pinned above.)
  test.fails.each(
    placements.filter(
      (placement) => !placement.nested && !placement.declarator,
    ),
  )(
    'with another Start factory imported, a server fn in $name works or is rejected at the call',
    async ({ code, read }) => {
      await expectNoClientHandler(
        await host(),
        placementModule('another Start factory', code),
        { read: readOf(read) },
      )
    },
  )

  // Bug: same cause as above; a server fn nested in a function whose
  // handler reads a local of that function (here `id`) cannot run on its own
  // on the server, and is neither supported nor rejected.
  // Fix-agnostic (SPEC J4.6, §5.13): each environment independently rejects
  // with a clear capture diagnostic or preserves each make(id) closure.
  // SSR may keep the handler inline; successful clients must use safe RPCs.
  // Impact: its handler and server-only imports ship to the client
  // (createServerFn alone), or the server fails to serve the module
  // (another factory).
  // Source: user ruling D13.
  test.fails.each(Object.keys(placementHeads) as Array<PlacementHead>)(
    'with %s imported, a nested server fn whose handler reads a local of its function is supported or rejected naming the capture',
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
            names: ['createServerFn'],
            explains: { mentions: ['id'] },
          })
          continue
        }
        if (environment === 'client') {
          expectNotLoaded(await startCase.loads(), [serverOnly])
          expect(await startCase.served()).not.toContain('db.inner(')
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
        client: [serverOnlyError, 'client-value'],
        ssr: ['server-value', clientOnlyError],
      })
    },
  )

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
  test.fails.each(['client', 'ssr'] as const)(
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
        real: environment === 'client' ? serverOnlyError : 'real',
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
  test.fails.each(['createClientRpc', 'createSsrRpc', 'createServerRpc'])(
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

  // Bug: the server calls each server fn from a generated wrapper,
  // `opts => fn.__executeServer(opts)`, whose `opts` parameter shadows a
  // server fn named `opts`.
  // Impact: every call of a server fn named `opts` fails on the server.
  test.fails('a server fn named opts runs on the server', async () => {
    const { results } = await callServerFns({
      'module.tsx': `${head}export const opts = createServerFn().handler(async () => 'from the server')`,
    })
    expect(results).toEqual(['from the server'])
  })

  // Bug: when the handler passed to `.handler()` is a `createServerOnlyFn()`
  // call, the inner call is compiled first and the caller is never rewritten
  // into an RPC.
  // Impact: the server fn cannot be called: calling it from the client
  // throws the server-only error, and calling it from server code does not
  // run the handler.
  // The outcome (DECISIONS 2026-10-21, R8): a call from either side returns
  // what the handler returns; how the call reaches it is free.
  test.fails.each(['client', 'ssr'] as const)(
    '%s: a server fn whose handler is a createServerOnlyFn call returns the handler result',
    async (environment) => {
      const startCase = await newCase({
        'module.tsx': `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
export const fn = createServerFn().handler(createServerOnlyFn(async () => db.x()))`,
      })
      const call = environment === 'client' ? callFromClient : callOnServer
      expect(await call(startCase, 'module.fn')).toBe('from the server')
    },
  )

  // The server fn of a `'use client'` module (#7943) is pinned through a
  // real RSC app: react-start-rsc tests/integration/rsc-start-dev.test.ts
  // "a server function of a 'use client' module runs on the server" (FIX-PLAN
  // S21: no directive-mechanism requirement here).
})

describe('dev edits', () => {
  /**
   * Edits app files through the dev server's watcher (written before the
   * server started, so this is a change of existing files), and evaluates
   * `module.tsx` of `dir` in the SSR environment.
   */
  async function editAndImport(
    started: StartHost,
    dir: string,
    files: Record<string, string>,
  ) {
    await started.edit(
      Object.fromEntries(
        Object.entries(files).map(([file, code]) => [`${dir}/${file}`, code]),
      ),
    )
    return started.host.importServer(`/${dir}/module.tsx`, 'ssr')
  }

  // Bug: after a dev edit of the module a re-export chain of an env-only
  // factory ends in (here it now re-exports createClientOnlyFn under the
  // createServerOnlyFn name), the module importing the factory, unchanged,
  // keeps the code compiled for the old factory: its compiled output imports
  // nothing of the chain, so no module graph links it to the edited module,
  // and the compiler's own invalidation does not reach it.
  // Impact: in dev, the importer keeps the old behaviour (here it runs a
  // function that should now be client-only) until it is edited itself or
  // the server restarts.
  // Source: rerouted compiler.test.ts "invalidateModule clears cached module
  // resolution state" (green through the internal compiler, which the test
  // invalidated and recompiled itself); reproduced through a real Vite dev
  // edit (workstream B2). Unbundled client edits of a server fn factory are
  // covered by integration/start-compiler-dev-server.test.ts.
  test.fails(
    'a dev edit of a module a re-export chain ends in recompiles its importers',
    async () => {
      const started = await editHost()
      const dir = editDirs.reexportChain
      const before = await started.host.importServer(`/${dir}/module.tsx`)
      expect(settle(before.myFn)).toBe('server-only-value')

      const after = await editAndImport(started, dir, {
        'factory-inner.ts': `export { createClientOnlyFn as createServerOnlyFn } from '@tanstack/react-start'\n`,
      })
      expect(settle(after.myFn)).toEqual(clientOnlyError)
    },
    30_000,
  )

  // Control for the pin above (same harness, and the concept of
  // compiler.test.ts "recompiles aliased env-only calls in a provider whose
  // source only mentions createServerFn", rerouted through a real dev edit):
  // a server fn module whose source only mentions createServerFn calls an
  // env-only factory the factory module renames; after the factory module
  // is edited into another kind, the server fn runs the new code.
  test('a dev edit of an aliased env-only factory recompiles the server fn that calls it', async () => {
    const started = await editHost()
    const dir = editDirs.aliasedEnvOnly
    // The server route of the app calls the server fn from server code.
    const callServerFn = async () =>
      fromPage(
        (await (
          await fetch(new URL('/edit-probe', started.host.dev.url))
        ).json()) as PageSettled,
      )

    expect(await callServerFn()).toBe('server-only-value')

    await started.edit({
      [`${dir}/factory.ts`]: `export { createClientOnlyFn as createServerFnHmrFactory } from '@tanstack/react-start'\n`,
    })
    expect(await callServerFn()).toEqual(clientOnlyError)
  }, 30_000)
})

describe('dead-code elimination', () => {
  /**
   * Renders `Probe` of the case on the server (the SSR environment's React
   * renders it to HTML), then hydrates that HTML in the page with the
   * client's `Probe`: the errors React and the page report.
   */
  async function hydrationErrors(startCase: StartCase) {
    const { render } = await startCase.ssr('render.server.tsx')
    const html = render() as string
    const run = await startCase.client<Array<string>>(
      `const { hydrate } = await load('hydrate.client.tsx')
return hydrate(${JSON.stringify(html)})`,
    )
    return [...run.result, ...run.errors]
  }

  /** The render and hydrate files of a case whose `Probe` uses `useField`. */
  const hookProbeFiles = {
    'probe.tsx': `import { useField } from './module'
export function Probe() {
  const [, inputId] = useField()
  return <span>{inputId}</span>
}
`,
    'render.server.tsx': `import { renderToString } from 'react-dom/server'
import { Probe } from './probe'
export const render = () => renderToString(<Probe />)
`,
    'hydrate.client.tsx': `import { hydrateRoot } from 'react-dom/client'
import { Probe } from './probe'
export async function hydrate(html: string) {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.append(container)
  const errors: Array<string> = []
  const root = hydrateRoot(container, <Probe />, {
    onRecoverableError: (error) => {
      errors.push(String(error))
    },
  })
  await new Promise((resolve) => setTimeout(resolve, 100))
  root.unmount()
  container.remove()
  return errors
}
`,
  }

  // Bug: removing the other environment's implementation of an env function
  // declared in a hook leaves the locals only that implementation read
  // unreferenced, and dead-code elimination (babel-dead-code-elimination,
  // which removes newly unreferenced bindings) deletes their declarators,
  // hook calls included.
  // Impact: the hooks after it run in a different order on the server and
  // the client (`useId` mismatches, hydration errors).
  // Observed: the server's HTML of a component using the hook hydrates in
  // the page without a mismatch (formerly: the hook's `useId` calls counted
  // through a stubbed React).
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
    async ({ code }) => {
      const startCase = await newCase({ 'module.tsx': code, ...hookProbeFiles })
      expect(await hydrationErrors(startCase)).toEqual([])
    },
  )

  const pragmaModule = `/** @jsxRuntime classic */
/** @jsx h */
import { h } from './jsx'
import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => h('p', null))
export const Card = () => <div />`
  const jsxFile = `export const h = (type: string) => \`h(\${type})\`\n`

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
      const startCase = await newCase({
        'module.tsx': pragmaModule,
        'jsx.ts': jsxFile,
      })
      expect(await clientValue(startCase, 'module.Card()')).toBe('h(div)')
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

  /** Renders `Hero` of the case on the server (its HTML, or what threw). */
  async function renderHero(code: string) {
    const startCase = await newCase({
      'module.tsx': code,
      'render.server.ts': `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Hero } from './module'
export const render = () => renderToString(createElement(Hero))
`,
    })
    const { render } = await startCase.ssr('render.server.ts')
    const rendered = settle(render)
    return rendered instanceof Thrown
      ? `the render throws: ${(rendered.error as Error).message}`
      : (rendered as string)
  }

  // Control for the pin below (same harness): code the SSR output keeps
  // still reads `React`.
  test('ssr: a module with a classic JSX runtime pragma that reads React elsewhere stays valid', async () => {
    expect(await renderHero(classicRuntimeModule('React.useId()'))).toContain(
      '<div>',
    )
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
      expect(await renderHero(classicRuntimeModule(''))).toContain('<div>')
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
    const startCase = await (
      await host()
    ).case({
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

  // Control for the pin below (same harness): a plain function only the
  // server code uses leaves with its server-only import.
  test('client: a function only server code uses does not load its server-only import', async () => {
    await expectClientWithoutServerModule(
      `${head}import { db } from './db.server'
function find() { return db.users() }
export const fn = createServerFn().handler(async () => find())`,
      { expression: 'module.fn !== undefined', expected: true },
    )
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
      check: { expression: 'module.fn !== undefined', expected: true },
    },
    {
      // A class whose `extends` clause calls an imported factory, as error
      // classes of effect (`Data.TaggedError('NotFound')<...>`) and
      // better-result are written.
      // Source: fuzzing (oracle mode, round 2; two corpus files).
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
      check: { expression: 'module.read()', expected: serverOnlyError },
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
    const startCase = await (
      await host()
    ).case({
      'tsconfig.json': tsconfig(true),
      'module.tsx': code,
      'auth.ts': authFile,
      'db.server.ts': dbFile,
    })
    return { startCase, loads: await startCase.loads() }
  }

  // Control for the pin below (same harness): a server-only import that only
  // the handler read leaves the client.
  test('client: a server-only import only the handler reads is not loaded with verbatimModuleSyntax', async () => {
    const { loads } = await verbatimLoads(`${head}import { auth } from './auth'
export const fn = createServerFn().handler(async () => auth.get())`)
    expectNotLoaded(loads, ['./auth'])
  })

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
      const { loads } =
        await verbatimLoads(`${head}import { auth } from './auth'
type Session = typeof auth.session
export const fn = createServerFn().handler(async () => auth.get() as Session)`)
      expectNotLoaded(loads, ['./auth'])
    },
  )

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
    return (await host()).case({
      'tsconfig.json': tsconfig(false),
      'module.tsx': code,
      'chart.client.ts': `export const createChart = () => ({ draw: () => 'drawn' })\n`,
    })
  }

  // Control for the pin below (same harness): a schema only the validator
  // reads leaves the client with its import.
  test('client: a validator schema only the validator reads is not loaded', async () => {
    const startCase = await erasedCase(schemaModule(''))
    expectNotLoaded(await startCase.loads(), ['zod'])
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
      const startCase = await erasedCase(
        schemaModule('type Theme = z.infer<typeof themeValidator>'),
      )
      expectNotLoaded(await startCase.loads(), ['zod'])
    },
  )

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

  // Control for the pin below (same harness): a declaration only the
  // client-only implementation reads leaves the SSR output with its import.
  test('ssr: a declaration only a client-only fn reads is not loaded', async () => {
    const startCase = await erasedCase(clientOnlyChartModule(''))
    expectNotLoaded(await startCase.serverLoads(), ['./chart.client'])
  })

  // Bug: same root cause as the pin above (upstream
  // babel-dead-code-elimination 1.0.12 counts a `typeof` type query as a
  // reference; no workaround here), mirrored on the server: a module-level
  // declaration that only a client-only implementation and a `typeof` type
  // query read stays in the SSR output, with its initializer and imports.
  // Source: fuzzing (oracle mode, round 2, V1 mirror; an unmodified file of
  // tanstack.com, src/components/ThemeProvider.tsx).
  // Impact: the server loads the client-only module and runs the
  // initializer (e.g. `window.matchMedia(...)`), which can throw during
  // SSR.
  test.fails(
    'ssr: a declaration a client-only fn reads and a type alias reads with typeof is not loaded',
    async () => {
      const startCase = await erasedCase(
        clientOnlyChartModule('type Chart = typeof chart'),
      )
      expectNotLoaded(await startCase.serverLoads(), ['./chart.client'])
    },
  )
})
