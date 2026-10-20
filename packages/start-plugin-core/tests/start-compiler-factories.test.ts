import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import { envRestrictionError } from '@tanstack/compiler-test-utils/diagnostics'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  callProvider,
  callServerFnThroughCallers,
  callerRpcId,
  clientOnlyError,
  compileAll,
  compileCode,
  compileFor,
  compileServer,
  createStartCompiler,
  evaluateModule,
  expectCompileError,
  moduleLoads,
  serverOnlyError,
  settle,
  startClientCore,
} from './regression-helpers'
import type { ModuleStub, Output } from './regression-helpers'

// Each output keeps the implementation of its own environment (and only the
// imports that implementation reads) and replaces the other one with a stub
// that throws. The compiler only rewrites calls it can resolve to a Start
// factory, through any chain of project modules. "Only its imports" is
// observed as loading (`moduleLoads`): the client output never loads a
// server-only module, the SSR output never a client-only one.

/** The client output loads none of `forbidden` (default: `./db.server`). */
async function expectClientFree(
  client: string,
  forbidden = ['./db.server'],
  options: Parameters<typeof moduleLoads>[1] = {},
) {
  expectNotLoaded(await moduleLoads(client, options), forbidden)
}

/** The SSR output does not load the client-only module. */
async function expectSsrFree(ssr: string) {
  expectNotLoaded(await moduleLoads(ssr, { env: 'server' }), ['./chart.client'])
}

const head = `import { createClientOnlyFn, createIsomorphicFn, createServerOnlyFn } from '@tanstack/react-start'\n`
type Wrap = (expression: string) => string

