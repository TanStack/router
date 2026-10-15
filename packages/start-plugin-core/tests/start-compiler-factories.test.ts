import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import {
  callProvider,
  clientOnlyError,
  compileAll,
  compileCode,
  compileFor,
  createStartCompiler,
  evaluateModule,
  importSources,
  outputs,
  serverOnlyError,
  settle,
} from './regression-helpers'
import { getModuleErrors } from './validate-module'
import type { Output } from './regression-helpers'

// Each output keeps the implementation of its own environment (and only the
// imports that implementation reads) and replaces the other one with a stub
// that throws. The compiler only rewrites calls it can resolve to a Start
// factory, through any chain of project modules.

const head = `import { createClientOnlyFn, createIsomorphicFn, createServerOnlyFn } from '@tanstack/react-start'\n`
type Wrap = (expression: string) => string

describe('environment-specific functions', () => {
  // Source: Waku vite-plugin-allow-server.test.ts "keeps only allowServer
  // dependencies and removes allowServer imports", "supports allowServer
  // aliasing and export specifiers"
  test('each output keeps the implementation of its environment and only its dependencies', async () => {
    const compiled =
      await compileAll(`import { createServerOnlyFn, createClientOnlyFn as clientOnly } from '@tanstack/react-start'
import { draw } from './chart.client'
import { query } from './db.server'
const shared = 1
const readDb = () => query(shared)
const serverValue = createServerOnlyFn(readDb)
export const clientValue = clientOnly(() => draw(shared))
export { serverValue as exposed }`)
    const stubs = {
      './chart.client': `export const draw = (x) => 'draw:' + x`,
      './db.server': `export const query = (x) => 'query:' + x`,
    }
    expect(importSources(compiled.client)).toEqual(['./chart.client'])
    const client = await evaluateModule(compiled.client, stubs)
    expect([client.clientValue(), settle(client.exposed)]).toEqual([
      'draw:1',
      serverOnlyError,
    ])
    for (const output of ['ssr', 'provider'] as const) {
      expect(importSources(compiled[output])).toEqual(['./db.server'])
    }
    const ssr = await evaluateModule(compiled.ssr, stubs)
    expect([settle(ssr.clientValue), ssr.exposed()]).toEqual([
      clientOnlyError,
      'query:1',
    ])
  })

  // Source: Waku vite-plugin-allow-server.test.ts "handles default allowServer
  // export", "stubs default exports while preserving allowServer dependencies"
  test.each([
    {
      code: `import { db } from './db.server'
export default createServerOnlyFn(() => db.x())`,
      client: serverOnlyError,
      server: 'db',
      clientImports: [],
    },
    {
      code: `import { chart } from './chart.client'
export default createClientOnlyFn(() => chart())`,
      client: 'chart',
      server: clientOnlyError,
      clientImports: ['./chart.client'],
    },
    {
      code: `import { db } from './db.server'
import { chart } from './chart.client'
export default createIsomorphicFn().server(() => db.x()).client(() => chart())`,
      client: 'chart',
      server: 'db',
      clientImports: ['./chart.client'],
    },
  ])(
    'a default-exported function: $code',
    async ({ code, client, server, clientImports }) => {
      const compiled = await compileAll(`${head}${code}`)
      expect(importSources(compiled.client)).toEqual(clientImports)
      expect(importSources(compiled.ssr)).not.toContain('./chart.client')
      const stubs = {
        './db.server': `export const db = { x: () => 'db' }`,
        './chart.client': `export const chart = () => 'chart'`,
      }
      expect(
        settle((await evaluateModule(compiled.client, stubs)).default),
      ).toBe(client)
      expect(settle((await evaluateModule(compiled.ssr, stubs)).default)).toBe(
        server,
      )
    },
  )

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
    expect(importSources(client!)).toEqual([])
    expect((await evaluateModule(client!)).default).toHaveProperty('server')
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

    // Records the implementation of each chain link.
    const chainOf = (links: Array<[string, any]>): Record<string, any> => {
      const link = (method: string) => (impl: unknown) =>
        chainOf([...links, [method, impl]])
      return {
        links,
        middleware: link('middleware'),
        validator: link('validator'),
        server: link('server'),
        client: link('client'),
      }
    }

    // The links an output keeps, each with the result of its implementation.
    async function runLinks(output: Output, code: string) {
      // The server output leaves a module without env-only code untouched.
      const compiled = (await compileCode(output, code, { id })) ?? code
      expect(await getModuleErrors(compiled, 'module.ts'), output).toEqual([])
      const { code: javascript } = await transformWithOxc(compiled, 'module.ts')
      const { mw } = await evaluateModule(javascript, {
        '@tanstack/react-start': { createMiddleware: () => chainOf([]) },
        './db.server': `export const db = { read: (key) => 'db:' + key }`,
        './check.server': `export const check = (data, key) => data + ':' + key`,
      })
      const links: Array<[string, unknown]> = []
      for (const [method, impl] of mw.links) {
        links.push([
          method,
          method === 'middleware'
            ? impl
            : await impl(
                method === 'validator' ? 'data' : { next: (opts: any) => opts },
              ),
        ])
      }
      return { compiled, links }
    }

    // Parentheses and each TypeScript wrapper are different AST nodes; the
    // last row nests three.
    const wrappers = [
      { name: 'parentheses', wrap: (x: string) => `(${x})` },
      { name: 'double parentheses', wrap: (x: string) => `((${x}))` },
      { name: 'as any', wrap: (x: string) => `(${x} as any)` },
      {
        name: 'as unknown as T',
        wrap: (x: string) => `(${x} as unknown as Middleware)`,
      },
      { name: 'satisfies', wrap: (x: string) => `(${x} satisfies unknown)` },
      { name: 'non-null', wrap: (x: string) => `${x}!` },
      { name: 'angle-bracket', wrap: (x: string) => `(<any>${x})` },
      {
        name: 'parentheses, as and non-null',
        wrap: (x: string) => `((${x}) as any)!`,
      },
    ]
    const serverResult = { context: 'db:SERVER_SECRET' }
    const clientResult = { sendContext: 'client' }

    // Regression in the Yuku migration, found by differential fuzzing and
    // confirmed in Vite and Rsbuild builds: when the wrapped part of the chain
    // ends with `.server()` and another link follows, the client compile
    // throws "Cannot replace a detached output node". `main` builds these.
    test.each(
      [
        {
          end: '.server()',
          chain: (wrap: Wrap) =>
            `${wrap(`createMiddleware({ type: 'function' })${serverLink}`)}${clientLink}`,
          clientLinks: [['client', clientResult]],
          ssrLinks: [
            ['server', serverResult],
            ['client', clientResult],
          ],
        },
        {
          end: '.server(), and the whole chain',
          chain: (wrap: Wrap) =>
            wrap(
              `${wrap(`createMiddleware({ type: 'function' })${serverLink}`)}${clientLink}`,
            ),
          clientLinks: [['client', clientResult]],
          ssrLinks: [
            ['server', serverResult],
            ['client', clientResult],
          ],
        },
        {
          end: '.middleware().validator().server()',
          chain: (wrap: Wrap) =>
            `${wrap(`createMiddleware({ type: 'function' }).middleware([])${validatorLink}${serverLink}`)}${clientLink}`,
          clientLinks: [
            ['middleware', []],
            ['client', clientResult],
          ],
          ssrLinks: [
            ['middleware', []],
            ['validator', 'data:VALIDATOR_SECRET'],
            ['server', serverResult],
            ['client', clientResult],
          ],
        },
      ].flatMap((chain) =>
        wrappers.map((wrapper) => ({ ...chain, ...wrapper })),
      ),
    )(
      'the client strips the server implementation when $name wraps the chain up to $end',
      async ({ chain, wrap, clientLinks, ssrLinks }) => {
        const code = middlewareModule(chain(wrap))
        const client = await runLinks('client', code)
        expect(importSources(client.compiled)).toEqual([])
        expect(client.compiled).not.toMatch(/SERVER_SECRET|VALIDATOR_SECRET/)
        expect(client.links).toEqual(clientLinks)
        expect((await runLinks('ssr', code)).links).toEqual(ssrLinks)
      },
    )

    // The validator only runs on the server. Source: Vite and Rsbuild builds
    // (main kept a wrapped validator link and its import in the client).
    test.each([
      { name: 'satisfies', wrap: (x: string) => `(${x} satisfies unknown)` },
      { name: 'as any', wrap: (x: string) => `(${x} as any)` },
    ])(
      'the client strips a validator link wrapped in $name',
      async ({ wrap }) => {
        const code = middlewareModule(
          `${wrap(`createMiddleware({ type: 'function' })${validatorLink}`)}${serverLink}${clientLink}`,
        )
        const client = await runLinks('client', code)
        expect(importSources(client.compiled)).toEqual([])
        expect(client.compiled).not.toMatch(/SERVER_SECRET|VALIDATOR_SECRET/)
        expect(client.links).toEqual([['client', clientResult]])
        expect((await runLinks('ssr', code)).links).toEqual([
          ['validator', 'data:VALIDATOR_SECRET'],
          ['server', serverResult],
          ['client', clientResult],
        ])
      },
    )
  })

  // Source: differential fuzzing and Vite and Rsbuild builds (main lost the
  // implementation of the wrapped link: the output that needs it returned
  // undefined).
  test.each([
    `(createIsomorphicFn().server(() => 'server') satisfies any).client(() => 'client')`,
    `(createIsomorphicFn().server(() => 'server') as any).client(() => 'client')`,
    `(createIsomorphicFn().client(() => 'client') as any).server(() => 'server')`,
  ])(
    'each output keeps its implementation of an isomorphic fn with a wrapped chain link: %s',
    async (chain) => {
      const code = `import { createIsomorphicFn } from '@tanstack/react-start'
export const fn = ${chain}`
      const results: Record<string, unknown> = {}
      for (const output of outputs) {
        const compiled = await compileCode(output, code)
        results[output] = (await evaluateModule(compiled!)).fn!()
      }
      expect(results).toEqual({
        client: 'client',
        ssr: 'server',
        provider: 'server',
      })
    },
  )

  // Source: Vite and Rsbuild builds. `main` left these calls untransformed:
  // the client bundle shipped the server implementation and its imports, and
  // ran it in the browser; a client-only fn ran during SSR.
  test.each(
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
    ].flatMap((row) =>
      [
        { name: 'as any', wrap: (x: string) => `(${x} as any)` },
        { name: 'non-null', wrap: (x: string) => `${x}!` },
      ].map((wrapper) => ({ ...row, ...wrapper })),
    ),
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
      expect(importSources(compiled.client)).not.toContain('./db.server')
      expect(compiled.client).not.toContain('SERVER_SECRET')
      expect(importSources(compiled.ssr)).not.toContain('./chart.client')
      expect(settle((await evaluateModule(compiled.client, stubs)).fn)).toBe(
        client,
      )
      expect(settle((await evaluateModule(compiled.ssr, stubs)).fn)).toBe(
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
    expect(settle(new client.Api().read(1))).toBe(serverOnlyError)
    const ssr = await evaluateModule(compiled.ssr)
    expect(new ssr.Api().read(1)()).toEqual(['s', 'base', 1])
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
    const stubs = {
      '@tanstack/react-start': {
        createMiddleware: () => ({ server: () => 'middleware' }),
      },
      './chart.client': `export const chart = { draw: () => 'drawn' }`,
      './db.server': `export const db = { x: () => 'x' }`,
    }
    const client = await compileCode('client', code)
    expect(importSources(client!)).toEqual(['./chart.client'])
    expect((await evaluateModule(client!, stubs)).iso()).toBe('drawn')
    const ssr = await compileCode('ssr', code)
    expect(importSources(ssr!)).toEqual(['./db.server'])
    const ssrModule = await evaluateModule(ssr!, stubs)
    expect([ssrModule.iso(), ssrModule.serverOnly(), ssrModule.mw]).toEqual([
      'x',
      'x',
      'middleware',
    ])
  })

  // Source: babel-dead-code-elimination "variable" > "within for...in"
  // Hook calls are different (dropping one changes the hook order); a plain
  // server call like these must go.
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
    expect(importSources(client!)).toEqual([])
    expect(client).not.toMatch(/\b(?:connect|serverCall)\b/)
    expect((await evaluateModule(client!)).getValue(true)).toBe('client')
  })

  // Source: SolidStart directives plugin.ts transformFunction (directive
  // functions nested in a server function are compiled too)
  test('the provider compiles env-specific functions inside a server fn handler', async () => {
    const provider = await compileCode(
      'provider',
      `import { createServerFn, createClientOnlyFn, createIsomorphicFn, createServerOnlyFn } from '@tanstack/react-start'
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
    return (error as Error).message
  }
}`,
    )
    expect(await getModuleErrors(provider!)).toEqual([])
    expect(importSources(provider!)).toEqual(['./db.server'])
    expect(
      await callProvider(provider!, 'fn', {
        './db.server': `export const db = { now: () => 'now', read: () => 'read' }`,
      }),
    ).toEqual([clientOnlyError.slice('throws: '.length), 'now', 'read'])
  })

  // Source: Waku vite-plugin-allow-server.test.ts "skips files without a use
  // client directive even if the string exists", "does not require
  // allowServer to come from waku/client" (inverted: only calls of the Start
  // imports are compiled)
  test.each([
    {
      name: 'only mentions the factories in strings and comments',
      code: `// createServerFn and createServerOnlyFn are not used here
export const label = 'createServerFn().handler(async () => 1)'
export const other = \`createClientOnlyFn(\${label})\``,
    },
    {
      name: 'calls .handler() on an object that is not a server fn',
      code: `import { api } from './api'
import { secret } from './secret.server'
export const route = api.handler(async () => secret())`,
    },
    {
      name: 'declares a function named like a factory',
      code: `function createServerOnlyFn<T>(fn: T) {
  return fn
}
export const value = createServerOnlyFn(() => 'mine')`,
    },
  ])('a module that $name is left untouched', async ({ code }) => {
    for (const output of outputs) {
      expect(await compileCode(output, code), output).toBeNull()
    }
  })

  // Source: Waku vite-plugin-allow-server.test.ts "does not require
  // allowServer to come from waku/client" (inverted)
  test.each(outputs)(
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
        wrap: module.wrap(identity)(),
        receiver: module.receiver({ createServerOnlyFn: identity })(),
        local: module.local()(),
        iso: module.iso(() => builder),
        mw: module.mw(() => ({ server: (fn: () => string) => fn() })),
        make: module.make(() => builder),
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

  // Source: Waku vite-plugin-allow-server.test.ts "throws when allowServer
  // receives zero arguments"
  test.each([
    {
      code: `export const none = createServerOnlyFn()`,
      error: 'createServerOnlyFn() must be called with a function!',
      rejectedBy: ['ssr', 'provider'],
    },
    {
      code: `export const none = createIsomorphicFn().server().client(() => 1)`,
      error:
        'createIsomorphicFn().server(func) must be called with a function!',
      rejectedBy: ['ssr', 'provider'],
    },
  ])(
    'a missing implementation is only rejected where it runs: $code',
    async ({ code, error, rejectedBy }) => {
      const rejected: Array<Output> = []
      for (const output of outputs) {
        await compileCode(output, `${head}${code}`).catch((thrown: Error) => {
          expect(thrown.message).toContain(error)
          rejected.push(output)
        })
      }
      expect(rejected).toEqual(rejectedBy)
    },
  )
})

