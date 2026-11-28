import { beforeAll, describe, expect, test } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  callFromClient,
  callServerFnThroughCallers,
  compileError,
  createStartHost,
  expectCompileError,
  fromPage,
  inPage,
  serveCase,
  serverFnUrls,
  settle,
  throwsError,
} from './regression-helpers'
import { clientMiddleware, clientMiddlewareOf } from './page-values'
import {
  aliasedClientOnlyFiles,
  exportStarModule,
  exportStarRows,
  factoryDb,
  factoryRows,
} from './compiler-inputs'
import type { StartHost } from './start-host'
import type { PageSettled, StartCase } from './regression-helpers'

// Each environment keeps the implementation of its own environment (and only
// the imports that implementation reads) and replaces the other one with a
// stub that throws. The compiler only rewrites calls it can resolve to a
// Start factory, through any chain of project modules. "Only its imports"
// is observed as loading: the client never loads a server-only module, the
// SSR environment never a client-only one. Everything runs through the
// public Start host (`./start-host`): the client in a real page, the server
// in the SSR environment and in real requests, on Start's real runtime.

let host: StartHost
beforeAll(async () => {
  host = await createStartHost()
  return () => host.close()
}, 60_000)
beforeAll(async () => {
  await host.page()
}, 60_000)

/** The client loads none of `forbidden` (default: `./db.server`). */
async function expectClientFree(
  served: StartCase,
  forbidden = ['./db.server'],
  file?: string,
) {
  expectNotLoaded(await served.loads(file), forbidden)
}

/** The SSR environment does not load the client-only module. */
async function expectSsrFree(served: StartCase, file?: string) {
  expectNotLoaded(await served.serverLoads(file), ['./chart.client'])
}

/**
 * What calling the function `fn` (a page expression) gives in the page (its
 * value, or a `Thrown` of what it threw; `fn` itself when it is no
 * function, like `settle`). Only plain data and Start's promises are kept: code the compiler
 * wrongly left on the client may return a mock import protection put in
 * place of a server module, whose value must not be awaited (a mock is
 * thenable forever); it is reported by its type.
 */
async function settleInPage(served: StartCase, fn: string, file?: string) {
  return fromPage(
    await inPage<PageSettled>(
      served,
      `try {
  const fn = ${fn}
  let value = typeof fn === 'function' ? fn() : fn
  if (value instanceof Promise) {
    value = await value
  }
  const plain = value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value) || Array.isArray(value) ||
    (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
  return { value: plain ? value : '<' + typeof value + '>' }
} catch (error) {
  return { thrown: { name: error && error.name, message: String(error && error.message !== undefined ? error.message : error) } }
}`,
      { file },
    ),
  )
}

/** A case of `module.tsx` (`code`) and its real modules (`files`). */
async function serve(
  code: string,
  files: Record<string, string> = {},
  file = 'module.tsx',
) {
  return serveCase(host, { [file]: code, ...files }, { file })
}

const head = `import { createClientOnlyFn, createIsomorphicFn, createServerOnlyFn } from '@tanstack/react-start'\n`
type Wrap = (expression: string) => string

