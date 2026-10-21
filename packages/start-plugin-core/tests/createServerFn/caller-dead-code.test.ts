import { describe, expect, test, vi } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  callFromClient,
  callOnServer,
  callServerFnThroughCallers,
  inPage,
  serveCase,
  useStartHost,
} from '../regression-helpers'

// The client replaces a server fn handler with an RPC, then drops the module
// code only the handler read, so server-only imports never reach it. Code the
// client still reads must survive with its values. Server code may do the
// same or keep the handler in place: calling the server fn from it runs the
// handler either way. "Drops" is observed as loading: the modules a page
// importing the module loads (`loads`: what the browser requests and Vite's
// client module graph holds), never as an inventory of its import
// declarations (FIX-PLAN S06). Every module the fixtures import is a real
// file of the case.

const host = useStartHost()

const head = `import { createServerFn } from '@tanstack/react-start'\n`
const dbServer = `export const db = { x: () => 'x' }\n`

/** A page check: a script and what it must return. */
interface PageCheck {
  script: string
  expected: unknown
}

describe('callers drop a server import only the handler reads', () => {
  // Source: Next.js server-actions fixtures server-graph/6 (shadowed bindings)
  test.each<{
    name: string
    code: string
    files: Record<string, string>
    forbidden: Array<string>
    check: PageCheck
    expected: unknown
  }>([
    {
      name: 'a handler local shadows an import the client uses',
      code: `import { db } from './db.server'
import { format } from './format'
export const label = format('x')
export const fn = createServerFn().handler(async () => {
  const format = (value: unknown) => \`local:\${value}\`
  return format(db.x())
})`,
      files: {
        'format.ts':
          'export const format = (value: string) => `format:${value}`\n',
      },
      forbidden: ['./db.server'],
      check: { script: 'return module.label', expected: 'format:x' },
      expected: 'local:x',
    },
    {
      // The client reads the server module itself (`clientDb`): it stays.
      name: 'a handler parameter shadows an import the client uses',
      code: `import { db } from './db.server'
export const fn = createServerFn().handler(async ({ data: db }: { data: string }) => db)
export const clientDb = db`,
      files: {},
      forbidden: [],
      check: {
        script: `return module.clientDb === (await load('db.server.ts')).db`,
        expected: true,
      },
      expected: 'param',
    },
  ])('when $name', async ({ code, files, forbidden, check, expected }) => {
    const served = await serveCase(await host(), {
      'module.tsx': `${head}${code}`,
      'db.server.ts': dbServer,
      ...files,
    })
    expectNotLoaded(await served.loads(), forbidden)
    expect(await inPage(served, check.script)).toEqual(check.expected)
    expect(await callFromClient(served, 'module.fn', 'param')).toBe(expected)
  })

  // Each snippet uses the name `db` in a position that is not a reference to
  // the import the handler reads.
  test.each<{
    name: string
    code: string
    files?: Record<string, string>
    check?: PageCheck
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
      check: { script: 'return module.loop()', expected: 'loop' },
    },
    {
      // Source: @vitejs/plugin-rsc scope/object-expr-vs-pattern.js
      name: 'an object key and a pattern key',
      code: `export const options = { db: 'key' }
export const pick = ({ db: local }) => local`,
      check: {
        script: 'return module.pick(module.options)',
        expected: 'key',
      },
    },
    {
      // Source: @vitejs/plugin-rsc scope/member-expr.js
      name: 'a member property',
      code: `export const read = (object) => object.db`,
      check: {
        script: `return module.read({ db: 'member' })`,
        expected: 'member',
      },
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
      check: {
        script: `return [module.api.db(), module.Store.db(), new module.Store().read()]`,
        expected: ['method', 'static', ['field', 'private']],
      },
    },
    {
      // Source: @vitejs/plugin-rsc scope/export-specifier.js
      name: 'an export alias',
      code: `const local = 'alias'
export { local as db }`,
      check: { script: 'return module.db', expected: 'alias' },
    },
    {
      // Source: @vitejs/plugin-rsc scope/destructuring-assignment.js
      name: 'a destructuring assignment key',
      code: `let bound
;({ db: bound } = { db: 'assigned' })
export { bound }`,
      check: { script: 'return module.bound', expected: 'assigned' },
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
      check: { script: 'return module.safe()', expected: 'caught' },
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
      check: {
        script: `return [module.self() === module.self, module.Self.self() === module.Self]`,
        expected: [true, true],
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
      check: {
        script: 'return [module.hoistedVar(), module.hoistedFunction()]',
        expected: ['var', 'function'],
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
      check: {
        script: 'return [module.loops(), module.choose(2), module.Block.value]',
        expected: [[0, 'of', 'in'], 'switch', 'static'],
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
      check: {
        script: `module.accessors.value = 'set'
return [module.params('param'), module.accessors.stored, module.rest(1, 2)]`,
        expected: ['param', 'set', [1, 2]],
      },
    },
    {
      // Source: @vitejs/plugin-rsc scope/import-meta.js
      name: 'an import.meta property',
      code: `export const meta = typeof import.meta.db`,
      check: { script: 'return module.meta', expected: 'undefined' },
    },
    {
      // Source: @vitejs/plugin-rsc hoist/reexport-import-not-bound.js
      name: 'a re-export',
      code: `export { db } from './other'`,
      files: { 'other.ts': `export const db = 'other'\n` },
      check: { script: 'return module.db', expected: 'other' },
    },
    {
      // Source: typescript-eslint ts-module/namespace.js, ts-module/scope.js
      name: 'a namespace member',
      code: `export namespace Repo {
  export const db = 'namespace'
  export const read = () => db
}`,
      check: { script: 'return module.Repo.read()', expected: 'namespace' },
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
      check: { script: `return module.identity('id')`, expected: 'id' },
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
    async ({ code, files = {}, check }) => {
      const served = await serveCase(await host(), {
        'module.tsx': `${head}import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())
${code}`,
        'db.server.ts': dbServer,
        ...files,
      })
      expectNotLoaded(await served.loads(), ['./db.server'])
      if (check) {
        expect(await inPage(served, check.script)).toEqual(check.expected)
      }
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
    check: PageCheck
  }>([
    {
      // Source: typescript-eslint ts-enum/member-ref.js; #8504
      // caller-dead-code.test.ts
      name: 'an enum member',
      code: `export enum Flags {
  db = 1,
  other = db + 1,
}`,
      check: { script: 'return module.Flags.other', expected: 2 },
    },
    {
      // Source: typescript-eslint functions/function-declaration/overload.js;
      // #8504 caller-dead-code.test.ts
      name: 'an overload signature parameter',
      code: `export function call(db: string): string
export function call(value: string) {
  return value
}`,
      check: { script: `return module.call('call')`, expected: 'call' },
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
      check: {
        script: `return new module.Service('param').read()`,
        expected: 'param',
      },
    },
  ])('when client code uses its name in $name', async ({ code, check }) => {
    const served = await serveCase(await host(), {
      'module.tsx': `${head}import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())
${code}`,
      'db.server.ts': dbServer,
    })
    expectNotLoaded(await served.loads(), ['./db.server'])
    expect(await inPage(served, check.script)).toEqual(check.expected)
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
      // `verify` is the default export where the module imports it as such.
      const verify = `() => 'verified'`
      const served = await serveCase(await host(), {
        'module.tsx': `${head}${code}
export const fn = createServerFn().handler(async (): Promise<Session | null> => verify())`,
        'server-module.ts': `export type Session = { id: string }
export const clientValue = 'client'
export const verify = ${verify}
export default ${code.startsWith('import verify') ? verify : `'default'`}
`,
      })
      // The server module loads only for a value the client reads.
      const loads = await served.loads()
      if (client.length === 0) {
        expectNotLoaded(loads, ['./server-module'])
      }
      expect(await inPage(served, 'return module.value')).toBe(value)
      expect(await callServerFnThroughCallers(served, 'module.fn')).toBe(
        'verified',
      )
    },
  )

  // The client keeps the middleware's `.client()` (its send context reaches
  // the server) and drops the imports only its `.server()` and the server
  // fn's validator read; the server runs both before the handler.
  // Source: Next.js server-actions fixtures server-graph/47, /58
  test('when the handler only reads it through a validator or a middleware', async () => {
    // The server modules record their calls in this process (the dev
    // server's SSR environment runs here).
    const calls = ((globalThis as Record<string, unknown>).__b2DeadCodeCalls =
      []) as Array<string>
    const served = await serveCase(await host(), {
      'module.tsx': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
import { schema } from './schema.server'
const auth = createMiddleware({ type: 'function' })
  .client(async ({ next }) => next({ sendContext: { from: 'client' } }))
  .server(async ({ next }) => next({ context: { user: await db.user() } }))
export const fn = createServerFn({ method: 'POST' })
  .middleware([auth])
  .validator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => [data, context.user, context.from])`,
      'db.server.ts': `export const db = {
  user: () => ((globalThis as any).__b2DeadCodeCalls.push('db.user'), 'user'),
}
`,
      'schema.server.ts': `export const schema = {
  parse: (data: unknown) => ((globalThis as any).__b2DeadCodeCalls.push('schema.parse'), \`\${data}!\`),
}
`,
    })
    expectNotLoaded(await served.loads(), ['./db.server', './schema.server'])
    expect(await callFromClient(served, 'module.fn', 'data')).toEqual([
      'data!',
      'user',
      'client',
    ])
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
      const served = await serveCase(await host(), {
        'module.tsx': `${head}import { schema } from './schema'
export const fn = ${wrap(`createServerFn().validator(schema)`)}.handler(async ({ data }) => data)`,
        'schema.ts': 'export const schema = (data: string) => `${data}!`\n',
      })
      expectNotLoaded(await served.loads(), ['./schema'])
      expect(await callFromClient(served, 'module.fn', 'data')).toBe('data!')
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
      const served = await serveCase(await host(), {
        'module.tsx': `${head}import { schema } from './schema'
const withPost = createServerFn({ method: 'POST' }).validator(schema)
${handlers}`,
        'schema.ts': 'export const schema = (data: string) => `${data}!`\n',
      })
      expectNotLoaded(await served.loads(), ['./schema'])
      expect(await callFromClient(served, 'module.fn', 'data')).toBe('data!')
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
  const served = await serveCase(await host(), {
    'module.tsx': `${head}import { store } from './store'
import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())
${code}`,
    'store.ts': `export const store = { value: 'store' }\n`,
    'db.server.ts': dbServer,
  })
  expectNotLoaded(await served.loads(), ['./db.server'])
  expect(await inPage(served, 'return module.read()')).toBe('store')
})

describe('destructurings shared by the handler and client code', () => {
  // Source: Next.js server-actions fixtures server-graph/6, client-graph/3
  test.each<{
    name: string
    code: string
    files: Record<string, string>
    clientValue: unknown
    handlerValue: unknown
  }>([
    {
      name: 'an array pattern',
      code: `import { values } from './values'
const [serverOnly, shared] = values
export const clientValue = shared
export const fn = createServerFn().handler(async () => serverOnly)`,
      files: { 'values.ts': `export const values = ['server', 'shared']\n` },
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
      files: {
        'config.ts': `export const config = { secretKey: 'key', theme: 'dark' }\n`,
      },
      clientValue: { theme: 'dark' },
      handlerValue: 'key',
    },
  ])(
    'keep their values in every output for $name',
    async ({ code, files, clientValue, handlerValue }) => {
      const served = await serveCase(await host(), {
        'module.tsx': `${head}${code}`,
        ...files,
      })
      expect(await inPage(served, 'return module.clientValue')).toEqual(
        clientValue,
      )
      expect(await callFromClient(served, 'module.fn')).toEqual(handlerValue)
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
      const served = await serveCase(await host(), {
        'module.tsx': `${head}import { config } from './config'
${code}
export const fn = createServerFn().handler(async () => apiKey)
export const currentTheme = theme`,
        'config.ts': `export const config = { theme: 'dark', list: [undefined, 'dark'] }\n`,
        'secrets.server.ts': `export const readSecret = () => 'secret'
export const secretKeyName = 'apiKey'
`,
      })
      expectNotLoaded(await served.loads(), ['./secrets.server'])
      expect(await inPage(served, 'return module.currentTheme')).toBe('dark')
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
      const served = await serveCase(await host(), {
        'module.tsx': `${head}import { readSecret } from './server-only'
function session() {
  const session = readSecret()
  return session.id
}
export const getReport = createServerFn().handler(async () => session())`,
        'server-only.ts': `export const readSecret = () => ({ id: 'report' })\n`,
      })
      expectNotLoaded(await served.loads(), ['./server-only'])
      expect(await callServerFnThroughCallers(served, 'module.getReport')).toBe(
        'report',
      )
    },
  )

  // Whether the client keeps code that reads no server code (`loop`,
  // `unusedA`, `unusedB`) is left open.
  // Source: babel-dead-code-elimination "SCC dead code elimination" (mutual
  // recursion, self-recursive functions, unexported circular references)
  test('the client drops handler-only cycles and default parameters', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `${head}import { secret, defaultId } from './secret.server'
function walk(n: number): number { return n > 0 ? walkBack(n - 1) : secret.length }
function walkBack(n: number): number { return n > 0 ? walk(n - 1) : 0 }
const loop = (n: number): number => (n > 0 ? loop(n - 1) : 0)
function load(id = defaultId()) { return id }
function unusedA(): number { return unusedB() }
function unusedB(): number { return unusedA() }
export const fn = createServerFn().handler(async () => [walk(3), loop(2), load()])`,
      'secret.server.ts': `export const secret = 'secret'; export const defaultId = () => 'id'\n`,
    })
    expectNotLoaded(await served.loads(), ['./secret.server'])
    expect(await callServerFnThroughCallers(served, 'module.fn')).toEqual([
      0,
      0,
      'id',
    ])
  })

  // Source: babel-dead-code-elimination "assignment"
  test('callers keep handler-read bindings that top-level statements assign', async () => {
    // An assignment left without its declaration throws in a module:
    // `serveCase` evaluates the module on the client and the server.
    const served = await serveCase(await host(), {
      'module.tsx': `${head}let x: string
x = 'x-assigned'
y = 'y-assigned'
var y: string
export const fn = createServerFn().handler(async () => [x, y])`,
    })
    expect(await callFromClient(served, 'module.fn')).toEqual([
      'x-assigned',
      'y-assigned',
    ])
  })

  // Source: babel-dead-code-elimination "repeated elimination"
  test('a binding only the handler writes and a declarator a kept sibling reads keep working', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `${head}import { serverValue } from './db.server'
let hits = 0
let a = serverValue(), clientCopy = a
export const fn = createServerFn().handler(async () => {
  hits++
  return [a, hits]
})
export const clientB = clientCopy`,
      'db.server.ts': `export const serverValue = () => 'value'\n`,
    })
    // The client reads `clientCopy = a`, so it keeps `serverValue()`.
    expect(await inPage(served, 'return module.clientB')).toBe('value')
    // Two calls reach one server instance: the handler updates its own
    // `hits`.
    expect([
      await callFromClient(served, 'module.fn'),
      await callFromClient(served, 'module.fn'),
    ]).toEqual([
      ['value', 1],
      ['value', 2],
    ])
    // Server code runs the handler too, in that instance or its own
    // (where the handler lives on the server is free, §5.4).
    const fromServer = (await callOnServer(served, 'module.fn')) as [
      string,
      number,
    ]
    expect(fromServer[0]).toBe('value')
    expect([1, 3]).toContain(fromServer[1])
  })

  // Source: babel-dead-code-elimination "variable" > "within for...in",
  // "within for...of" (var bindings declared inside nested statements)
  test('the client drops handler-only vars declared inside top-level statements', async () => {
    const calls = ['openFlag', 'connect', 'readMode']
    // The page has no `process`: the module reads the server's environment
    // through `globalThis`.
    const served = await serveCase(await host(), {
      'module.tsx': `${head}import { ${calls.join(', ')} } from './db.server'
if (typeof window === 'undefined') {
  var flag = openFlag()
}
try {
  var conn = connect()
} catch {}
switch (globalThis.process?.env.MODE) {
  case 'x':
    var mode = readMode()
}
export const fn = createServerFn().handler(async () => [flag, conn, mode])`,
      'db.server.ts': calls
        .map((call) => `export const ${call} = () => '${call}'\n`)
        .join(''),
    })
    expectNotLoaded(await served.loads(), ['./db.server'])
    // On the server (no `window`, MODE unset), the handler reads what the
    // statements it depends on assigned.
    vi.stubEnv('MODE', '')
    try {
      expect(await callServerFnThroughCallers(served, 'module.fn')).toEqual([
        'openFlag',
        'connect',
        undefined,
      ])
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