describe('environment-specific functions', () => {
  // Source: Waku vite-plugin-allow-server.test.ts "keeps only allowServer
  // dependencies and removes allowServer imports", "supports allowServer
  // aliasing and export specifiers". Dev and build compile alike (audit E1
  // missing coverage 4).
  test.each(['build', 'dev'] as const)(
    '%s: each output keeps the implementation of its environment and only its dependencies',
    async (mode) => {
      const compiled = await compileAll(
        `import { createServerOnlyFn, createClientOnlyFn as clientOnly } from '@tanstack/react-start'
import { draw } from './chart.client'
import { query } from './db.server'
const shared = 1
const readDb = () => query(shared)
const serverValue = createServerOnlyFn(readDb)
export const clientValue = clientOnly(() => draw(shared))
export { serverValue as exposed }`,
        { mode },
      )
      const stubs = {
        './chart.client': `export const draw = (x) => 'draw:' + x`,
        './db.server': `export const query = (x) => 'query:' + x`,
      }
      await expectClientFree(compiled.client)
      const client = await evaluateModule(compiled.client, stubs)
      expect([client.clientValue(), settle(client.exposed)]).toEqual([
        'draw:1',
        serverOnlyError,
      ])
      await expectSsrFree(compiled.ssr)
      const ssr = await evaluateModule(compiled.ssr, stubs)
      expect([settle(ssr.clientValue), ssr.exposed()]).toEqual([
        clientOnlyError,
        'query:1',
      ])
    },
  )

  // Source: Waku vite-plugin-allow-server.test.ts "handles default allowServer
  // export", "stubs default exports while preserving allowServer dependencies"
  test.each([
    {
      code: `import { db } from './db.server'
export default createServerOnlyFn(() => db.x())`,
      client: serverOnlyError,
      server: 'db',
    },
    {
      code: `import { chart } from './chart.client'
export default createClientOnlyFn(() => chart())`,
      client: 'chart',
      server: clientOnlyError,
    },
    {
      code: `import { db } from './db.server'
import { chart } from './chart.client'
export default createIsomorphicFn().server(() => db.x()).client(() => chart())`,
      client: 'chart',
      server: 'db',
    },
  ])('a default-exported function: $code', async ({ code, client, server }) => {
    const compiled = await compileAll(`${head}${code}`)
    await expectClientFree(compiled.client)
    await expectSsrFree(compiled.ssr)
    const stubs = {
      './db.server': `export const db = { x: () => 'db' }`,
      './chart.client': `export const chart = () => 'chart'`,
    }
    expect(
      settle((await evaluateModule(compiled.client, stubs)).default),
    ).toEqual(client)
    expect(settle((await evaluateModule(compiled.ssr, stubs)).default)).toEqual(
      server,
    )
  })

  // Source: Waku vite-plugin-allow-server.test.ts "handles default allowServer
  // export" (middleware variant)
  test('the client strips the server implementation of a default-exported middleware', async () => {
    const client = await compileCode(
      'client',
      `import { createMiddleware } from '@tanstack/react-start'
import { db } from './db.server'
export default createMiddleware().server(async ({ next }) => {
  db.log()
  return next()
})`,
    )
    expect(await getModuleErrors(client!)).toEqual([])
    await expectClientFree(client!)
    // The middleware records no server implementation.
    expect((await evaluateModule(client!)).default.options).toEqual({
      type: 'request',
    })
  })

  describe('a middleware chain with a wrapped link', () => {
    // A `.ts` module, so that `<any>x` is a type assertion.
    const id = '/test/src/module.ts'
    const serverLink = `.server(async ({ next }) => next({ context: db.read('SERVER_SECRET') }))`
    const clientLink = `.client(async ({ next }) => next({ sendContext: 'client' }))`
    const validatorLink = `.validator((data) => check(data, 'VALIDATOR_SECRET'))`
    const middlewareModule = (chain: string) =>
      [
        `import { createMiddleware } from '@tanstack/react-start'`,
        `import { db } from './db.server'`,
        chain.includes('check(') && `import { check } from './check.server'`,
        `export const mw = ${chain}`,
      ]
        .filter(Boolean)
        .join('\n')

    /**
     * The links of the middleware an output keeps (Start's createMiddleware
     * records each in its options), each with the result of its
     * implementation.
     */
    async function runLinks(output: Output, code: string) {
      // The server output leaves a module without env-only code untouched.
      const compiled = (await compileCode(output, code, { id })) ?? code
      expect(await getModuleErrors(compiled, 'module.ts'), output).toEqual([])
      const { code: javascript } = await transformWithOxc(compiled, 'module.ts')
      const { mw } = await evaluateModule(javascript, {
        './db.server': `export const db = { read: (key) => 'db:' + key }`,
        './check.server': `export const check = (data, key) => data + ':' + key`,
      })
      const links: Record<string, unknown> = {}
      for (const method of ['middleware', 'validator', 'client', 'server']) {
        const impl = mw.options[method]
        if (impl !== undefined) {
          links[method] =
            method === 'middleware'
              ? impl
              : await impl(
                  method === 'validator'
                    ? 'data'
                    : { next: (opts: unknown) => opts },
                )
        }
      }
      return { compiled, links }
    }

    // Parentheses and each TypeScript wrapper are different AST nodes.
    const wrappers = [
      { name: 'parentheses', wrap: (x: string) => `(${x})` },
      { name: 'as any', wrap: (x: string) => `(${x} as any)` },
      {
        name: 'as unknown as T',
        wrap: (x: string) => `(${x} as unknown as Middleware)`,
      },
      { name: 'satisfies', wrap: (x: string) => `(${x} satisfies unknown)` },
    ]
    const serverModules = ['./db.server', './check.server']
    const serverResult = { context: 'db:SERVER_SECRET' }
    const clientResult = { sendContext: 'client' }

    // Source: #8504 start-compiler-factories.test.ts (a regression of the
    // Yuku migration found by differential fuzzing; main builds these).
    test.each(
      [
        {
          end: '.client()',
          chain: (wrap: Wrap) =>
            `${wrap(`createMiddleware({ type: 'function' })${clientLink}`)}${serverLink}`,
          clientLinks: { client: clientResult },
          ssrLinks: { client: clientResult, server: serverResult },
        },
        {
          end: '.client(), and the whole chain',
          chain: (wrap: Wrap) =>
            wrap(
              `${wrap(`createMiddleware({ type: 'function' })${clientLink}`)}${serverLink}`,
            ),
          clientLinks: { client: clientResult },
          ssrLinks: { client: clientResult, server: serverResult },
        },
        {
          // Only parentheses: a validator link wrapped in a TypeScript
          // wrapper is pinned below.
          end: '.middleware().validator()',
          wrappers: [wrappers[0]!],
          chain: (wrap: Wrap) =>
            `${wrap(`createMiddleware({ type: 'function' }).middleware([])${validatorLink}`)}${clientLink}${serverLink}`,
          clientLinks: { middleware: [], client: clientResult },
          ssrLinks: {
            middleware: [],
            validator: 'data:VALIDATOR_SECRET',
            client: clientResult,
            server: serverResult,
          },
        },
        {
          // The wrapped part ends in `.client()`; `.server()` follows it.
          // Source: lost-cases-campaign W-2 (fuzz M4 link:2, a crash of the
          // Yuku migration; main builds it).
          end: '.middleware().validator().client(), before .server()',
          chain: (wrap: Wrap) =>
            `${wrap(`createMiddleware({ type: 'function' }).middleware([])${validatorLink}${clientLink}`)}${serverLink}`,
          clientLinks: { middleware: [], client: clientResult },
          ssrLinks: {
            middleware: [],
            validator: 'data:VALIDATOR_SECRET',
            client: clientResult,
            server: serverResult,
          },
        },
      ].flatMap(({ wrappers: rowWrappers = wrappers, ...chain }) =>
        rowWrappers.map((wrapper) => ({ ...chain, ...wrapper })),
      ),
    )(
      'the client strips the server implementation when $name wraps the chain up to $end',
      async ({ chain, wrap, clientLinks, ssrLinks }) => {
        const code = middlewareModule(chain(wrap))
        const client = await runLinks('client', code)
        await expectClientFree(client.compiled, serverModules, { id })
        expect(client.compiled).not.toMatch(/SERVER_SECRET|VALIDATOR_SECRET/)
        expect(client.links).toEqual(clientLinks)
        expect((await runLinks('ssr', code)).links).toEqual(ssrLinks)
      },
    )

    // The validator only runs on the server.
    // Bug: a `.validator()` link wrapped in `satisfies` / `as` is not
    // recognised as a link of the middleware chain on the client, so it is
    // not stripped.
    // Impact: the validator and its server-only imports ship to the client.
    // Source: #8504 start-compiler-factories.test.ts "the client strips a
    // validator link wrapped in $name" (Vite and Rsbuild builds; red on main).
    test.fails.each(
      ['', '.middleware([])'].flatMap((middleware) =>
        wrappers.slice(1).map((wrapper) => ({ ...wrapper, middleware })),
      ),
    )(
      'the client strips a validator link$middleware wrapped in $name',
      async ({ wrap, middleware }) => {
        const code = middlewareModule(
          `${wrap(`createMiddleware({ type: 'function' })${middleware}${validatorLink}`)}${clientLink}${serverLink}`,
        )
        const kept = middleware ? { middleware: [] } : {}
        const client = await runLinks('client', code)
        await expectClientFree(client.compiled, serverModules, { id })
        expect(client.compiled).not.toMatch(/SERVER_SECRET|VALIDATOR_SECRET/)
        expect(client.links).toEqual({ ...kept, client: clientResult })
        expect((await runLinks('ssr', code)).links).toEqual({
          ...kept,
          validator: 'data:VALIDATOR_SECRET',
          client: clientResult,
          server: serverResult,
        })
      },
    )

    /** A module whose middleware chain continues a builder variable. */
    const builderVariableModule = (base: string, rest: string) =>
      [
        `import { createMiddleware } from '@tanstack/react-start'`,
        `import { db } from './db.server'`,
        base.includes('check(') && `import { check } from './check.server'`,
        `const base = createMiddleware({ type: 'function' })${base}`,
        `export const mw = base${rest}`,
      ]
        .filter(Boolean)
        .join('\n')

    // Control for the pin below (same harness): the `.server()` link of a
    // builder stored in a variable is stripped on the client.
    test('the client strips a .server() link of a builder stored in a variable', async () => {
      const code = builderVariableModule(clientLink, serverLink)
      const client = await runLinks('client', code)
      await expectClientFree(client.compiled, serverModules, { id })
      expect(client.compiled).not.toMatch(/SERVER_SECRET/)
      expect(client.links).toEqual({ client: clientResult })
      expect((await runLinks('ssr', code)).links).toEqual({
        client: clientResult,
        server: serverResult,
      })
    })

    // Bug: a `.validator()` link of a middleware builder stored in a variable
    // is not stripped on the client: the chain walk from `base.server(...)`
    // stops at the identifier, so the variable's declaration keeps its
    // validator (its `.server()` link is stripped, the control above).
    // Source: start-compiler/compiler.ts:1296-1330 (the chain walk stops at
    // an identifier), start-compiler/handleCreateMiddleware.ts:21-32;
    // fuzzing (oracle mode, N4).
    // Impact: the validator and its server-only imports ship to the client.
    test.fails(
      'the client strips a validator link of a builder stored in a variable',
      async () => {
        const code = builderVariableModule(validatorLink, serverLink)
        const client = await runLinks('client', code)
        await expectClientFree(client.compiled, serverModules, { id })
        expect(client.compiled).not.toMatch(/SERVER_SECRET|VALIDATOR_SECRET/)
        expect(client.links).toEqual({})
        expect((await runLinks('ssr', code)).links).toEqual({
          validator: 'data:VALIDATOR_SECRET',
          server: serverResult,
        })
      },
    )
  })

  /**
   * Compiles `code` (which exports `getEnv`) for the client and SSR and
   * calls `getEnv` in each output, with the Start runtime of its
   * environment.
   */
  async function callIsomorphicFn(code: string) {
    const client = (await compileCode('client', code)) ?? code
    const ssr = (await compileCode('ssr', code)) ?? code
    return {
      client: settle((await evaluateModule(client)).getEnv),
      ssr: settle((await evaluateModule(ssr, {}, { env: 'server' })).getEnv),
    }
  }

  // Control for the pin below (same harness): the inline chain.
  test('each output keeps its implementation of an isomorphic fn written as one chain', async () => {
    expect(
      await callIsomorphicFn(`import { createIsomorphicFn } from '@tanstack/react-start'
export const getEnv = createIsomorphicFn().server(() => 'server').client(() => 'client')`),
    ).toEqual({ client: 'client', ssr: 'server' })
  })

  // Bug: an isomorphic fn whose first link is stored in a variable
  // (`const base = createIsomorphicFn().server(...)`, then
  // `export const getEnv = base.client(...)`) loses that link's
  // implementation: each call is compiled on its own, the chain walk from
  // `base.client(...)` stops at the identifier, so the output of the stored
  // link's environment gets a no-op. Same chain walk as the `.validator()`
  // pin of a builder stored in a variable above (fuzz N4).
  // Source: start-compiler/handleCreateIsomorphicFn.ts:17-25,
  // start-compiler/compiler.ts:1296-1330; fuzzing (oracle mode, round 2,
  // F3; Vite and Rsbuild builds return undefined too).
  // Impact: the server (or client) call silently returns undefined instead
  // of running its implementation.
  test.fails.each([
    {
      name: '.server() link',
      code: `const base = createIsomorphicFn().server(() => 'server')
export const getEnv = base.client(() => 'client')`,
    },
    {
      name: '.client() link',
      code: `const base = createIsomorphicFn().client(() => 'client')
export const getEnv = base.server(() => 'server')`,
    },
  ])(
    'each output keeps its implementation of an isomorphic fn whose $name is stored in a variable',
    async ({ code }) => {
      expect(
        await callIsomorphicFn(
          `import { createIsomorphicFn } from '@tanstack/react-start'\n${code}`,
        ),
      ).toEqual({ client: 'client', ssr: 'server' })
    },
  )

  // Bug: an isomorphic chain link wrapped in `satisfies` / `as` is not
  // followed: the implementation of the wrapped link is lost.
  // Impact: the output that needs it gets a no-op isomorphic fn (the server
  // or the client call returns undefined).
  // Source: #8504 start-compiler-factories.test.ts (differential fuzzing,
  // Vite and Rsbuild builds; red on main)
  test.fails.each([
    `(createIsomorphicFn().server(() => 'server') satisfies any).client(() => 'client')`,
    `(createIsomorphicFn().server(() => 'server') as any).client(() => 'client')`,
    `(createIsomorphicFn().client(() => 'client') as any).server(() => 'server')`,
  ])(
    'each output keeps its implementation of an isomorphic fn with a wrapped chain link: %s',
    async (chain) => {
      const code = `import { createIsomorphicFn } from '@tanstack/react-start'
export const fn = ${chain}`
      // A module without a server fn has no provider.
      const results: Record<string, unknown> = {}
      for (const output of ['client', 'ssr'] as const) {
        const compiled = (await compileCode(output, code)) ?? code
        results[output] = settle((await evaluateModule(compiled)).fn)
      }
      expect(results).toEqual({ client: 'client', ssr: 'server' })
    },
  )

  // Bug: a factory callee wrapped in `as any` is not resolved, so the call
  // is left untransformed.
  // Impact: the client bundle ships the server implementation and its
  // imports and runs it in the browser (the uncompiled factories return the
  // implementation); a client-only fn runs during SSR.
  // Source: #8504 start-compiler-factories.test.ts (Vite and Rsbuild builds;
  // red on main)
  test.fails.each(
    [
      {
        shape: 'createServerOnlyFn(fn)',
        code: (wrap: Wrap) =>
          `${wrap('createServerOnlyFn')}(() => db.x('SERVER_SECRET'))`,
        client: serverOnlyError,
        server: 'db:SERVER_SECRET',
      },
      {
        shape: 'createIsomorphicFn().server().client()',
        code: (wrap: Wrap) =>
          `${wrap('createIsomorphicFn')}().server(() => db.x('SERVER_SECRET')).client(() => chart())`,
        client: 'chart',
        server: 'db:SERVER_SECRET',
      },
      {
        shape: 'createIsomorphicFn().client().server()',
        code: (wrap: Wrap) =>
          `${wrap('createIsomorphicFn')}().client(() => chart()).server(() => db.x('SERVER_SECRET'))`,
        client: 'chart',
        server: 'db:SERVER_SECRET',
      },
      {
        shape: 'createClientOnlyFn(fn)',
        code: (wrap: Wrap) => `${wrap('createClientOnlyFn')}(() => chart())`,
        client: 'chart',
        server: clientOnlyError,
      },
    ].map((row) => ({
      ...row,
      name: 'as any',
      wrap: (x: string) => `(${x} as any)`,
    })),
  )(
    'each output keeps its implementation of $shape with the callee in $name',
    async ({ code: factory, wrap, client, server }) => {
      const code = `export const fn = ${factory(wrap)}`
      const source = [
        head,
        code.includes('db.x') && `import { db } from './db.server'\n`,
        code.includes('chart()') && `import { chart } from './chart.client'\n`,
        code,
      ]
        .filter(Boolean)
        .join('')
      const stubs = {
        './db.server': `export const db = { x: (key) => 'db:' + key }`,
        './chart.client': `export const chart = () => 'chart'`,
      }
      const compiled = {
        client: (await compileCode('client', source)) ?? source,
        ssr: (await compileCode('ssr', source)) ?? source,
      }
      await expectClientFree(compiled.client)
      expect(compiled.client).not.toContain('SERVER_SECRET')
      await expectSsrFree(compiled.ssr)
      expect(settle((await evaluateModule(compiled.client, stubs)).fn)).toEqual(
        client,
      )
      expect(settle((await evaluateModule(compiled.ssr, stubs)).fn)).toEqual(
        server,
      )
    },
  )

  // SolidStart rejects these captures because it hoists `"use server"`
  // functions; env-only functions stay where they are written.
  // Source: SolidStart directives validate.ts (assertHoistable), compile.spec.ts
  // "unsupported server functions"
  test('an env-only function in a class body keeps this, private members, super and arguments', async () => {
    const compiled = await compileAll(`${head}class Base {
  name() {
    return 'base'
  }
}
export class Api extends Base {
  #secret = 's'
  read(..._args: Array<unknown>) {
    return createServerOnlyFn(() => [this.#secret, super.name(), arguments.length])
  }
}`)
    const client = await evaluateModule(compiled.client)
    expect(settle(new client.Api().read(1))).toEqual(serverOnlyError)
    const ssr = await evaluateModule(compiled.ssr)
    expect(new ssr.Api().read(1)()).toEqual(['s', 'base', 1])
  })

  // Source: snapshot fixture envOnlyFactory (createClientOnlyFn half).
  test.each([
    {
      name: 'a function',
      code: `export function makeDraw() {
  return createClientOnlyFn(() => chart())
}`,
    },
    {
      name: 'an arrow function',
      code: `export const makeDraw = () => createClientOnlyFn(() => chart())`,
    },
  ])(
    'a createClientOnlyFn returned by $name runs only on the client',
    async ({ code }) => {
      const compiled = await compileAll(
        `${head}import { chart } from './chart.client'\n${code}`,
      )
      const stubs = { './chart.client': `export const chart = () => 'chart'` }
      expect((await evaluateModule(compiled.client, stubs)).makeDraw()()).toBe(
        'chart',
      )
      await expectSsrFree(compiled.ssr)
      const ssr = await evaluateModule(compiled.ssr, stubs)
      expect(settle(() => ssr.makeDraw()())).toEqual(clientOnlyError)
    },
  )

  test('a createServerOnlyFn wrapped in two calls runs only on the server', async () => {
    const compiled = await compileAll(`${head}import { db } from './db.server'
const wrap = <T,>(fn: T) => fn
export const read = wrap(wrap(createServerOnlyFn(() => db.secret())))`)
    const stubs = { './db.server': { db: { secret: () => 'secret' } } }
    await expectClientFree(compiled.client)
    expect(settle((await evaluateModule(compiled.client, stubs)).read)).toEqual(
      serverOnlyError,
    )
    expect((await evaluateModule(compiled.ssr, stubs)).read()).toBe('secret')
  })

  // On the server, a middleware `.server()` next to an isomorphic fn stays a
  // middleware: it is not compiled as the isomorphic fn's `.server()`.
  test('isomorphic, server-only and middleware implementations in one module reach only their environment', async () => {
    const code = `${head}import { createMiddleware } from '@tanstack/react-start'
import { chart } from './chart.client'
import { db } from './db.server'
export const iso = createIsomorphicFn()
  .server(() => db.x())
  .client(() => chart.draw())
export const serverOnly = createServerOnlyFn(() => db.x())
export const mw = createMiddleware().server(async ({ next }) =>
  next({ context: { value: db.x() } }),
)`
    const uncompiled = () => {
      throw new Error('uncompiled Start factory')
    }
    const stubs = {
      // Start's real runtime. The output may still import the factories
      // `head` imports, but never calls them uncompiled (they throw here).
      '@tanstack/react-start': {
        ...startClientCore,
        createClientOnlyFn: uncompiled,
        createIsomorphicFn: uncompiled,
        createServerOnlyFn: uncompiled,
      },
      './chart.client': `export const chart = { draw: () => 'drawn' }`,
      './db.server': `export const db = { x: () => 'x' }`,
    }
    const client = await compileCode('client', code)
    await expectClientFree(client!)
    expect((await evaluateModule(client!, stubs)).iso()).toBe('drawn')
    const ssr = await compileCode('ssr', code)
    await expectSsrFree(ssr!)
    const ssrModule = await evaluateModule(ssr!, stubs)
    expect([
      ssrModule.iso(),
      ssrModule.serverOnly(),
      await ssrModule.mw.options.server({
        next: (options: unknown) => options,
      }),
    ]).toEqual(['x', 'x', { context: { value: 'x' } }])
  })

  // Source: babel-dead-code-elimination "variable" > "within for...in";
  // #8504 start-compiler-factories.test.ts (top-level block row)
  // Hook calls are different (dropping one changes the hook order; pinned
  // separately); a plain server call like these must go.
  test('the client drops vars nested in blocks that only the server implementation reads', async () => {
    const client = await compileCode(
      'client',
      `${head}import { connect, serverCall } from './db.server'
if (typeof window === 'undefined') {
  var connection = connect()
}
export function getValue(flag: boolean) {
  if (flag) {
    var local = serverCall()
  }
  const read = createIsomorphicFn().server(() => [connection, local]).client(() => 'client')
  return read()
}`,
    )
    expect(await getModuleErrors(client!)).toEqual([])
    await expectClientFree(client!)
    expect((await evaluateModule(client!)).getValue(true)).toBe('client')
  })

  /** A server fn whose handler declares an env-specific fn of each kind. */
  const envFnsInHandler = `import { createServerFn, createClientOnlyFn, createIsomorphicFn, createServerOnlyFn } from '@tanstack/react-start'
import { chart } from './chart.client'
import { db } from './db.server'
export const fn = createServerFn().handler(async () => {
  const draw = createClientOnlyFn(() => chart())
  const now = createIsomorphicFn().server(() => db.now()).client(() => chart())
  const read = createServerOnlyFn(() => db.read())
  return [settle(draw), now(), read()]
})
function settle(run: () => unknown) {
  try {
    return run()
  } catch (error) {
    const { name, message } = error as Error
    return { thrown: { name, message } }
  }
}`

  // Bug: the provider leaves env-specific functions declared inside a
  // server fn handler uncompiled, with the client-only module they read
  // still imported.
  // Impact: on the server, a client-only fn called by a handler runs its
  // client implementation (the uncompiled factory returns it) instead of
  // throwing, and the server bundle loads the client-only module (browser-only
  // top-level code runs on the server; import protection rejects the
  // `.client` import in the server build).
  // Source: SolidStart directives plugin.ts transformFunction (directive
  // functions nested in a server function are compiled too); #8504
  // start-compiler-factories.test.ts "the provider compiles env-specific
  // functions inside a server fn handler" (red on main).
  test.fails(
    'the provider compiles env-specific functions inside a server fn handler',
    async () => {
      const server = await compileServer(envFnsInHandler)
      expect(await getModuleErrors(server.provider)).toEqual([])
      expectNotLoaded(await moduleLoads(server.provider, { env: 'server' }), [
        './chart.client',
      ])
      expect(
        await callProvider(server, 'fn', {
          './db.server': `export const db = { now: () => 'now', read: () => 'read' }`,
          './chart.client': `export const chart = () => 'chart'`,
        }),
      ).toEqual([{ thrown: envRestrictionError('client') }, 'now', 'read'])
    },
  )

  // Source: Waku vite-plugin-allow-server.test.ts "skips files without a use
  // client directive even if the string exists", "does not require
  // allowServer to come from waku/client" (inverted)
  test.each<{
    name: string
    code: string
    read: (module: Record<string, any>) => unknown
    expected: unknown
  }>([
    {
      name: 'only mentions the factories in strings and comments',
      code: `// createServerFn and createServerOnlyFn are not used here
export const label = 'createServerFn().handler(async () => 1)'
export const other = \`createClientOnlyFn(\${label})\``,
      read: (module) => [module.label, module.other],
      expected: [
        'createServerFn().handler(async () => 1)',
        'createClientOnlyFn(createServerFn().handler(async () => 1))',
      ],
    },
    {
      name: 'calls .handler() on an object that is not a server fn',
      code: `import { api } from './api'
import { secret } from './secret.server'
export const route = api.handler(async () => secret())`,
      read: (module) => module.route(),
      expected: 'secret',
    },
    {
      name: 'declares a function named like a factory',
      code: `function createServerOnlyFn<T>(fn: T) {
  return fn
}
export const value = createServerOnlyFn(() => 'mine')`,
      read: (module) => module.value(),
      expected: 'mine',
    },
  ])(
    'a module that $name keeps its meaning',
    async ({ code, read, expected }) => {
      const stubs = {
        './api': { api: { handler: (fn: () => unknown) => fn } },
        './secret.server': { secret: () => 'secret' },
      }
      for (const output of ['client', 'ssr'] as const) {
        const compiled = (await compileCode(output, code)) ?? code
        expect(
          await read(await evaluateModule(compiled, stubs)),
          output,
        ).toEqual(expected)
      }
    },
  )

  // Malformed-input diagnostic controls (SPEC §8, G5): an env function
  // without its implementation is a type error (tsc against the real
  // declarations: TS2554 "Expected 1 arguments, but got 0" for each row).
  // Where the missing implementation would run (the server: SSR; the
  // client), compiling fails clearly, naming the API. Nothing is required
  // of the other environment for such input.
  // Source: Waku vite-plugin-allow-server.test.ts "throws when allowServer
  // receives zero arguments"; replaces envOnly.test.ts and
  // createIsomorphicFn.test.ts "should error if implementation not provided"
  test.each<{ code: string; api: string; runsOn: Output }>([
    {
      code: `export const none = createServerOnlyFn()`,
      api: 'createServerOnlyFn',
      runsOn: 'ssr',
    },
    {
      code: `export const none = createIsomorphicFn().server().client(() => 1)`,
      api: 'createIsomorphicFn',
      runsOn: 'ssr',
    },
    {
      code: `export const none = createClientOnlyFn()`,
      api: 'createClientOnlyFn',
      runsOn: 'client',
    },
    {
      code: `export const none = createIsomorphicFn().client()`,
      api: 'createIsomorphicFn',
      runsOn: 'client',
    },
  ])(
    'a missing implementation is rejected where it runs: $code',
    async ({ code, api, runsOn }) => {
      const source = `${head}${code}`
      const error = await compileCode(runsOn, source).catch(
        (thrown: unknown) => thrown,
      )
      expectCompileError(error, { source, at: undefined, names: [api] })
    },
  )
})

