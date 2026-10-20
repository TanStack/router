import { describe, expect, test, vi } from 'vitest'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  callFromClient,
  callProvider,
  callServerFnThroughCallers,
  compileAll,
  compileCode,
  evaluateModule,
  evaluateProvider,
  moduleLoads,
} from '../regression-helpers'
import type { ModuleStub } from '../regression-helpers'

// The client replaces a server fn handler with an RPC, then drops the module
// code only the handler read, so server-only imports never reach it. Code the
// client still reads must survive with its values. The SSR caller may do the
// same or keep the handler in place: calling the server fn from it runs the
// handler either way. "Drops" is observed as loading: the module the client
// output loads when it is evaluated (`moduleLoads`), never as an inventory
// of its import declarations (FIX-PLAN S06).

const head = `import { createServerFn } from '@tanstack/react-start'\n`
const dbServer = `export const db = { x: () => 'x' }`

describe('callers drop a server import only the handler reads', () => {
  // Source: Next.js server-actions fixtures server-graph/6 (shadowed bindings)
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
      forbidden: ['./db.server'],
      check: async (client: string) =>
        expect(
          (
            await evaluateModule(client, {
              './format': { format: (value: string) => `format:${value}` },
            })
          ).label,
        ).toBe('format:x'),
      expected: 'local:x',
    },
    {
      // The client reads the server module itself (`clientDb`): it stays.
      name: 'a handler parameter shadows an import the client uses',
      code: `import { db } from './db.server'
export const fn = createServerFn().handler(async ({ data: db }: { data: string }) => db)
export const clientDb = db`,
      forbidden: [],
      check: async (client: string) => {
        const db = { x: () => 'x' }
        expect(
          (await evaluateModule(client, { './db.server': { db } })).clientDb,
        ).toBe(db)
      },
      expected: 'param',
    },
  ])('when $name', async ({ code, forbidden, check, expected }) => {
    const compiled = await compileAll(`${head}${code}`)
    expectNotLoaded(await moduleLoads(compiled.client), forbidden)
    await check(compiled.client)
    expect(
      await callProvider(compiled, 'fn', { './db.server': dbServer }, 'param'),
    ).toBe(expected)
  })

  // Each snippet uses the name `db` in a position that is not a reference to
  // the import the handler reads.
  test.each<{
    name: string
    code: string
    stubs?: Record<string, ModuleStub>
    check?: (client: Record<string, any>) => void
  }>([
    {
      // Source: @vitejs/plugin-rsc scope/label.js
      name: 'a label',
      code: `export function loop() {
  db: for (const item of [1, 2]) {
    if (item) {
      break db
    }
  }
  return 'loop'
}`,
      check: (client) => expect(client.loop()).toBe('loop'),
    },
    {
      // Source: @vitejs/plugin-rsc scope/object-expr-vs-pattern.js
      name: 'an object key and a pattern key',
      code: `export const options = { db: 'key' }
export const pick = ({ db: local }) => local`,
      check: (client) => expect(client.pick(client.options)).toBe('key'),
    },
    {
      // Source: @vitejs/plugin-rsc scope/member-expr.js
      name: 'a member property',
      code: `export const read = (object) => object.db`,
      check: (client) => expect(client.read({ db: 'member' })).toBe('member'),
    },
    {
      // Source: @vitejs/plugin-rsc scope/method-definition.js,
      // scope/property-definition.js; typescript-eslint private-identifier.js
      name: 'method, field and private names',
      code: `export const api = { db() { return 'method' } }
export class Store {
  db = 'field'
  #db = 'private'
  static db() {
    return 'static'
  }
  read() {
    return [this.db, this.#db]
  }
}`,
      check: (client) => {
        expect(client.api.db()).toBe('method')
        expect(client.Store.db()).toBe('static')
        expect(new client.Store().read()).toEqual(['field', 'private'])
      },
    },
    {
      // Source: @vitejs/plugin-rsc scope/export-specifier.js
      name: 'an export alias',
      code: `const local = 'alias'
export { local as db }`,
      check: (client) => expect(client.db).toBe('alias'),
    },
    {
      // Source: @vitejs/plugin-rsc scope/destructuring-assignment.js
      name: 'a destructuring assignment key',
      code: `let bound
;({ db: bound } = { db: 'assigned' })
export { bound }`,
      check: (client) => expect(client.bound).toBe('assigned'),
    },
    {
      // Source: @vitejs/plugin-rsc scope/catch-param.js
      name: 'a catch parameter',
      code: `export function safe() {
  try {
    throw 'caught'
  } catch (db) {
    return db
  }
}`,
      check: (client) => expect(client.safe()).toBe('caught'),
    },
    {
      // Source: @vitejs/plugin-rsc scope/fn-expr-name.js, scope/class-expr-self.js
      name: 'function and class expression names',
      code: `export const self = function db() {
  return db
}
export const Self = class db {
  static self() {
    return db
  }
}`,
      check: (client) => {
        expect(client.self()).toBe(client.self)
        expect(client.Self.self()).toBe(client.Self)
      },
    },
    {
      // Source: @vitejs/plugin-rsc scope/var-hoisting.js, scope/fn-decl-hoisting.js
      name: 'hoisted var and function declarations',
      code: `export function hoistedVar() {
  {
    var db = 'var'
  }
  return db
}
export function hoistedFunction() {
  return db()
  function db() {
    return 'function'
  }
}`,
      check: (client) => {
        expect(client.hoistedVar()).toBe('var')
        expect(client.hoistedFunction()).toBe('function')
      },
    },
    {
      // Source: @vitejs/plugin-rsc scope/let-const-block.js,
      // scope/shadowing-block.js; typescript-eslint block/scope.js
      name: 'loop, switch and static block declarations',
      code: `export function loops() {
  const out = []
  for (let db = 0; db < 1; db++) out.push(db)
  for (const db of ['of']) out.push(db)
  for (const db in { in: 1 }) out.push(db)
  return out
}
export function choose(key) {
  switch (key) {
    case 1:
      return 'one'
    default:
      const db = 'switch'
      return db
  }
}
export class Block {
  static value
  static {
    const db = 'static'
    Block.value = db
  }
}`,
      check: (client) => {
        expect(client.loops()).toEqual([0, 'of', 'in'])
        expect(client.choose(2)).toBe('switch')
        expect(client.Block.value).toBe('static')
      },
    },
    {
      // Source: @vitejs/plugin-rsc scope/destructured-params.js,
      // scope/param-defaults.js; typescript-eslint readable-ref-param-shadow.js
      name: 'parameters, accessor parameters and defaults reading them',
      code: `export const params = (db, other = db) => other
export const accessors = {
  stored: '',
  set value(db) {
    this.stored = db
  },
}
export function rest(...db) {
  return db
}`,
      check: (client) => {
        expect(client.params('param')).toBe('param')
        client.accessors.value = 'set'
        expect(client.accessors.stored).toBe('set')
        expect(client.rest(1, 2)).toEqual([1, 2])
      },
    },
    {
      // Source: @vitejs/plugin-rsc scope/import-meta.js
      name: 'an import.meta property',
      code: `export const meta = typeof import.meta.db`,
      check: (client) => expect(client.meta).toBe('undefined'),
    },
    {
      // Source: @vitejs/plugin-rsc hoist/reexport-import-not-bound.js
      name: 'a re-export',
      code: `export { db } from './other'`,
      stubs: { './other': `export const db = 'other'` },
      check: (client) => expect(client.db).toBe('other'),
    },
    {
      // Source: typescript-eslint ts-module/namespace.js, ts-module/scope.js
      name: 'a namespace member',
      code: `export namespace Repo {
  export const db = 'namespace'
  export const read = () => db
}`,
      check: (client) => expect(client.Repo.read()).toBe('namespace'),
    },
    {
      // Source: typescript-eslint type-declaration/interface1.js, type1.js,
      // function-declaration/type-parameters
      name: 'type positions',
      code: `export interface Row {
  db: string
}
export type Shape = { db: number }
export function identity<db>(value: db): db {
  return value
}`,
      check: (client) => expect(client.identity('id')).toBe('id'),
    },
    {
      // Source: typescript-eslint jsx/attribute.js, jsx/namespaced-attribute.js,
      // jsx/component-intrinsic-name.js, jsx/this-jsxidentifier.js
      name: 'JSX attribute names, intrinsic tags and this members',
      code: `export const element = <svg db="attribute" xlink:db="namespaced" />
export const intrinsic = <db />
export const namespaced = <db:tag />
export class View {
  db = () => null
  render() {
    return <this.db />
  }
}`,
    },
  ])(
    'when client code uses its name in $name',
    async ({ code, stubs = {}, check }) => {
      const client = await compileCode(
        'client',
        `${head}import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())
${code}`,
      )
      expect(await getModuleErrors(client!)).toEqual([])
      expectNotLoaded(await moduleLoads(client!, { stubs }), ['./db.server'])
      check?.(await evaluateModule(client!, stubs))
    },
  )

  // Bug: these TypeScript positions named like the import (an enum member,
  // an overload signature parameter, a constructor parameter property) count
  // as references to it, so the callers keep the server-only import after
  // the handler that read it is gone.
  // Impact: the client loads the server-only module (its top-level code
  // runs in the browser).
  // Source: #8504 caller-dead-code.test.ts (typescript-eslint scope fixtures;
  // red on main)
  test.fails.each<{
    name: string
    code: string
    check: (client: Record<string, any>) => void
  }>([
    {
      // Source: typescript-eslint ts-enum/member-ref.js; #8504
      // caller-dead-code.test.ts
      name: 'an enum member',
      code: `export enum Flags {
  db = 1,
  other = db + 1,
}`,
      check: (client) => expect(client.Flags.other).toBe(2),
    },
    {
      // Source: typescript-eslint functions/function-declaration/overload.js;
      // #8504 caller-dead-code.test.ts
      name: 'an overload signature parameter',
      code: `export function call(db: string): string
export function call(value: string) {
  return value
}`,
      check: (client) => expect(client.call('call')).toBe('call'),
    },
    {
      // Source: typescript-eslint class/declaration/parameter-properties.js;
      // #8504 caller-dead-code.test.ts
      name: 'a parameter property',
      code: `export class Service {
  constructor(private db: string) {}
  read() {
    return this.db
  }
}`,
      check: (client) =>
        expect(new client.Service('param').read()).toBe('param'),
    },
  ])('when client code uses its name in $name', async ({ code, check }) => {
    const client = await compileCode(
      'client',
      `${head}import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())
${code}`,
    )
    expect(await getModuleErrors(client!)).toEqual([])
    expectNotLoaded(await moduleLoads(client!), ['./db.server'])
    check(await evaluateModule(client!))
  })

  // Source: SolidStart compile.spec.ts "removes an import when only type
  // specifiers remain", "preserves live value specifiers from a mixed
  // import"; babel-dead-code-elimination "import" > "mixed default and named"
  test.each([
    {
      name: 'only type specifiers remain',
      code: `import { type Session, verify } from './server-module'`,
      client: [],
      value: undefined,
    },
    {
      name: 'a named client specifier remains',
      code: `import verify, { type Session, clientValue } from './server-module'
export const value = clientValue`,
      client: ['./server-module'],
      value: 'client',
    },
    {
      name: 'a default client specifier remains',
      code: `import clientDefault, { type Session, verify } from './server-module'
export const value = clientDefault`,
      client: ['./server-module'],
      value: 'default',
    },
  ])(
    'when it shares a mixed import in which $name',
    async ({ code, client, value }) => {
      const compiled = await compileAll(`${head}${code}
export const fn = createServerFn().handler(async (): Promise<Session | null> => verify())`)
      // The server module loads only for a value the client reads.
      const loads = await moduleLoads(compiled.client)
      if (client.length === 0) {
        expectNotLoaded(loads, ['./server-module'])
      }
      // `verify` is the default export where the module imports it as such.
      const verify = `() => 'verified'`
      const stubs = {
        './server-module': `export const clientValue = 'client'
export const verify = ${verify}
export default ${code.startsWith('import verify') ? verify : `'default'`}`,
      }
      expect((await evaluateModule(compiled.client, stubs)).value).toBe(value)
      expect(
        await callServerFnThroughCallers(
          compiled,
          (module) => module.fn,
          stubs,
        ),
      ).toBe('verified')
    },
  )

  // The client keeps the middleware's `.client()` (its send context reaches
  // the server) and drops the imports only its `.server()` and the server
  // fn's validator read; the server runs both before the handler.
  // Source: Next.js server-actions fixtures server-graph/47, /58
  test('when the handler only reads it through a validator or a middleware', async () => {
    const compiled =
      await compileAll(`import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
import { schema } from './schema.server'
const auth = createMiddleware({ type: 'function' })
  .client(async ({ next }) => next({ sendContext: { from: 'client' } }))
  .server(async ({ next }) => next({ context: { user: await db.user() } }))
export const fn = createServerFn({ method: 'POST' })
  .middleware([auth])
  .validator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => [data, context.user, context.from])`)
    expectNotLoaded(await moduleLoads(compiled.client), [
      './db.server',
      './schema.server',
    ])
    const calls: Array<string> = []
    const stubs = {
      './db.server': {
        db: { user: () => (calls.push('db.user'), 'user') },
      },
      './schema.server': {
        schema: {
          parse: (data: unknown) => (calls.push('schema.parse'), `${data}!`),
        },
      },
    }
    expect(
      await callFromClient(compiled, (module) => module.fn, 'data', stubs),
    ).toEqual(['data!', 'user', 'client'])
    expect(calls).toEqual(['db.user', 'schema.parse'])
  })

  // The validator only runs on the server, so the client drops it and the
  // imports only it reads, also when a cast wraps the chain link.
  // Bug: a `.validator()` link wrapped in `satisfies` / `as` is not stripped
  // from the callers.
  // Impact: the validator and its imports ship to the client, code the
  // client never runs.
  // Source: #8504 caller-dead-code.test.ts (differential fuzzing; red on
  // main)
  test.fails.each([
    { name: 'satisfies', wrap: (link: string) => `(${link} satisfies any)` },
    { name: 'cast', wrap: (link: string) => `(${link} as any)` },
  ])(
    'when the validator link is wrapped in a $name expression',
    async ({ wrap }) => {
      const compiled =
        await compileAll(`${head}import { schema } from './schema'
export const fn = ${wrap(`createServerFn().validator(schema)`)}.handler(async ({ data }) => data)`)
      expectNotLoaded(await moduleLoads(compiled.client), ['./schema'])
      expect(
        await callProvider(
          compiled,
          'fn',
          { './schema': { schema: (data: string) => `${data}!` } },
          'data',
        ),
      ).toBe('data!')
    },
  )

  // Bug: a `.validator()` link on a builder stored in a variable is not
  // stripped from the callers: the client follows the handler's chain only
  // up to the identifier (`withPost.handler(...)`), so the variable's
  // declaration keeps its validator. An inline chain is stripped ("when the
  // handler only reads it through a validator or a middleware", above).
  // Source: start-compiler/compiler.ts:1296-1330 (the chain walk stops at an
  // identifier), start-compiler/handleCreateServerFn.ts:277-290; fuzzing (oracle
  // mode, N4).
  // Impact: the validator and its imports (schemas, server-only modules)
  // ship to the client, which never runs them.
  test.fails.each([
    {
      name: 'one handler',
      handlers: `export const fn = withPost.handler(async ({ data }) => data)`,
    },
    {
      name: 'two handlers',
      handlers: `export const fn = withPost.handler(async ({ data }) => data)
export const other = withPost.handler(async ({ data }) => data)`,
    },
  ])(
    'when the validator link is on a builder stored in a variable ($name)',
    async ({ handlers }) => {
      const compiled =
        await compileAll(`${head}import { schema } from './schema'
const withPost = createServerFn({ method: 'POST' }).validator(schema)
${handlers}`)
      expectNotLoaded(await moduleLoads(compiled.client), ['./schema'])
      expect(
        await callProvider(
          compiled,
          'fn',
          { './schema': { schema: (data: string) => `${data}!` } },
          'data',
        ),
      ).toBe('data!')
    },
  )
})

