/**
 * Edge cases ported from the Next.js server actions transform fixtures
 * (vercel/next.js, MIT): crates/next-custom-transforms/tests/fixture/server-actions.
 * Each test names the fixture directories (`server-graph/N`, `client-graph/N`)
 * whose scenario it translates to `createServerFn`.
 */
import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../../src/start-compiler/config'
import { declarationOf, getModuleErrors } from '../validate-module'
import type { ServerFn } from '../../src/start-compiler/types'

type Output = 'client' | 'ssr' | 'provider'
const outputs: Array<Output> = ['client', 'ssr', 'provider']

async function compileFor(
  output: Output,
  code: string,
  mode: 'build' | 'dev' = 'build',
) {
  const env = output === 'client' ? 'client' : 'server'
  const serverFns: Record<string, ServerFn> = {}
  const compiler = new StartCompiler({
    env,
    envName: env === 'client' ? 'client' : 'ssr',
    root: '/test',
    framework: 'react',
    providerEnvName: 'ssr',
    mode,
    lookupKinds: getLookupKindsForEnv(env),
    lookupConfigurations: getLookupConfigurationsForEnv(env, 'react'),
    getKnownServerFns: () => ({}),
    devServerFnModuleSpecifierEncoder: ({ extractedFilename, root }) =>
      `/@id${extractedFilename.slice(root.length)}`,
    onServerFnsById: (fns) => Object.assign(serverFns, fns),
    loadModule: async () => {},
    resolveId: async (id) => (id.startsWith('@tanstack/') ? id : null),
  })
  const id = '/test/src/module.tsx'
  const result = await compiler.compile({
    code,
    id: output === 'provider' ? `${id}?tss-serverfn-split` : id,
    detectedKinds: detectKindsInCode(code, env),
  })
  return { code: result?.code ?? null, serverFns }
}

/** Compiles the client, SSR caller and provider outputs and validates each. */
async function compileAll(code: string) {
  const compiled = {} as Record<Output, string>
  const errors = {} as Record<Output, Array<string>>
  let serverFns: Record<string, ServerFn> = {}
  for (const output of outputs) {
    const result = await compileFor(output, code)
    expect(result.code, output).not.toBeNull()
    compiled[output] = result.code!
    errors[output] = await getModuleErrors(result.code!)
    if (output === 'client') {
      serverFns = result.serverFns
    }
  }
  expect(errors).toEqual({ client: [], ssr: [], provider: [] })
  const idOf = (functionName: string) =>
    Object.values(serverFns).find((fn) => fn.functionName === functionName)
      ?.functionId
  return { ...compiled, serverFns, idOf }
}