describe('environment-specific functions', () => {
  // Source: Waku vite-plugin-allow-server.test.ts "keeps only allowServer
  // dependencies and removes allowServer imports", "supports allowServer
  // aliasing and export specifiers". Dev and build compile alike: the
  // production build of the same module is in
  // integration/start-compiler-build-env-fns.test.ts.
  test('dev: each environment keeps the implementation of its environment and only its dependencies', async () => {
    const served = await serve(
      `import { createServerOnlyFn, createClientOnlyFn as clientOnly } from '@tanstack/react-start'
import { draw } from './chart.client'
import { query } from './db.server'
const shared = 1
const readDb = () => query(shared)
const serverValue = createServerOnlyFn(readDb)
export const clientValue = clientOnly(() => draw(shared))
export { serverValue as exposed }`,
      {
        'chart.client.ts': `export const draw = (x: number) => 'draw:' + x\n`,
        'db.server.ts': `export const query = (x: number) => 'query:' + x\n`,
      },
    )
    await expectClientFree(served)
    expect([
      await inPage(served, 'return module.clientValue()'),
      await settleInPage(served, 'module.exposed'),
    ]).toEqual(['draw:1', throwsError])
    await expectSsrFree(served)
    const ssr = await served.ssr()
    expect([settle(ssr.clientValue), ssr.exposed()]).toEqual([
      throwsError,
      'query:1',
    ])
  })

  // An installed browser-only package (it reads `window` when it loads)
  // that only client-only code reads, through a diamond and a cycle of
  // helpers, never loads on the server, where it would crash (SPEC J4.11,
  // G16). The production twin: integration/start-build-client-only-imports.test.ts.
  test('dev: the SSR environment does not load a browser-only package only client-only code reads', async () => {
    const served = await serve(
      `import { createClientOnlyFn, createIsomorphicFn } from '@tanstack/react-start'
import { measure } from 'browser-lib'
const measured = () => measure()
const left = () => measured()
const right = () => measured()
function ping(n: number): string { return n > 0 ? pong(n - 1) : left() + right() }
function pong(n: number): string { return n > 0 ? ping(n - 1) : '' }
export const size = createClientOnlyFn(() => measure())
export const resize = createIsomorphicFn().server(() => 'server').client(() => ping(2))`,
      {
        'node_modules/browser-lib/package.json': JSON.stringify({
          name: 'browser-lib',
          type: 'module',
          exports: './index.js',
        }),
        'node_modules/browser-lib/index.js': `const width = window.innerWidth
export const measure = () => 'measure:' + typeof width
`,
      },
    )
    expectNotLoaded(await served.serverLoads(), ['browser-lib'])
    expect(
      await inPage(served, 'return [module.size(), module.resize()]'),
    ).toEqual(['measure:number', 'measure:numbermeasure:number'])
    const ssr = await served.ssr()
    expect([settle(ssr.size), ssr.resize()]).toEqual([throwsError, 'server'])
  })

  // Source: Waku vite-plugin-allow-server.test.ts "handles default allowServer
  // export", "stubs default exports while preserving allowServer dependencies"
  test.each([
    {
      code: `import { db } from './db.server'
export default createServerOnlyFn(() => db.x())`,
      client: throwsError,
      server: 'db',
    },
    {
      code: `import { chart } from './chart.client'
export default createClientOnlyFn(() => chart())`,
      client: 'chart',
      server: throwsError,
    },
    {
      code: `import { db } from './db.server'
import { chart } from './chart.client'
export default createIsomorphicFn().server(() => db.x()).client(() => chart())`,
      client: 'chart',
      server: 'db',
    },
  ])('a default-exported function: $code', async ({ code, client, server }) => {
    const served = await serve(`${head}${code}`, {
      'db.server.ts': `export const db = { x: () => 'db' }\n`,
      'chart.client.ts': `export const chart = () => 'chart'\n`,
    })
    await expectClientFree(served)
    await expectSsrFree(served)
    expect(await settleInPage(served, 'module.default')).toEqual(client)
    const ssr = await served.ssr()
    expect(settle(ssr.default)).toEqual(server)
  })

  // Source: Waku vite-plugin-allow-server.test.ts "handles default allowServer
  // export" (middleware variant)
  test('the client strips the server implementation of a default-exported middleware', async () => {
    const served = await serve(
      `import { createMiddleware } from '@tanstack/react-start'
import { db } from './db.server'
export default createMiddleware().server(async ({ next }) => {
  db.log()
  return next()
})`,
      { 'db.server.ts': `export const db = { log: () => {} }\n` },
    )
    await expectClientFree(served)
    // The middleware records no server implementation.
    expect(
      await inPage(served, `return ${clientMiddlewareOf('module.default')}`),
    ).toEqual(clientMiddleware('request'))
  })

  describe('a middleware chain with a wrapped link', () => {
    // A `.ts` module, so that `<any>x` is a type assertion.
    const file = 'module.ts'
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
    const serverFiles = {
      'db.server.ts': `export const db = { read: (key: string) => 'db:' + key }\n`,
      'check.server.ts': `export const check = (data: unknown, key: string) => data + ':' + key\n`,
    }

    /**
     * The links of the middleware (Start's createMiddleware records each in
     * its options), each with the result of its implementation: the same
     * page script and server code.
     */
    // Only Start's own results (promises, plain data) are awaited and kept:
    // a link left on the client may call a module import protection
    // replaced with a mock, whose value must not be awaited (a mock is
    // thenable forever).
    const runLinksSource = `const plain = (value) =>
  value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value) || Array.isArray(value) ||
  (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
const links = {}
for (const method of ['middleware', 'validator', 'client', 'server']) {
  const impl = mw.options[method]
  if (impl !== undefined) {
    let result = method === 'middleware' ? impl : impl(method === 'validator' ? 'data' : { next: (opts) => opts })
    if (result instanceof Promise) {
      result = await result
    }
    links[method] = plain(result) ? result : '<' + typeof result + '>'
  }
}
return links`

    /** The links each environment keeps, with their results. */
    async function runLinks(code: string) {
      const served = await serve(code, serverFiles, file)
      const client = await inPage(
        served,
        `const mw = module.mw\n${runLinksSource}`,
        { file },
      )
      const AsyncFunction = (async () => {}).constructor as new (
        ...args: Array<string>
      ) => (mw: unknown) => Promise<unknown>
      const ssr = await new AsyncFunction('mw', runLinksSource)(
        (await served.ssr(file)).mw,
      )
      return { served, client, ssr }
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
          // Source: fuzzing (a crash of the Yuku migration, #8504; main
          // builds it).
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
        const { served, client, ssr } = await runLinks(
          middlewareModule(chain(wrap)),
        )
        await expectClientFree(served, serverModules, file)
        expect(served.code.client).not.toMatch(/SERVER_SECRET|VALIDATOR_SECRET/)
        expect(client).toEqual(clientLinks)
        expect(ssr).toEqual(ssrLinks)
      },
    )

    // The validator only runs on the server.
    // On main, the validator and its server-only imports ship to the client.
    // Source: #8504 start-compiler-factories.test.ts "the client strips a
    // validator link wrapped in $name" (Vite and Rsbuild builds; red on main).
    test.each(
      ['', '.middleware([])'].flatMap((middleware) =>
        wrappers.slice(1).map((wrapper) => ({ ...wrapper, middleware })),
      ),
    )(
      'the client strips a validator link$middleware wrapped in $name',
      async ({ wrap, middleware }) => {
        const { served, client, ssr } = await runLinks(
          middlewareModule(
            `${wrap(`createMiddleware({ type: 'function' })${middleware}${validatorLink}`)}${clientLink}${serverLink}`,
          ),
        )
        const kept = middleware ? { middleware: [] } : {}
        await expectClientFree(served, serverModules, file)
        expect(served.code.client).not.toMatch(/SERVER_SECRET|VALIDATOR_SECRET/)
        expect(client).toEqual({ ...kept, client: clientResult })
        expect(ssr).toEqual({
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
      const { served, client, ssr } = await runLinks(
        builderVariableModule(clientLink, serverLink),
      )
      await expectClientFree(served, serverModules, file)
      expect(served.code.client).not.toMatch(/SERVER_SECRET/)
      expect(client).toEqual({ client: clientResult })
      expect(ssr).toEqual({ client: clientResult, server: serverResult })
    })

    // Source: main's start-compiler/compiler.ts:1296-1330 (the chain walk stops at an
    // identifier), start-compiler/handleCreateMiddleware.ts:21-32; fuzzing.
    // On main, the validator and its server-only imports ship to the client.
    test('the client strips a validator link of a builder stored in a variable', async () => {
      const { served, client, ssr } = await runLinks(
        builderVariableModule(validatorLink, serverLink),
      )
      await expectClientFree(served, serverModules, file)
      expect(served.code.client).not.toMatch(/SERVER_SECRET|VALIDATOR_SECRET/)
      expect(client).toEqual({})
      expect(ssr).toEqual({
        validator: 'data:VALIDATOR_SECRET',
        server: serverResult,
      })
    })
  })

  /**
   * Serves `code` (which exports `getEnv`) and calls `getEnv` in each
   * environment, on the Start runtime of that environment.
   */
  async function callIsomorphicFn(code: string, name = 'getEnv') {
    const served = await serve(code)
    const ssr = await served.ssr()
    return {
      client: await settleInPage(served, `module.${name}`),
      ssr: settle(ssr[name]),
    }
  }

  // Source: main's start-compiler/handleCreateIsomorphicFn.ts:17-25,
  // start-compiler/compiler.ts:1296-1330; fuzzing (Vite and Rsbuild builds
  // return undefined too).
  // On main, the server (or client) call silently returns undefined instead of
  // running its implementation.
  test.each([
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

  // On main, the output that needs it gets a no-op isomorphic fn (the server or
  // the client call returns undefined).
  // Source: #8504 start-compiler-factories.test.ts (differential fuzzing, Vite
  // and Rsbuild builds; red on main)
  test.each([
    `(createIsomorphicFn().server(() => 'server') satisfies any).client(() => 'client')`,
    `(createIsomorphicFn().server(() => 'server') as any).client(() => 'client')`,
    `(createIsomorphicFn().client(() => 'client') as any).server(() => 'server')`,
  ])(
    'each output keeps its implementation of an isomorphic fn with a wrapped chain link: %s',
    async (chain) => {
      expect(
        await callIsomorphicFn(
          `import { createIsomorphicFn } from '@tanstack/react-start'
export const fn = ${chain}`,
          'fn',
        ),
      ).toEqual({ client: 'client', ssr: 'server' })
    },
  )

  // On main, the client bundle ships the server implementation and its imports
  // and runs it in the browser (the uncompiled factories return the
  // implementation); a client-only fn runs during SSR.
  // Source: #8504 start-compiler-factories.test.ts (Vite and Rsbuild builds;
  // red on main)
  test.each(
    [
      {
        shape: 'createServerOnlyFn(fn)',
        code: (wrap: Wrap) =>
          `${wrap('createServerOnlyFn')}(() => db.x('SERVER_SECRET'))`,
        client: throwsError,
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
        server: throwsError,
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
      const served = await serve(source, {
        'db.server.ts': `export const db = { x: (key: string) => 'db:' + key }\n`,
        'chart.client.ts': `export const chart = () => 'chart'\n`,
      })
      await expectClientFree(served)
      expect(served.code.client).not.toContain('SERVER_SECRET')
      await expectSsrFree(served)
      expect(await settleInPage(served, 'module.fn')).toEqual(client)
      const ssr = await served.ssr()
      expect(settle(ssr.fn)).toEqual(server)
    },
  )

  // SolidStart rejects these captures because it hoists `"use server"`
  // functions; env-only functions stay where they are written.
  // Source: SolidStart directives validate.ts (assertHoistable), compile.spec.ts
  // "unsupported server functions"
  test('an env-only function in a class body keeps this, private members, super and arguments', async () => {
    const served = await serve(`${head}class Base {
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
    expect(await settleInPage(served, 'new module.Api().read(1)')).toEqual(
      throwsError,
    )
    const ssr = await served.ssr()
    expect(new ssr.Api().read(1)()).toEqual(['s', 'base', 1])
  })

  // The function a factory returns calls its implementation with no
  // receiver: one read from an object and called at once stays detached
  // where the compiler keeps it in the call's place, and `eval` stays an
  // indirect eval. Source: the Astra overall review 3 and start review 6.
  test('an implementation read from an object and called at once gets no receiver', async () => {
    const served = await serve(`${head}const obj = {
  method(this: unknown) {
    return this === undefined ? 'bare' : this === obj ? 'bound' : 'other'
  },
}
const select = createClientOnlyFn
export const onClient = () => [
  createClientOnlyFn(obj.method)(),
  select(obj.method)(),
  (createClientOnlyFn(obj.method) as () => string)(),
  createClientOnlyFn(obj.method)\`\`,
  createIsomorphicFn().server(obj.method).client(obj.method)(),
  createClientOnlyFn(eval)('typeof obj'),
]
export const onServer = () => [
  createServerOnlyFn(obj.method)(),
  createIsomorphicFn().server(obj.method).client(obj.method)(),
]`)
    expect(await inPage(served, 'return module.onClient()')).toEqual([
      'bare',
      'bare',
      'bare',
      'bare',
      'bare',
      'undefined',
    ])
    expect((await served.ssr()).onServer()).toEqual(['bare', 'bare'])
  })

  // A factory call passed straight to another factory is itself rewritten
  // (to its implementation or a stub), so the outer call's kept text is
  // whatever that rewrite leaves: the result is called, tagged, read and
  // extended as written, as on main. A class may extend what a factory
  // selects. Source: the Astra round 2 architecture review (B1, B3).
  test('a factory call passed to another factory and used at once gives its implementation', async () => {
    const served = await serve(`${head}const obj = {
  method(this: unknown) {
    return this === undefined ? 'bare' : this === obj ? 'bound' : 'other'
  },
}
const pick = () => Date.now() > 0
export const onClient = () => {
  class Picked extends createClientOnlyFn(pick() ? TypeError : Error) {}
  class Nested extends createClientOnlyFn(createClientOnlyFn(RangeError)) {}
  return [
    createClientOnlyFn(createClientOnlyFn(() => Math.max(1, 42)))(),
    typeof createClientOnlyFn(createClientOnlyFn(() => 42))(),
    createIsomorphicFn().client(createClientOnlyFn(() => 42))(),
    createClientOnlyFn(createClientOnlyFn(obj.method))(),
    createClientOnlyFn(createClientOnlyFn(() => 'tag'))\`\`,
    createClientOnlyFn(createClientOnlyFn((a: number, b: number) => a + b)).length,
    new Picked('bad').name,
    new Nested('bad').name,
  ]
}
export const onServer = () => {
  class Picked extends createServerOnlyFn(pick() ? TypeError : Error) {}
  class Nested extends createServerOnlyFn(createServerOnlyFn(RangeError)) {}
  return [
    createServerOnlyFn(createServerOnlyFn(() => Math.max(1, 42)))(),
    typeof createServerOnlyFn(createServerOnlyFn(() => 42))(),
    createIsomorphicFn().server(createServerOnlyFn(() => 42))(),
    createServerOnlyFn(createServerOnlyFn(obj.method))(),
    createServerOnlyFn(createServerOnlyFn(() => 'tag'))\`\`,
    createServerOnlyFn(createServerOnlyFn((a: number, b: number) => a + b)).length,
    new Picked('bad').name,
    new Nested('bad').name,
  ]
}`)
    const expected = [
      42,
      'number',
      42,
      'bare',
      'tag',
      2,
      'TypeError',
      'RangeError',
    ]
    expect(await inPage(served, 'return module.onClient()')).toEqual(expected)
    expect((await served.ssr()).onServer()).toEqual(expected)
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
      const served = await serve(
        `${head}import { chart } from './chart.client'\n${code}`,
        { 'chart.client.ts': `export const chart = () => 'chart'\n` },
      )
      expect(await inPage(served, 'return module.makeDraw()()')).toBe('chart')
      await expectSsrFree(served)
      const ssr = await served.ssr()
      expect(settle(ssr.makeDraw())).toEqual(throwsError)
    },
  )

  test('a createServerOnlyFn wrapped in two calls runs only on the server', async () => {
    const served = await serve(
      `${head}import { db } from './db.server'
const wrap = <T,>(fn: T) => fn
export const read = wrap(wrap(createServerOnlyFn(() => db.secret())))`,
      { 'db.server.ts': `export const db = { secret: () => 'secret' }\n` },
    )
    await expectClientFree(served)
    expect(await settleInPage(served, 'module.read')).toEqual(throwsError)
    expect((await served.ssr()).read()).toBe('secret')
  })

  // On the server, a middleware `.server()` next to an isomorphic fn stays a
  // middleware: it is not compiled as the isomorphic fn's `.server()`. On
  // Start's real runtime (an uncompiled factory is the real one's business,
  // not a throwing stand-in).
  test('isomorphic, server-only and middleware implementations in one module reach only their environment', async () => {
    const served = await serve(
      `${head}import { createMiddleware } from '@tanstack/react-start'
import { chart } from './chart.client'
import { db } from './db.server'
export const iso = createIsomorphicFn()
  .server(() => db.x())
  .client(() => chart.draw())
export const serverOnly = createServerOnlyFn(() => db.x())
export const mw = createMiddleware().server(async ({ next }) =>
  next({ context: { value: db.x() } }),
)`,
      {
        'chart.client.ts': `export const chart = { draw: () => 'drawn' }\n`,
        'db.server.ts': `export const db = { x: () => 'x' }\n`,
        // The middleware's user: a server fn whose handler gives what the
        // middleware put into its context.
        'uses-mw.ts': `import { createServerFn } from '@tanstack/react-start'
import { mw } from './module'
export const value = createServerFn()
  .middleware([mw])
  .handler(async ({ context }) => context.value)
`,
      },
    )
    await expectClientFree(served)
    expect(await inPage(served, 'return module.iso()')).toBe('drawn')
    await expectSsrFree(served)
    const ssr = await served.ssr()
    // The middleware runs in Start's middleware chain: for a call of the
    // server fn from the client (over HTTP) and from server code (inside a
    // real request).
    expect([
      ssr.iso(),
      ssr.serverOnly(),
      await callServerFnThroughCallers(served, 'module.value', undefined, {
        file: 'uses-mw.ts',
      }),
    ]).toEqual(['x', 'x', 'x'])
  })

  // Source: babel-dead-code-elimination "variable" > "within for...in";
  // #8504 start-compiler-factories.test.ts (top-level block row)
  test('the client drops vars nested in blocks that only the server implementation reads', async () => {
    const served = await serve(
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
      {
        'db.server.ts': `export const connect = () => 'connection'\nexport const serverCall = () => 'local'\n`,
      },
    )
    await expectClientFree(served)
    expect(await inPage(served, 'return module.getValue(true)')).toBe('client')
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

  // On main, on the server, a client-only fn called by a handler runs its
  // client implementation (the uncompiled factory returns it) instead of
  // throwing, and the server bundle loads the client-only module (browser-only
  // top-level code runs on the server; import protection rejects the `.client`
  // import in the server build).
  // Source: SolidStart directives plugin.ts transformFunction (directive
  // functions nested in a server function are compiled too); #8504
  // start-compiler-factories.test.ts "the provider compiles env-specific
  // functions inside a server fn handler" (red on main).
  test('the server compiles env-specific functions inside a server fn handler', async () => {
    const loadedKey = '__startHostChartClientLoaded'
    const global = globalThis as Record<string, unknown>
    delete global[loadedKey]
    try {
      const served = await serve(envFnsInHandler, {
        'db.server.ts': `export const db = { now: () => 'now', read: () => 'read' }\n`,
        // Records being loaded in the realm that loads it (the server's
        // is this process).
        'chart.client.ts': `;(globalThis as any).${loadedKey} = true
export const chart = () => 'chart'
`,
      })
      expect(await callFromClient(served, 'module.fn')).toEqual([
        { thrown: expect.anything() },
        'now',
        'read',
      ])
      expect(global[loadedKey], 'the server loaded chart.client').toBe(
        undefined,
      )
    } finally {
      delete global[loadedKey]
    }
  })

  // Source: Waku vite-plugin-allow-server.test.ts "skips files without a use
  // client directive even if the string exists", "does not require
  // allowServer to come from waku/client" (inverted)
  test.each<{
    name: string
    code: string
    /** A JavaScript expression with the module as `module`. */
    read: string
    expected: unknown
  }>([
    {
      name: 'only mentions the factories in strings and comments',
      code: `// createServerFn and createServerOnlyFn are not used here
export const label = 'createServerFn().handler(async () => 1)'
export const other = \`createClientOnlyFn(\${label})\``,
      read: '[module.label, module.other]',
      expected: [
        'createServerFn().handler(async () => 1)',
        'createClientOnlyFn(createServerFn().handler(async () => 1))',
      ],
    },
    {
      // (`./secret`, not `./secret.server`: import protection would deny a
      // `.server` module on the client, which is another subject.)
      name: 'calls .handler() on an object that is not a server fn',
      code: `import { api } from './api'
import { secret } from './secret.server'
export const route = api.handler(async () => secret())`,
      read: 'module.route()',
      expected: 'secret',
    },
    {
      name: 'declares a function named like a factory',
      code: `function createServerOnlyFn<T>(fn: T) {
  return fn
}
export const value = createServerOnlyFn(() => 'mine')`,
      read: 'module.value()',
      expected: 'mine',
    },
  ])(
    'a module that $name keeps its meaning',
    async ({ code, read, expected }) => {
      const served = await serve(code, {
        'api.ts': `export const api = { handler: (fn: () => unknown) => fn }\n`,
        // A server-only file name: the module stays as written whatever its
        // imports are called (import protection is off on this host)
        'secret.server.ts': `export const secret = () => 'secret'\n`,
      })
      expect(await inPage(served, `return await (${read})`), 'client').toEqual(
        expected,
      )

      const readOnServer = new Function('module', `return (${read})`) as (
        module: Record<string, any>,
      ) => unknown
      expect(await readOnServer(await served.ssr()), 'ssr').toEqual(expected)
    },
  )

  // Malformed-input diagnostic controls (SPEC §8, G5): an env function
  // without its implementation is a type error (tsc against the real
  // declarations: TS2554 "Expected 1 arguments, but got 0" for each row).
  // Where the missing implementation would run (the server: SSR; the
  // client), compiling fails. Nothing is required
  // of the other environment for such input.
  // Source: Waku vite-plugin-allow-server.test.ts "throws when allowServer
  // receives zero arguments"; replaces envOnly.test.ts and
  // createIsomorphicFn.test.ts "should error if implementation not provided"
  test.each<{ code: string; api: string; runsOn: 'client' | 'ssr' }>([
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
    async ({ code, runsOn }) => {
      const source = `${head}${code}`
      const startCase = await host.case({ 'module.tsx': source })
      const error = await compileError(startCase, runsOn)
      expectCompileError(error, { source, at: undefined })
    },
  )
})

describe('factories resolved through project modules', () => {
  test.each(factoryRows)(
    '$output: $name',
    async ({ output, files, code, serverFns }) => {
      const served = await serve(code, { ...files, ...factoryDb })
      if (output === 'client') {
        await expectClientFree(served)
      }
      // The module gives its importers that many server fns (public urls).
      expect(await serverFnUrls(served)).toHaveLength(serverFns)
      if ('iso' in (await served.ssr())) {
        // Each environment runs its own isomorphic implementation.
        expect(
          output === 'client'
            ? await inPage(served, 'return module.iso()')
            : (await served.ssr()).iso(),
        ).toBe(output === 'client' ? 'client' : 'w')
      }
      // The server fn is called from the client (through the server) and
      // from server code, and runs the handler on the server.
      if (serverFns > 0) {
        expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('x')
      }
    },
  )

  // Only createServerOnlyFn appears in the source text; on the server, the
  // client-only fn imported through an aliased re-export throws and the
  // server-only fn runs. The SSR environment does not load the neutral
  // module only the client-only fn reads (SPEC J4.11, G16).
  test('ssr: an aliased re-export of createClientOnlyFn next to createServerOnlyFn', async () => {
    const { 'module.tsx': code, ...files } = aliasedClientOnlyFiles
    const served = await serve(code, files)
    expectNotLoaded(await served.serverLoads(), ['./browser'])
    const module = await served.ssr()
    expect([module.serverValue(), settle(module.clientValue)]).toEqual([
      'secret',
      throwsError,
    ])
  })

  test.each(exportStarRows)(
    'an export * chain with $name',
    async ({ files, resolvesServerOnlyFn }) => {
      const served = await serve(exportStarModule, { ...files, ...factoryDb })
      expect(await serverFnUrls(served)).toHaveLength(1)
      await expectClientFree(served)
      expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('x')
      // Where the project's own `createServerOnlyFn` wins, it is a plain
      // function.
      expect(await settleInPage(served, 'module.serverOnly')).toEqual(
        resolvesServerOnlyFn ? throwsError : 'server-only-marker',
      )
    },
  )

  // Source: @vitejs/plugin-rsc expand-export-all/string-export-name. A
  // string export name is a re-export form, which SPEC J4.5 lists among the
  // recognised ones (supported, no rejection branch). Valid TypeScript:
  // arbitrary module namespace names (tsc 7.0.2 accepts both modules
  // against the real declarations).
  test('builders re-exported under string export names are recognised', async () => {
    const served = await serve(
      `import { 'create server fn' as createServerFn, 'server only' as createServerOnlyFn } from './start'
import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x() ?? 'MARK_FN_HANDLER')
export const serverOnly = createServerOnlyFn(() => 'server-only-marker')`,
      {
        'start.ts': `export { createServerFn as 'create server fn', createServerOnlyFn as 'server only' } from '@tanstack/react-start'`,
        ...factoryDb,
      },
    )
    await expectClientFree(served)
    expect(served.code.client).not.toContain('MARK_FN_HANDLER')
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('x')
    expect(await settleInPage(served, 'module.serverOnly')).toEqual(throwsError)
    expect((await served.ssr()).serverOnly()).toBe('server-only-marker')
  })

  // A named import spelled `'*'` is that export, not the module's
  // namespace: an ordinary function there builds beside a module exporting
  // a factory, and a factory there is recognised. Source: the Astra core
  // review 8.
  test("a named import spelled '*' is the export of that name", async () => {
    const served = await serve(
      `import { '*' as twice } from './ordinary'
import { '*' as define } from './start'
import { db } from './db.server'
export const doubled = () => twice(21)
export const serverOnly = define(() => db.x())`,
      {
        'ordinary.ts': `const twice = (n: number) => n * 2
export { twice as '*' }
export { createServerOnlyFn } from '@tanstack/react-start'
`,
        'start.ts': `export { createServerOnlyFn as '*' } from '@tanstack/react-start'\n`,
        ...factoryDb,
      },
    )
    await expectClientFree(served)
    expect(await inPage(served, 'return module.doubled()')).toBe(42)
    expect(await settleInPage(served, 'module.serverOnly')).toEqual(throwsError)
    expect((await served.ssr()).serverOnly()).toBe('x')
  })
})

// SPEC J4.10, G12. A normal function's
// receiver comes from its caller, including through Function.prototype.call.
test.each([
  ['server', 'createServerOnlyFn'],
  ['client', 'createClientOnlyFn'],
] as const)(
  '%s: an env-only function keeps its call receiver',
  async (env, factory) => {
    const served =
      await serve(`import { ${factory} } from '@tanstack/react-start'
export const read = ${factory}(function (this: { value: number }) { return this.value })`)
    expect(
      env === 'client'
        ? await inPage(served, 'return module.read.call({ value: 7 })')
        : (await served.ssr()).read.call({ value: 7 }),
    ).toBe(7)
  },
)

// SPEC J4.9, G12. No await in the body:
// the async contract itself must survive selection of either implementation.
test.each(['client', 'ssr'] as const)(
  '%s: an async isomorphic implementation returns a promise',
  async (env) => {
    const served = await serve(`${head}
export const read = createIsomorphicFn().client(async () => 'client').server(async () => 'server')`)
    expect(
      env === 'client'
        ? await inPage(
            served,
            `const result = module.read()
return { promise: result instanceof Promise, value: await result.then((value) => value) }`,
          )
        : await (async () => {
            const result = (await served.ssr()).read()
            return {
              promise: result instanceof Promise,
              value: await result.then((value: string) => value),
            }
          })(),
    ).toEqual({ promise: true, value: env === 'client' ? 'client' : 'server' })
  },
)