describe('factories resolved through project modules', () => {
  test.each<{
    name: string
    output: Output
    files: Record<string, string>
    code: string
    serverFns: number
  }>([
    {
      name: 'a default-exported middleware builder imported as default',
      output: 'client',
      files: {
        '/test/src/mw.ts': `import { createMiddleware } from '@tanstack/react-start'
export default createMiddleware({ type: 'function' })`,
      },
      // Known limitation on main: middleware is detected by the
      // `createMiddleware` text, so a module that only calls an imported
      // builder is not compiled and needs this import.
      code: `import { createMiddleware } from '@tanstack/react-start'
import mw from './mw'
import { db } from './db.server'
export const logged = mw.server(async ({ next }) => {
  db.log()
  return next()
})`,
      serverFns: 0,
    },
    {
      name: 'a default-exported server fn builder declared by identifier',
      output: 'client',
      files: {
        '/test/src/builders.ts': `import { createServerFn } from '@tanstack/react-start'
const authed = createServerFn({ method: 'POST' })
export default authed`,
      },
      code: `import authed from './builders'
import { db } from './db.server'
export const fn = authed.handler(async () => db.x())`,
      serverFns: 1,
    },
    ...(['client', 'ssr'] as const).map((output) => ({
      name: 'a namespace import of a module re-exporting the factories',
      output,
      files: {
        '/test/src/factories.ts': `export { createServerFn, createIsomorphicFn } from '@tanstack/react-start'`,
      },
      code: `import * as F from './factories'
import { db } from './db.server'
export const fn = F.createServerFn().handler(async () => db.x())
export const iso = F.createIsomorphicFn().server(() => db.w()).client(() => 'client')`,
      serverFns: 1,
    })),
    {
      name: 'renamed re-exports next to a type-only re-export',
      output: 'client',
      files: {
        '/test/src/f.ts': `export { createServerFn as csf, createServerOnlyFn as so } from '@tanstack/react-start'
export type { Register } from '@tanstack/react-start'
export type * as types from '@tanstack/react-start'`,
      },
      code: `import { csf, so } from './f'
import type * as F from './f'
import { db } from './db.server'
export const fn = csf().handler(async () => db.x() as F.types.Register)
export const s = so(() => db.y())`,
      serverFns: 1,
    },
    {
      // Replaces createServerFn.test.ts "should use slow path for factory
      // pattern" (N9).
      name: 'a server fn factory const-aliased in another module',
      output: 'client',
      files: {
        '/test/src/factory.ts': `import { createServerFn } from '@tanstack/react-start'
export const createFooServerFn = createServerFn`,
      },
      code: `import { createFooServerFn } from './factory'
import { db } from './db.server'
export const fn = createFooServerFn().handler(async () => db.x())`,
      serverFns: 1,
    },
  ])('$output: $name', async ({ output, files, code, serverFns }) => {
    const compiled = await compileFor(output, code, { files })
    expect(await getModuleErrors(compiled.code!)).toEqual([])
    if (output === 'client') {
      await expectClientFree(compiled.code!, ['./db.server'], { files })
    }
    expect(Object.keys(compiled.serverFns)).toHaveLength(serverFns)
    // The server fn is called through an RPC by the reported id, which runs
    // the handler on the server (project modules linked as they are).
    if (serverFns > 0) {
      expect(
        await callServerFnThroughCallers(
          await compileAll(code, { files }),
          (module) => module.fn,
          {
            './db.server': { db: { x: () => 'x', y: () => 'y', w: () => 'w' } },
          },
        ),
      ).toBe('x')
    }
  })

  // Only createServerOnlyFn appears in the source text; on the server, the
  // client-only fn imported through an aliased re-export throws and the
  // server-only fn runs. (Which of its imports the SSR output keeps is left
  // open: neutral names, user ruling 2026-10-17.)
  test('ssr: an aliased re-export of createClientOnlyFn next to createServerOnlyFn', async () => {
    const files = {
      '/test/src/env.ts': `export { createClientOnlyFn as clientOnly } from '@tanstack/react-start'`,
    }
    const code = `import { createServerOnlyFn } from '@tanstack/react-start'
import { clientOnly } from './env'
import { secret } from './secret.server'
import { readWindow } from './browser'
export const serverValue = createServerOnlyFn(() => secret())
export const clientValue = clientOnly(() => readWindow())`
    const ssr = (await compileCode('ssr', code, { files })) ?? code
    expect(await getModuleErrors(ssr)).toEqual([])
    const module = await evaluateModule(
      ssr,
      {
        './env': { clientOnly: startClientCore.createClientOnlyFn },
        './secret.server': { secret: () => 'secret' },
        './browser': { readWindow: () => 'window' },
      },
      { env: 'server' },
    )
    expect([module.serverValue(), settle(module.clientValue)]).toEqual([
      'secret',
      clientOnlyError,
    ])
  })

  // Source: @vitejs/plugin-rsc expand-export-all fixtures (per row)
  test.each<{
    name: string
    files: Record<string, string>
    code?: string
    stubs?: Record<string, ModuleStub>
    resolvesServerOnlyFn: boolean
  }>([
    {
      // expand-export-all/explicit-wins
      name: 'a local export that overrides the star export',
      files: {
        '/test/src/start.ts': `export * from '@tanstack/react-start'
export function createServerOnlyFn(fn) {
  return fn
}`,
      },
      resolvesServerOnlyFn: false,
    },
    {
      // expand-export-all/nested-conflict-explicit-reexport-wins
      name: 'an explicit re-export that overrides a star export',
      files: {
        '/test/src/start.ts': `export * from './custom'
export { createServerFn, createServerOnlyFn } from '@tanstack/react-start'`,
        '/test/src/custom.ts': `export function createServerOnlyFn(fn) {
  return fn
}`,
      },
      resolvesServerOnlyFn: true,
    },
    {
      // expand-export-all/bad-resolve
      name: 'an unresolvable star export next to the package',
      files: {
        '/test/src/start.ts': `export * from './missing'
export * from '@tanstack/react-start'`,
      },
      stubs: { './missing': {} },
      resolvesServerOnlyFn: true,
    },
    {
      // expand-export-all/duplicate-star-same-source
      name: 'the same module re-exported twice',
      files: {
        '/test/src/start.ts': `export * from './inner'
export * from './inner'`,
        '/test/src/inner.ts': `export * from '@tanstack/react-start'`,
      },
      resolvesServerOnlyFn: true,
    },
    {
      // expand-export-all/namespace-same-binding
      name: 'two star exports that each forward part of the package',
      files: {
        '/test/src/start.ts': `export * from './a'
export * from './b'`,
        '/test/src/a.ts': `export { createServerFn } from '@tanstack/react-start'`,
        '/test/src/b.ts': `export { createServerOnlyFn } from '@tanstack/react-start'`,
      },
      resolvesServerOnlyFn: true,
    },
  ])(
    'an export * chain with $name',
    async ({
      files,
      code = `import { createServerFn, createServerOnlyFn } from './start'`,
      stubs = {},
      resolvesServerOnlyFn,
    }) => {
      const source = `${code}
import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())
export const serverOnly = createServerOnlyFn(() => 'server-only-marker')`
      const compiled = await compileAll(source, { files })
      expect(Object.keys(compiled.serverFns)).toHaveLength(1)
      await expectClientFree(compiled.client, ['./db.server'], {
        files,
        stubs,
      })
      const linked = { ...stubs, './db.server': { db: { x: () => 'x' } } }
      expect(
        await callServerFnThroughCallers(
          compiled,
          (module) => module.fn,
          linked,
        ),
      ).toBe('x')
      // Where the project's own `createServerOnlyFn` wins, it is a plain
      // function.
      const client = await evaluateModule(compiled.client, linked, { files })
      expect(settle(client.serverOnly)).toEqual(
        resolvesServerOnlyFn ? serverOnlyError : 'server-only-marker',
      )
    },
  )

  // Source: @vitejs/plugin-rsc expand-export-all/string-export-name; corpus
  // inputs U047/U048, restored with the unrecognised call shapes of the user
  // ruling 2026-10-20. A string export name is a re-export form, which SPEC
  // J4.5 lists among the recognised ones (coordinator 2026-10-20: supported,
  // no rejection branch). Valid TypeScript: arbitrary module namespace
  // names (tsc 7.0.2 accepts both modules against the real declarations).
  test('builders re-exported under string export names are recognised', async () => {
    const files = {
      '/test/src/start.ts': `export { createServerFn as 'create server fn', createServerOnlyFn as 'server only' } from '@tanstack/react-start'`,
    }
    const compiled = await compileAll(
      `import { 'create server fn' as createServerFn, 'server only' as createServerOnlyFn } from './start'
import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())
export const serverOnly = createServerOnlyFn(() => 'server-only-marker')`,
      { files },
    )
    await expectClientFree(compiled.client, ['./db.server'], { files })
    expect(compiled.client).not.toContain('db.x()')
    const linked = { './db.server': { db: { x: () => 'x' } } }
    expect(
      await callServerFnThroughCallers(compiled, (module) => module.fn, linked),
    ).toBe('x')
    const client = await evaluateModule(compiled.client, linked, { files })
    expect(settle(client.serverOnly)).toEqual(serverOnlyError)
    const ssr = await evaluateModule(compiled.ssr, linked, {
      files,
      env: 'server',
    })
    expect(ssr.serverOnly()).toBe('server-only-marker')
  })

  const factoryFiles = () => ({
    '/test/src/b.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()`,
    '/test/src/c.ts': `export * from './b'`,
  })
  const importer = `import { base } from './c'
import { db } from './db.server'
export const fn = base.handler(async () => db.x())`

  test('dev: invalidating a factory module recompiles its importers against the new code', async () => {
    const files = factoryFiles()
    const { compiler, compile } = createStartCompiler({
      env: 'client',
      mode: 'dev',
      files,
    })
    // `base` as the client runtime gives it, then as the edited module does.
    const stubs = (base: unknown) => ({
      './c': { base },
      './db.server': { db: { x: () => 'x' } },
    })
    const before = (await compile(importer, '/test/src/a.tsx')) ?? importer
    const { fn: rpc } = await evaluateModule(
      before,
      stubs(startClientCore.createServerFn()),
    )
    expect(callerRpcId(rpc)).toEqual(expect.any(String))
    files['/test/src/b.ts'] =
      `export const base = { handler: (fn: unknown) => fn }`
    // Bundlers may report the changed module with a query suffix.
    compiler.invalidateModules(['/test/src/b.ts?v=2', '/test/src/missing.ts'])
    // `base` is no server fn builder anymore: the handler is user code.
    const after = (await compile(importer, '/test/src/a.tsx')) ?? importer
    const { fn } = await evaluateModule(
      after,
      stubs({ handler: (handler: unknown) => handler }),
    )
    expect(await fn()).toBe('x')
  })

  test('dev: a server fn imported through an export * of the Start package compiles after an unrelated edit', async () => {
    const files = {
      '/test/src/start.ts': `export * from '@tanstack/react-start'`,
      '/test/src/other.ts': `export const x = 1`,
    }
    const { compiler, compile } = createStartCompiler({
      env: 'client',
      mode: 'dev',
      files,
    })
    const code = `import { createServerFn } from './start'
export const fn = createServerFn().handler(async () => 'secret-body')`
    expect(await compile(code, '/test/src/a.ts')).not.toContain('secret-body')
    compiler.invalidateModules(['/test/src/other.ts'])
    const after = await compile(code, '/test/src/b.ts')
    expect(after).not.toBeNull()
    expect(after).not.toContain('secret-body')
  })
})

// Source: V4 red-astra-r2/07; SPEC J4.10, G12. A normal function's
// receiver comes from its caller, including through Function.prototype.call.
test.each([
  ['server', 'createServerOnlyFn'],
  ['client', 'createClientOnlyFn'],
] as const)(
  '%s: an env-only function keeps its call receiver',
  async (env, factory) => {
    const code = await compileCode(
      env === 'server' ? 'ssr' : 'client',
      `import { ${factory} } from '@tanstack/react-start'
export const read = ${factory}(function (this: { value: number }) { return this.value })`,
    )
    const module = await evaluateModule(code!)
    expect(module.read.call({ value: 7 })).toBe(7)
  },
)

// Source: V4 red-astra-r2/06; SPEC J4.9, G12. No await in the body:
// the async contract itself must survive selection of either implementation.
test.each(['client', 'ssr'] as const)(
  '%s: an async isomorphic implementation returns a promise',
  async (env) => {
    const code = await compileCode(
      env,
      `${head}
export const read = createIsomorphicFn().client(async () => 'client').server(async () => 'server')`,
    )
    const module = await evaluateModule(code!)
    const result = module.read()
    expect(await result.then((value: string) => value)).toBe(
      env === 'client' ? 'client' : 'server',
    )
  },
)