/** Matches the source of an import or re-export statement. */
const moduleSource =
  /^(\s*import\s*|\s*(?:import|export)\b[^;'"]*?\bfrom\s*)(["'])([^"']+)\2/gm

/** Project-local import sources of a module, sorted. */
function importSources(code: string) {
  return [...code.matchAll(moduleSource)]
    .map((match) => match[3]!)
    .filter((source) => !source.startsWith('@tanstack/'))
    .sort()
}

const dataUrl = (code: string) =>
  `data:text/javascript,${encodeURIComponent(code)}`

/**
 * Minimal Start runtime: callers keep the RPC they were given, providers run
 * the original handler through `__executeServer`.
 */
const startRuntime: Record<string, string> = {
  '@tanstack/react-start': `
const builder = () => {
  const self = {
    middleware: () => self,
    validator: () => self,
    inputValidator: () => self,
    handler: (rpc, impl) =>
      impl
        ? Object.assign((data) => impl({ data }), {
            __executeServer: (opts) => impl(opts),
          })
        : { rpc },
  }
  return self
}
export const createServerFn = builder`,
  '@tanstack/react-start/server-rpc': `export const createServerRpc = (meta, fn) => Object.assign(fn, { meta })`,
  '@tanstack/react-start/client-rpc': `export const createClientRpc = (id) => ({ client: id })`,
  '@tanstack/react-start/ssr-rpc': `export const createSsrRpc = (id) => ({ ssr: id })`,
}

/** Evaluates a compiled module, resolving every import to the given stubs. */
async function importModule(
  code: string,
  modules: Record<string, string> = {},
): Promise<Record<string, any>> {
  const sources = { ...startRuntime, ...modules }
  const { code: javascript } = await transformWithOxc(code, 'module.ts')
  const linked = javascript.replace(
    moduleSource,
    (_match, prefix: string, _quote: string, source: string) => {
      const stub = sources[source]
      if (stub === undefined) {
        throw new Error(`No stub for import ${source}`)
      }
      return `${prefix}${JSON.stringify(dataUrl(stub))}`
    },
  )
  return import(/* @vite-ignore */ dataUrl(linked))
}

/** Runs a provider's extracted handler the way the server-fn router does. */
async function callProvider(
  provider: string,
  name: string,
  modules: Record<string, string> = {},
  data?: unknown,
) {
  const module = await importModule(provider, modules)
  const handler = module[`${name}_createServerFn_handler`]
  expect(handler, name).toBeTypeOf('function')
  return handler({ data })
}

const dbServer = `export const db = {
  x: () => 'x', y: () => 'y', z: () => 'z', w: () => 'w',
  a: () => 'a', b: () => 'b', rand: () => 1,
}`

describe('ported Next.js server actions fixtures', () => {
  // server-graph/5, server-graph/6, server-graph/16
  test('a handler keeps every kind of module binding it closes over', async () => {
    const { client, ssr, provider } = await compileAll(`
import { createServerFn } from '@tanstack/react-start'
import ANYTHING from './anything'
import f, { f1, f2 as f2alias } from './foo'
import * as ns from './ns'
const f3 = 1
var f4 = 4
let f5 = 5
const [f6, [f7, ...f8], { f9 }, { f10, f11: [f12], f13: f14, f15: { f16 }, ...f17 }, ...f18] = ANYTHING
function helper() {
  return f3
}
class Repo {
  static get() {
    return f4
  }
}
enum Role {
  Admin = 'admin',
}
if (true) {
  const g19 = 1
}
export function bump() {
  f5++
}
export const fn = createServerFn().handler(async () => {
  const f3 = 'shadow'
  return [f, f1, f2alias, ns.x, f3, f4, f5, f6, f7, f8, f9, f10, f12, f14, f16, f17, f18, helper(), Repo.get(), Role.Admin, typeof g19]
})`)
    for (const caller of [client, ssr]) {
      expect(importSources(caller)).toEqual([])
      expect(caller).not.toContain('shadow')
      // still used by the exported `bump`
      expect(caller).toMatch(declarationOf('f5'))
    }
    expect(
      await callProvider(provider, 'fn', {
        './anything': `export default [6, [7, 8, 8.5], { f9: 9 }, { f10: 10, f11: [12], f13: 14, f15: { f16: 16 }, extra: 17 }, 18, 18.5]`,
        './foo': `export default 'f'; export const f1 = 'f1'; export const f2 = 'f2'`,
        './ns': `export const x = 'x'`,
      }),
    ).toEqual([
      'f',
      'f1',
      'f2',
      'x',
      'shadow',
      4,
      5,
      6,
      7,
      [8, 8.5],
      9,
      10,
      12,
      14,
      16,
      { extra: 17 },
      [18, 18.5],
      1,
      4,
      'admin',
      'undefined',
    ])
  })

  test.each<{
    name: string
    code: string
    expected: unknown
    read?: (value: any) => Promise<unknown>
  }>([
    {
      // server-graph/7, server-graph/44
      name: 'a named function expression',
      code: `export const fn = createServerFn().handler(async function deleteItem() {
  return deleteItem.name + db.x()
})`,
      expected: 'deleteItemx',
    },
    {
      // server-graph/59
      name: 'a function using this, arguments and new.target',
      code: `export const fn = createServerFn().handler(async function (this: unknown) {
  return [typeof this, arguments.length, new.target === undefined, db.x()]
})`,
      expected: ['undefined', 1, true, 'x'],
    },
    {
      // server-graph/14 (nested functions), streaming handlers
      name: 'an async generator',
      code: `export const fn = createServerFn().handler(async function* () {
  yield db.x()
  yield 'done'
})`,
      read: async (iterator: AsyncIterable<unknown>) => {
        const values: Array<unknown> = []
        for await (const value of iterator) {
          values.push(value)
        }
        return values
      },
      expected: ['x', 'done'],
    },
    {
      // server-graph/31
      name: 'an object literal method',
      code: `export const fn = createServerFn().handler({
  async f() {
    return (() => db.a())()
  },
}.f)`,
      expected: 'a',
    },
    {
      // server-graph/31
      name: 'a class expression method',
      code: `export const fn = createServerFn().handler(new (class X {
  async f() {
    return db.b()
  }
})().f)`,
      expected: 'b',
    },
    {
      // server-graph/21, server-graph/26
      name: 'a wrapper call',
      code: `import { withAuth } from './auth.server'
export const fn = createServerFn().handler(withAuth(async () => db.x()))`,
      expected: 'auth:x',
    },
    {
      // server-graph/25
      name: 'a function declared after the server fn',
      code: `export const fn = createServerFn().handler(impl)
async function impl() {
  return inner()
  async function inner() {
    return db.x()
  }
}`,
      expected: 'x',
    },
    {
      // server-graph/14, server-graph/28, server-graph/58
      name: 'a handler with nested and hoisted functions',
      code: `function make(start: number) {
  return () => start + db.rand()
}
export const fn = createServerFn().handler(async () => {
  const g = make(1)
  return [g(), await bar(), (function baz() { return baz.name })()]
  async function bar() {
    return db.x()
  }
})`,
      expected: [2, 'x', 'baz'],
    },
    {
      // server-graph/28, server-graph/30
      name: 'a handler calling a server fn declared later',
      code: `export const fn = createServerFn().handler(async () => (await later()) + db.x())
export const later = createServerFn().handler(async () => 'later:')`,
      expected: 'later:x',
    },
    {
      name: 'a parenthesized non-null initializer',
      code: `export const fn = (createServerFn().handler(async () => db.x()))!`,
      expected: 'x',
    },
  ])(
    'the handler can be $name',
    async ({ code, expected, read = async (value) => value }) => {
      const compiled =
        await compileAll(`import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
${code}`)
      for (const caller of [compiled.client, compiled.ssr]) {
        expect(importSources(caller)).toEqual([])
        expect(caller).not.toMatch(/\bdb\.|withAuth/)
      }
      const value = await callProvider(compiled.provider, 'fn', {
        './db.server': dbServer,
        './auth.server': `export const withAuth = (fn) => async (opts) => 'auth:' + (await fn(opts))`,
      })
      expect(await read(value)).toEqual(expected)
    },
  )

  // server-graph/6 (shadowed bindings in nested scopes)
  test.each([
    {
      name: 'a handler local shadows an import the client uses',
      code: `import { db } from './db.server'
import { format } from './format'
export const label = format('x')
export const fn = createServerFn().handler(async () => {
  const format = (value: unknown) => \`local:\${value}\`
  return format(db.x())
})`,
      client: ['./format'],
      provider: ['./db.server'],
      expected: 'local:x',
    },
    {
      name: 'a client local shadows an import the handler uses',
      code: `import { db } from './db.server'
export function view() {
  const db = 'local'
  return db
}
export const fn = createServerFn().handler(async () => db.x())`,
      client: [],
      provider: ['./db.server'],
      expected: 'x',
    },
    {
      name: 'a handler parameter shadows an import the client uses',
      code: `import { db } from './db.server'
export const fn = createServerFn().handler(async ({ data: db }: { data: string }) => db)
export const leaked = db`,
      client: ['./db.server'],
      provider: [],
      expected: 'param',
    },
  ])('$name', async ({ code, client, provider, expected }) => {
    const compiled = await compileAll(
      `import { createServerFn } from '@tanstack/react-start'\n${code}`,
    )
    expect(importSources(compiled.client)).toEqual(client)
    expect(importSources(compiled.provider)).toEqual(provider)
    expect(
      await callProvider(
        compiled.provider,
        'fn',
        { './db.server': dbServer },
        'param',
      ),
    ).toBe(expected)
  })

  // server-graph/6 (destructuring patterns), client-graph/3
  test.each<{
    name: string
    code: string
    modules: Record<string, string>
    clientValue: unknown
    handlerValue: unknown
  }>([
    {
      name: 'an array pattern',
      code: `import { values } from './values'
const [serverOnly, shared] = values
export const clientValue = shared
export const fn = createServerFn().handler(async () => serverOnly)`,
      modules: { './values': `export const values = ['server', 'shared']` },
      clientValue: 'shared',
      handlerValue: 'server',
    },
    {
      name: 'an object pattern whose rest the client uses',
      code: `import { config } from './config'
const { secretKey, ...publicConfig } = config
export const clientValue = publicConfig
export const fn = createServerFn().handler(async () => secretKey)`,
      modules: {
        './config': `export const config = { secretKey: 'key', theme: 'dark' }`,
      },
      clientValue: { theme: 'dark' },
      handlerValue: 'key',
    },
    {
      name: 'an object pattern whose rest the handler uses',
      code: `import { config } from './config'
const { publicKey, ...serverConfig } = config
export const clientValue = publicKey
export const fn = createServerFn().handler(async () => serverConfig)`,
      modules: {
        './config': `export const config = { publicKey: 'public', token: 'token' }`,
      },
      clientValue: 'public',
      handlerValue: { token: 'token' },
    },
  ])(
    'a destructuring shared by the client and $name keeps its values',
    async ({ code, modules, clientValue, handlerValue }) => {
      const compiled = await compileAll(
        `import { createServerFn } from '@tanstack/react-start'\n${code}`,
      )
      const client = await importModule(compiled.client, modules)
      expect(client.clientValue).toEqual(clientValue)
      expect(await callProvider(compiled.provider, 'fn', modules)).toEqual(
        handlerValue,
      )
    },
  )

  // Regression in the Yuku compiler (#8504): when one binding of a
  // destructuring is live, every sibling is kept. A default value or computed
  // key of a handler-only binding then keeps its server-only import in the
  // client output (main prunes that element). Impact: the server module ships
  // in the client bundle, or import protection fails the build.
  // server-graph/6 (destructuring patterns), server-graph/43
  test.each([
    {
      name: 'an object pattern default',
      code: `import { readSecret } from './secrets.server'
const { apiKey = readSecret(), theme } = config
export const fn = createServerFn().handler(async () => apiKey)`,
    },
    {
      name: 'an array pattern default',
      code: `import { readSecret } from './secrets.server'
const [apiKey = readSecret(), theme] = config.list
export const fn = createServerFn().handler(async () => apiKey)`,
    },
    {
      name: 'a computed key',
      code: `import { secretKeyName } from './secrets.server'
const { [secretKeyName]: apiKey, theme } = config
export const fn = createServerFn().handler(async () => apiKey)`,
    },
    {
      name: 'a nested pattern default',
      code: `import { readSecret } from './secrets.server'
const { db: { password = readSecret() } = {}, theme } = config
export const fn = createServerFn().handler(async () => password)`,
    },
    {
      name: 'a function default',
      code: `import { db } from './secrets.server'
const { query = () => db.query(), theme } = config
export const fn = createServerFn().handler(async () => query())`,
    },
  ])(
    'the client does not keep a server import read by $name of a handler-only binding',
    async ({ code }) => {
      const compiled =
        await compileAll(`import { createServerFn } from '@tanstack/react-start'
import { config } from './config'
${code}
export const currentTheme = theme`)
      expect(importSources(compiled.client)).toEqual(['./config'])
      const client = await importModule(compiled.client, {
        './config': `export const config = { theme: 'dark', list: [undefined, 'dark'] }`,
      })
      expect(client.currentTheme).toBe('dark')
    },
  )

  // server-graph/8, server-graph/3, server-graph/4
  describe('directives', () => {
    test('handler directives stay in the provider and leave the callers', async () => {
      const { client, ssr, provider } =
        await compileAll(`import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async function () {
  // comment
  'use strict'
  'use server'
  return 1
})`)
      for (const caller of [client, ssr]) {
        expect(caller).not.toMatch(/use (?:strict|server)/)
      }
      expect(provider).toMatch(
        /async function\s*\(\)\s*\{\s*\/\/ comment\s*['"]use strict['"];?\s*['"]use server['"]/,
      )
      expect(await callProvider(provider, 'fn')).toBe(1)
    })

    test.each([
      { directive: 'use client', code: `'use client'` },
      { directive: 'use server', code: `// app/send.ts\n'use server'` },
    ])(
      'a module $directive directive stays first in the callers',
      async ({ directive, code }) => {
        const { client, ssr } = await compileAll(`${code}
import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 1)`)
        for (const caller of [client, ssr]) {
          expect(caller).toMatch(
            new RegExp(String.raw`^(?:\s*//[^\n]*\n)*\s*['"]${directive}['"]`),
          )
        }
      },
    )
  })

  // server-graph/9, server-graph/12, server-graph/13, server-graph/17,
  // server-graph/29, server-graph/66, server-graph/69, client-graph/4,
  // client-graph/15
  test('server fns keep every export form in the callers and only the handlers in the provider', async () => {
    const compiled =
      await compileAll(`import { createServerFn } from '@tanstack/react-start'
const a = createServerFn().handler(async () => 'a')
const b = createServerFn().handler(async () => 'b')
const c = createServerFn().handler(async () => 'c')
const d = createServerFn().handler(async () => 'd')
export const e = createServerFn().handler(async () => 'e'),
  f = createServerFn().handler(async () => 'f'),
  notAServerFn = 1
export let g = createServerFn().handler(async () => 'g')
export var h = createServerFn().handler(async () => 'h')
const async = createServerFn().handler(async () => 'async')
const from = createServerFn().handler(async () => 'from')
export { a, b as renamed, c as '📙', d as default, async, from as as, a as alsoA }`)
    const exported = {
      a: 'a',
      alsoA: 'a',
      renamed: 'b',
      '📙': 'c',
      default: 'd',
      e: 'e',
      f: 'f',
      g: 'g',
      h: 'h',
      async: 'async',
      as: 'from',
    }
    for (const [output, rpc] of [
      ['client', 'client'],
      ['ssr', 'ssr'],
    ] as const) {
      const module = await importModule(compiled[output])
      expect(Object.keys(module).sort()).toEqual(
        [...Object.keys(exported), 'notAServerFn'].sort(),
      )
      for (const [name, local] of Object.entries(exported)) {
        expect(module[name], `${output} ${name}`).toEqual({
          rpc: { [rpc]: compiled.idOf(`${local}_createServerFn_handler`) },
        })
      }
    }
    const locals = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'async', 'from']
    const provider = await importModule(compiled.provider)
    expect(Object.keys(provider).sort()).toEqual(
      locals.map((local) => `${local}_createServerFn_handler`).sort(),
    )
    for (const local of locals) {
      const handler = provider[`${local}_createServerFn_handler`]
      expect(handler.meta).toEqual({
        id: compiled.idOf(`${local}_createServerFn_handler`),
        name: local,
        filename: 'src/module.tsx',
      })
      expect(await handler({})).toBe(local)
    }
  })

  // server-graph/66, client-graph/15 (non-ASCII names)
  test('non-ASCII and symbol-like server fn names', async () => {
    const names = ['ñandú', '𝑓', 'ᾩ', '$', '_', '$fn']
    const code = `import { createServerFn } from '@tanstack/react-start'
${names.map((name) => `export const ${name} = createServerFn().handler(async () => '${name}')`).join('\n')}`
    const compiled = await compileAll(code)
    expect(
      Object.values(compiled.serverFns)
        .map((fn) => fn.functionName)
        .sort(),
    ).toEqual(names.map((name) => `${name}_createServerFn_handler`).sort())
    const provider = await importModule(compiled.provider)
    for (const name of names) {
      const handler = provider[`${name}_createServerFn_handler`]
      expect(handler.meta.name).toBe(name)
      expect(await handler({})).toBe(name)
    }

    const dev = await compileFor('client', code, 'dev')
    expect(
      Object.keys(dev.serverFns)
        .map(
          (id) =>
            JSON.parse(Buffer.from(id, 'base64url').toString('utf8')).export,
        )
        .sort(),
    ).toEqual(names.map((name) => `${name}_createServerFn_handler`).sort())
  })

  // client-graph vs server-graph split, server-graph/47, server-graph/58
  test('client-only and server-only code next to a server fn reach only their side', async () => {
    const compiled = await compileAll(`import {
  createClientOnlyFn,
  createIsomorphicFn,
  createMiddleware,
  createServerFn,
  createServerOnlyFn,
} from '@tanstack/react-start'
import { useState } from 'react'
import { chart } from './chart.client'
import { db } from './db.server'
import { schema } from './schema.server'
export const draw = createClientOnlyFn(() => chart())
export const now = createIsomorphicFn()
  .server(() => db.now())
  .client(() => chart())
const readSecret = createServerOnlyFn(() => db.secret())
const auth = createMiddleware({ type: 'function' })
  .client(async ({ next }) => next())
  .server(async ({ next }) => next({ context: { user: await db.user() } }))
export const fn = createServerFn()
  .middleware([auth])
  .validator((data: unknown) => schema.parse(data))
  .handler(async () => readSecret())
export function Page() {
  const [count] = useState(0)
  return <button onClick={() => draw()}>{count}</button>
}`)
    expect(importSources(compiled.client)).toEqual(['./chart.client', 'react'])
    expect(importSources(compiled.ssr)).toEqual([
      './db.server',
      './schema.server',
      'react',
    ])
    expect(importSources(compiled.provider)).toEqual([
      './db.server',
      './schema.server',
    ])
    expect(compiled.provider).not.toContain('Page')
  })

  // server-graph/60, server-graph/62, server-graph/68, server-graph/72
  test('TypeScript-only exports next to a server fn', async () => {
    const { provider } =
      await compileAll(`import { createServerFn } from '@tanstack/react-start'
import type { Stuff } from './stuff'
export type X = string
export { type A } from './a'
export type { B } from './b'
export type * from './c'
export type { Foo }
type Foo = string
export interface I {}
export enum E {
  A = 'a',
}
export declare const declared: number
export default interface D {}
export const fn = createServerFn().handler(async (): Promise<Stuff | string> => E.A)`)
    expect(provider).toMatch(/export\s*\{\s*fn_createServerFn_handler\s*\}/)
    expect(await callProvider(provider, 'fn')).toBe('a')
  })

  // client-graph/2
  test('side-effect imports and top-level statements stay in every output', async () => {
    const compiled =
      await compileAll(`import { createServerFn } from '@tanstack/react-start'
import './polyfill'
console.log('side effect')
const foo = createServerFn().handler(async () => 'function body')
export { foo }`)
    for (const output of outputs) {
      expect(compiled[output]).toMatch(/import\s*['"]\.\/polyfill['"]/)
      expect(compiled[output]).toContain(`console.log('side effect')`)
    }
  })

  // client-graph/1, server-graph/10, server-graph/11, server-graph/15
  test.each([
    `export default async function () {\n  return fn()\n}`,
    `export default async () => fn()`,
    `export default class {\n  call() {\n    return fn()\n  }\n}`,
  ])('an anonymous default export next to a server fn: %s', async (code) => {
    const { provider } =
      await compileAll(`import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 1)
${code}`)
    expect(await callProvider(provider, 'fn')).toBe(1)
  })

  // server-graph/43
  test('values only the handler reads stay out of the callers', async () => {
    const compiled =
      await compileAll(`import { createServerFn } from '@tanstack/react-start'
const secret = 'my password is qwerty123'
const derived = secret.toUpperCase()
const url = process.env.DATABASE_URL
export const fn = createServerFn().handler(async () => [secret, derived, typeof url])`)
    for (const caller of [compiled.client, compiled.ssr]) {
      expect(caller).not.toMatch(/qwerty123|DATABASE_URL/)
    }
    expect(await callProvider(compiled.provider, 'fn')).toEqual([
      'my password is qwerty123',
      'MY PASSWORD IS QWERTY123',
      process.env.DATABASE_URL === undefined ? 'undefined' : 'string',
    ])
  })

  // server-graph/27
  test('exported helpers the handler uses stay declared in the provider', async () => {
    const { provider } =
      await compileAll(`import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export async function load() {
  return db.x()
}
export default function helper() {
  return db.y()
}
export class Repo {
  static z() {
    return db.z()
  }
}
const local = () => db.w()
export { local as alias }
export const fn = createServerFn().handler(async () => [await load(), helper(), Repo.z(), local()])`)
    for (const name of ['load', 'helper', 'Repo', 'local']) {
      expect(provider).toMatch(declarationOf(name))
    }
    const module = await importModule(provider, { './db.server': dbServer })
    expect(Object.keys(module)).toEqual(['fn_createServerFn_handler'])
    expect(await module.fn_createServerFn_handler({})).toEqual([
      'x',
      'y',
      'z',
      'w',
    ])
  })
})