// Source: @vitejs/plugin-rsc hoist/function-hoist-block.js,
// scope/param-default-var-hoisting.js, hoist/shadow-partial-if-block-over-global.js,
// hoist/catch-binding-shadow.js
test.each([
  {
    name: 'past a function declared in a nested block',
    code: `export function read() {
  {
    function store() {}
  }
  return store.value
}`,
  },
  {
    name: 'from a parameter default next to a var of the same name',
    code: `export function read(value = store.value) {
  var store = 'local'
  return value
}`,
  },
  {
    name: 'after a block that shadows it',
    code: `export function read() {
  if (Math.random() > 2) {
    const store = { value: 'local' }
    return store.value
  }
  return store.value
}`,
  },
  {
    name: 'in a try block whose catch parameter shadows it',
    code: `export function read() {
  try {
    return store.value
  } catch (store) {
    return store
  }
}`,
  },
])('client code that reads an import $name keeps it', async ({ code }) => {
  const client = await compileCode(
    'client',
    `${head}import { store } from './store'
import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())
${code}`,
  )
  expectNotLoaded(await moduleLoads(client!), ['./db.server'])
  const module = await evaluateModule(client!, {
    './store': `export const store = { value: 'store' }`,
  })
  expect(module.read()).toBe('store')
})

describe('destructurings shared by the handler and client code', () => {
  // Source: Next.js server-actions fixtures server-graph/6, client-graph/3
  test.each<{
    name: string
    code: string
    stubs: Record<string, ModuleStub>
    clientValue: unknown
    handlerValue: unknown
  }>([
    {
      name: 'an array pattern',
      code: `import { values } from './values'
const [serverOnly, shared] = values
export const clientValue = shared
export const fn = createServerFn().handler(async () => serverOnly)`,
      stubs: { './values': `export const values = ['server', 'shared']` },
      clientValue: 'shared',
      handlerValue: 'server',
    },
    {
      // Dropping the handler-only `secretKey` would move it into the rest.
      name: 'an object pattern whose rest the client uses',
      code: `import { config } from './config'
const { secretKey, ...publicConfig } = config
export const clientValue = publicConfig
export const fn = createServerFn().handler(async () => secretKey)`,
      stubs: {
        './config': `export const config = { secretKey: 'key', theme: 'dark' }`,
      },
      clientValue: { theme: 'dark' },
      handlerValue: 'key',
    },
  ])(
    'keep their values in every output for $name',
    async ({ code, stubs, clientValue, handlerValue }) => {
      const compiled = await compileAll(`${head}${code}`)
      const client = await evaluateModule(compiled.client, stubs)
      expect(client.clientValue).toEqual(clientValue)
      expect(await callProvider(compiled, 'fn', stubs)).toEqual(handlerValue)
    },
  )

  // When one binding of a destructuring stays live, the elements of the
  // handler-only bindings are pruned, including what their default values or
  // computed keys read.
  // Source: Next.js server-actions fixtures server-graph/6, /43
  test.each([
    {
      name: 'an object pattern default',
      code: `import { readSecret } from './secrets.server'
const { apiKey = readSecret(), theme } = config`,
    },
    {
      name: 'an array pattern default',
      code: `import { readSecret } from './secrets.server'
const [apiKey = readSecret(), theme] = config.list`,
    },
    {
      name: 'a computed key',
      code: `import { secretKeyName } from './secrets.server'
const { [secretKeyName]: apiKey, theme } = config`,
    },
    {
      name: 'a nested pattern default',
      code: `import { readSecret } from './secrets.server'
const { db: { apiKey = readSecret() } = {}, theme } = config`,
    },
  ])(
    'drop a server import read by $name of a handler-only binding',
    async ({ code }) => {
      const compiled =
        await compileAll(`${head}import { config } from './config'
${code}
export const fn = createServerFn().handler(async () => apiKey)
export const currentTheme = theme`)
      expectNotLoaded(await moduleLoads(compiled.client), ['./secrets.server'])
      const client = await evaluateModule(compiled.client, {
        './config': `export const config = { theme: 'dark', list: [undefined, 'dark'] }`,
      })
      expect(client.currentTheme).toBe('dark')
    },
  )
})