describe('factories resolved through project modules', () => {
  test.each<{
    name: string
    output: Output
    files: Record<string, string>
    code: string
    imports: Array<string>
    serverFns: number
  }>([
    {
      name: 'a default-exported middleware builder imported as default',
      output: 'client',
      files: {
        '/test/src/mw.ts': `import { createMiddleware } from '@tanstack/react-start'
export default createMiddleware({ type: 'function' })`,
      },
      // Known limitation: middleware is detected by the
      // `createMiddleware` text, so a module that only calls an imported
      // builder is not compiled and needs this import.
      code: `import { createMiddleware } from '@tanstack/react-start'
import mw from './mw'
import { db } from './db.server'
export const logged = mw.server(async ({ next }) => {
  db.log()
  return next()
})`,
      imports: ['./mw'],
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
      imports: ['./builders'],
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
      imports:
        output === 'client' ? ['./factories'] : ['./db.server', './factories'],
      serverFns: 1,
    })),
    {
      name: 'renamed re-exports next to a type-only re-export',
      output: 'client',
      files: {
        '/test/src/f.ts': `export { createServerFn as csf, createServerOnlyFn as so } from '@tanstack/react-start'
export type { Register } from '@tanstack/react-start'`,
      },
      code: `import { csf, so } from './f'
import { db } from './db.server'
export const fn = csf().handler(async () => db.x())
export const s = so(() => db.y())`,
      imports: ['./f'],
      serverFns: 1,
    },
    {
      // Only createServerOnlyFn appears in the source text.
      name: 'an aliased re-export of createClientOnlyFn next to createServerOnlyFn',
      output: 'ssr',
      files: {
        '/test/src/env.ts': `export { createClientOnlyFn as clientOnly } from '@tanstack/react-start'`,
      },
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { clientOnly } from './env'
import { secret } from './secret.server'
import { readWindow } from './browser'
export const serverValue = createServerOnlyFn(() => secret())
export const clientValue = clientOnly(() => readWindow())`,
      imports: ['./secret.server'],
      serverFns: 0,
    },
  ])('$output: $name', async ({ output, files, code, imports, serverFns }) => {
    const compiled = await compileFor(output, code, { files })
    expect(await getModuleErrors(compiled.code!)).toEqual([])
    expect(importSources(compiled.code!)).toEqual(imports)
    expect(Object.keys(compiled.serverFns)).toHaveLength(serverFns)
  })

  // Source: @vitejs/plugin-rsc expand-export-all fixtures (per row)
  test.each<{
    name: string
    files: Record<string, string>
    code?: string
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
    {
      // expand-export-all/string-export-name
      name: 'string export names',
      files: {
        '/test/src/start.ts': `export { createServerFn as 'create server fn', createServerOnlyFn as 'server only' } from '@tanstack/react-start'`,
      },
      code: `import { 'create server fn' as createServerFn, 'server only' as createServerOnlyFn } from './start'`,
      resolvesServerOnlyFn: true,
    },
  ])(
    'an export * chain with $name',
    async ({
      files,
      code = `import { createServerFn, createServerOnlyFn } from './start'`,
      resolvesServerOnlyFn,
    }) => {
      const { code: client, serverFns } = await compileFor(
        'client',
        `${code}
import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())
export const serverOnly = createServerOnlyFn(() => 'server-only-marker')`,
        { files },
      )
      expect(await getModuleErrors(client!)).toEqual([])
      expect(Object.keys(serverFns)).toHaveLength(1)
      expect(importSources(client!)).toEqual(['./start'])
      expect(client!.includes('server-only-marker')).toBe(!resolvesServerOnlyFn)
    },
  )

  const factoryFiles = () => ({
    '/test/src/b.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()`,
    '/test/src/c.ts': `export * from './b'`,
  })
  const importer = `import { base } from './c'
import { db } from './db.server'
export const fn = base.handler(async () => db.x())`

  test('dev: modules reaching a factory through imports and export * are its transitive importers', async () => {
    const files = factoryFiles()
    const { compiler, compile } = createStartCompiler({
      env: 'client',
      mode: 'dev',
      files,
    })
    expect(await compile(importer, '/test/src/a.tsx')).not.toBeNull()
    compiler.ingestModule({
      id: '/test/src/d.ts',
      code: `import { base } from './c'\nexport const alias = base`,
    })
    // Bundlers may report the changed module with a query suffix.
    expect(
      [...(await compiler.getTransitiveImporters('/test/src/b.ts?v=1'))].sort(),
    ).toEqual(['/test/src/a.tsx', '/test/src/c.ts', '/test/src/d.ts'])
  })

  test('dev: invalidating a factory module recompiles its importers against the new code', async () => {
    const files = factoryFiles()
    const { compiler, compile } = createStartCompiler({
      env: 'client',
      mode: 'dev',
      files,
    })
    expect(await compile(importer, '/test/src/a.tsx')).not.toBeNull()
    files['/test/src/b.ts'] =
      `export const base = { handler: (fn: unknown) => fn }`
    // Only modules the compiler knew are reported, without their query.
    expect([
      ...compiler.invalidateModules([
        '/test/src/b.ts?v=2',
        '/test/src/missing.ts',
      ]),
    ]).toEqual(['/test/src/b.ts'])
    expect(await compile(importer, '/test/src/a.tsx')).toBeNull()
  })
})