describe('declarations only the handler needs', () => {
  // Bug: a function whose body declares a local of the function's own name
  // (`function session() { const session = ... }`) counts as used by that
  // local, so the callers keep it, and the server-only import it reads,
  // after the handler that called it is gone.
  // Impact: the client loads the server-only module.
  // Source: React Compiler fixture context-variable-as-jsx-element-tag.js;
  // #8504 caller-dead-code.test.ts (red on main)
  test.fails(
    'callers drop a handler-only function that declares a local of its own name',
    async () => {
      const compiled =
        await compileAll(`${head}import { readSecret } from './server-only'
function session() {
  const session = readSecret()
  return session.id
}
export const getReport = createServerFn().handler(async () => session())`)
      expectNotLoaded(await moduleLoads(compiled.client), ['./server-only'])
      expect(compiled.client).not.toContain('readSecret')
      expect(
        await callServerFnThroughCallers(
          compiled,
          (module) => module.getReport,
          { './server-only': { readSecret: () => ({ id: 'report' }) } },
        ),
      ).toBe('report')
    },
  )

  // Whether the client keeps code that reads no server code (`loop`,
  // `unusedA`, `unusedB`) is left open.
  // Source: babel-dead-code-elimination "SCC dead code elimination" (mutual
  // recursion, self-recursive functions, unexported circular references)
  test('the client drops handler-only cycles and default parameters', async () => {
    const compiled =
      await compileAll(`${head}import { secret, defaultId } from './secret.server'
function walk(n: number): number { return n > 0 ? walkBack(n - 1) : secret.length }
function walkBack(n: number): number { return n > 0 ? walk(n - 1) : 0 }
const loop = (n: number): number => (n > 0 ? loop(n - 1) : 0)
function load(id = defaultId()) { return id }
function unusedA(): number { return unusedB() }
function unusedB(): number { return unusedA() }
export const fn = createServerFn().handler(async () => [walk(3), loop(2), load()])`)
    expectNotLoaded(await moduleLoads(compiled.client), ['./secret.server'])
    expect(
      await callServerFnThroughCallers(compiled, (module) => module.fn, {
        './secret.server': `export const secret = 'secret'; export const defaultId = () => 'id'`,
      }),
    ).toEqual([0, 0, 'id'])
  })

  // Source: babel-dead-code-elimination "assignment"
  test('callers keep handler-read bindings that top-level statements assign', async () => {
    const compiled = await compileAll(`${head}let x: string
x = 'x-assigned'
y = 'y-assigned'
var y: string
export const fn = createServerFn().handler(async () => [x, y])`)
    // An assignment left without its declaration throws in a module.
    await evaluateModule(compiled.client)
    await evaluateModule(compiled.ssr)
    expect(await callProvider(compiled, 'fn')).toEqual([
      'x-assigned',
      'y-assigned',
    ])
  })

  // Source: babel-dead-code-elimination "repeated elimination"
  test('a binding only the handler writes and a declarator a kept sibling reads keep working', async () => {
    const compiled =
      await compileAll(`${head}import { serverValue } from './db.server'
let hits = 0
let a = serverValue(), clientCopy = a
export const fn = createServerFn().handler(async () => {
  hits++
  return [a, hits]
})
export const clientB = clientCopy`)
    const stubs = { './db.server': { serverValue: () => 'value' } }
    // The client reads `clientCopy = a`, so it keeps `serverValue()`.
    expect((await evaluateModule(compiled.client, stubs)).clientB).toBe('value')
    // Two calls on one server instance: the handler updates its own `hits`.
    const provider = await evaluateProvider(compiled, stubs)
    expect([
      await callProvider(provider, 'fn'),
      await callProvider(provider, 'fn'),
    ]).toEqual([
      ['value', 1],
      ['value', 2],
    ])
    expect(
      await callServerFnThroughCallers(compiled, (module) => module.fn, stubs),
    ).toEqual(['value', 1])
  })

  // Source: babel-dead-code-elimination "variable" > "within for...in",
  // "within for...of" (var bindings declared inside nested statements)
  test('the client drops handler-only vars declared inside top-level statements', async () => {
    const calls = ['openFlag', 'connect', 'readMode']
    const compiled =
      await compileAll(`${head}import { ${calls.join(', ')} } from './db.server'
if (typeof window === 'undefined') {
  var flag = openFlag()
}
try {
  var conn = connect()
} catch {}
switch (process.env.MODE) {
  case 'x':
    var mode = readMode()
}
export const fn = createServerFn().handler(async () => [flag, conn, mode])`)
    expectNotLoaded(await moduleLoads(compiled.client), ['./db.server'])
    for (const call of calls) {
      expect(compiled.client).not.toContain(call)
    }
    // On the server (no `window`, MODE unset), the handler reads what the
    // statements it depends on assigned.
    vi.stubEnv('MODE', '')
    try {
      expect(
        await callServerFnThroughCallers(compiled, (module) => module.fn, {
          './db.server': Object.fromEntries(
            calls.map((call) => [call, () => call]),
          ),
        }),
      ).toEqual(['openFlag', 'connect', undefined])
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
