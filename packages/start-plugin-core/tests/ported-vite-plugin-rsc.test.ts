/**
 * Edge cases ported from the `@vitejs/plugin-rsc` transform tests
 * (vitejs/vite-plugin-react, packages/plugin-rsc/src/transforms, MIT).
 * plugin-rsc hoists inline `'use server'` functions out of their scope, wraps
 * and proxies module exports and expands `export *`; the Start compiler
 * extracts server function handlers into a provider module, strips the code
 * of the other environment and resolves factories through re-exports. Each
 * test names the plugin-rsc test or fixture it is ported from.
 */
import { describe, expect, test } from 'vitest'
import {
  callProvider,
  compileAll,
  compileCode,
  compileHydrate,
  getChunkParams,
  importModule,
  importSources,
  renderChunk,
} from './regression-helpers'
import { getModuleErrors } from './validate-module'

const head = `import { createServerFn } from '@tanstack/react-start'\n`
const dbServer = `export const db = { x: () => 'x' }`

describe('server fn handlers keep the module bindings they close over', () => {
  test.each<{
    name: string
    code: string
    modules?: Record<string, string>
    data?: unknown
    expected: unknown
  }>([
    {
      // hoist/function-hoist-block.js: a block-level function declaration is
      // block scoped in modules and does not shadow the outer binding
      name: 'a function declared in a nested block',
      code: `const value = 'outer'
export const fn = createServerFn().handler(async () => {
  const seen = value
  {
    function value() {}
  }
  return seen
})`,
      expected: 'outer',
    },
    {
      // hoist/function-hoist.js
      name: 'a hoisted function declaration named like a module binding',
      code: `const value = 'outer'
export const fn = createServerFn().handler(async () => {
  const seen = typeof value
  function value() {}
  return seen
})`,
      expected: 'function',
    },
    {
      // hoist/var-hoist.js, hoist/var-hoist-block.js, hoist/shadow-var-nested-block.js
      name: 'a var in a nested block named like a module binding',
      code: `const value = 'outer'
export const fn = createServerFn().handler(async ({ data }) => {
  const seen = value
  if (data) {
    var value = 'inner'
  }
  return [seen, value]
})`,
      data: true,
      expected: [undefined, 'inner'],
    },
    {
      // hoist/catch-binding-shadow.js, scope/catch-param.js
      name: 'a catch parameter shadowing a module binding',
      code: `const err = { message: 'outer' }
export const fn = createServerFn().handler(async () => {
  const readOuter = () => err.message
  try {
    throw new Error('inner')
  } catch (err) {
    return [err.message, readOuter()]
  }
})`,
      expected: ['inner', 'outer'],
    },
    {
      // hoist/class-declaration-in-body.js
      name: 'a class declared in the handler',
      code: `const config = { value: 'config' }
export const fn = createServerFn().handler(async () => {
  class Helper {
    run() {
      return config.value
    }
  }
  return new Helper().run()
})`,
      expected: 'config',
    },
    {
      // hoist/computed-destructuring-key-captures-outer-binding.js,
      // scope/computed-destructuring.js
      name: 'a computed destructuring key',
      code: `const key = 'value'
export const fn = createServerFn().handler(async ({ data }) => {
  const { [key]: val } = data
  return val
})`,
      data: { value: 'picked' },
      expected: 'picked',
    },
    {
      // hoist/destructured-param-default-bound.js, scope/param-defaults.js
      name: 'a destructured parameter default',
      code: `const fallback = 'fallback'
export const fn = createServerFn().handler(async ({ data: { x = fallback } = {} }) => x)`,
      expected: 'fallback',
    },
    {
      // scope/param-default-var-hoisting.js: parameter defaults do not see
      // var declarations of the body
      name: 'a parameter default named like a var of the body',
      code: `const y = 'outer'
export const fn = createServerFn().handler(async ({ data = y }) => {
  var y = 'inner'
  return [data, y]
})`,
      expected: ['outer', 'inner'],
    },
    {
      // hoist/for-of-iterable-bound.js
      name: 'a for-of iterable',
      code: `const items = ['a', 'b']
export const fn = createServerFn().handler(async () => {
  const out = []
  for (const item of items) {
    out.push(item)
  }
  return out
})`,
      expected: ['a', 'b'],
    },
    {
      // hoist/shadow-partial-if-block-over-outer-local.js,
      // hoist/shadow-local-body-and-if-block-over-outer-local.js,
      // hoist/outer-binding-used-in-nested-block.js
      name: 'a block-scoped local shadowing a module binding in one branch',
      code: `const value = 'outer'
export const fn = createServerFn().handler(async () => {
  const pick = (flag) => {
    if (flag) {
      const value = 'inner'
      return value
    }
    return value
  }
  return [pick(true), pick(false)]
})`,
      expected: ['inner', 'outer'],
    },
    {
      // scope/let-const-block.js, typescript-eslint/class/declaration/static-block.js
      name: 'loop, switch and static block locals next to module reads',
      code: `const value = 'outer'
export const fn = createServerFn().handler(async ({ data }) => {
  const out = []
  for (let value = 0; value < 1; value++) out.push(value)
  switch (data) {
    case 1: {
      const value = 'case'
      out.push(value)
    }
    default:
      out.push(value)
  }
  class Block {
    static read
    static {
      Block.read = value
    }
  }
  out.push(Block.read)
  return out
})`,
      data: 1,
      expected: [0, 'case', 'outer', 'outer'],
    },
    {
      // hoist/self-ref-inner-shadow.js
      name: 'an inner function expression named like the server fn',
      code: `const count = 1
export const recurse = createServerFn().handler(async ({ data }) => {
  const result = (function recurse(m) {
    return m > 0 ? recurse(m - 1) : 0
  })(data)
  return count + result
})`,
      data: 3,
      expected: 1,
    },
    {
      // hoist/methods.js: computed and special method names
      name: 'object and class methods with computed names',
      code: `const key = 'computed'
const __proto__ = 'proto'
export const fn = createServerFn().handler(async () => {
  const api = {
    async [key]() {},
    async [__proto__]() {},
    async 'foo-bar'() {},
    async 1.5() {},
  }
  class Actions {
    static async [key]() {
      return 'static'
    }
  }
  return [Object.keys(api).sort(), await Actions[key]()]
})`,
      expected: [['1.5', 'computed', 'foo-bar', 'proto'], 'static'],
    },
    {
      // scope/label.js: labels are not references
      name: 'a label named like a module binding',
      code: `const outer = 'module'
export const fn = createServerFn().handler(async () => {
  outer: for (const item of [1, 2]) {
    if (item) {
      break outer
    }
  }
  return outer
})`,
      expected: 'module',
    },
  ])('$name', async ({ code, modules = {}, data, expected }) => {
    const compiled = await compileAll(`${head}${code}`)
    for (const caller of [compiled.client, compiled.ssr]) {
      expect(importSources(caller)).toEqual([])
    }
    expect(
      await callProvider(
        compiled.provider,
        code.includes('const recurse') ? 'recurse' : 'fn',
        modules,
        data,
      ),
    ).toEqual(expected)
  })

  // hoist/self-ref-nested-function.js, hoist/direct-recursion-self-binding.js
  test('a handler that calls its own server fn', async () => {
    const { provider } =
      await compileAll(`${head}export const countdown = createServerFn().handler(async ({ data }) => {
  const next = () => countdown({ data: data - 1 })
  return data > 0 ? next() : 'done'
})`)
    expect(await callProvider(provider, 'countdown', {}, 2)).toBe('done')
  })

  // hoist/captured-local-assignment.js, hoist/captured-local-increment.js,
  // wrap-export.test.ts "preserve reference"
  test('a handler and client code that both update an exported let', async () => {
    const compiled = await compileAll(`${head}export let count = 0
export function changeCount() {
  count += 1
  return count
}
export const bump = createServerFn().handler(async () => ++count)`)
    const client = await importModule(compiled.client)
    expect(client.changeCount()).toBe(1)
    expect(client.count).toBe(1)
    const provider = await importModule(compiled.provider)
    expect(await callProvider(provider, 'bump')).toBe(1)
    expect(await callProvider(provider, 'bump')).toBe(2)
  })

  // hoist/reexport-import-not-bound.js, hoist/export-before-import.js
  test('a re-export of the name the handler imports is not a reference', async () => {
    const compiled = await compileAll(`${head}export {} from './setup'
export { redirect } from './router'
import { redirect } from './router'
export const fn = createServerFn().handler(async () => redirect())`)
    const modules = {
      './setup': `export {}`,
      './router': `export const redirect = () => 'redirected'`,
    }
    const client = await importModule(compiled.client, modules)
    expect(client.redirect()).toBe('redirected')
    expect(await callProvider(compiled.provider, 'fn', modules)).toBe(
      'redirected',
    )
  })
})

describe('client callers drop server imports only the handler reads', () => {
  const base = `${head}import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())
`
  // Each snippet uses `db` in a position that is not a reference to the import.
  test.each<{
    name: string
    code: string
    modules?: Record<string, string>
    check?: (client: Record<string, any>) => void
  }>([
    {
      // scope/label.js
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
      // scope/object-expr-vs-pattern.js
      name: 'an object key and a pattern key',
      code: `export const options = { db: 'key' }
export const pick = ({ db: local }) => local`,
      check: (client) => expect(client.pick(client.options)).toBe('key'),
    },
    {
      // scope/member-expr.js
      name: 'a member property',
      code: `export const read = (object) => object.db`,
      check: (client) => expect(client.read({ db: 'member' })).toBe('member'),
    },
    {
      // scope/method-definition.js, scope/property-definition.js,
      // typescript-eslint/class/declaration/private-identifier.js
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
      // scope/export-specifier.js
      name: 'an export alias',
      code: `const local = 'alias'
export { local as db }`,
      check: (client) => expect(client.db).toBe('alias'),
    },
    {
      // scope/destructuring-assignment.js
      name: 'a destructuring assignment key',
      code: `let bound
;({ db: bound } = { db: 'assigned' })
export { bound }`,
      check: (client) => expect(client.bound).toBe('assigned'),
    },
    {
      // scope/catch-param.js
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
      // scope/fn-expr-name.js, scope/class-expr-self.js
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
      // scope/var-hoisting.js, scope/fn-decl-hoisting.js
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
      // scope/let-const-block.js, scope/shadowing-block.js,
      // typescript-eslint/block/scope.js
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
      // scope/destructured-params.js, scope/param-defaults.js,
      // typescript-eslint/functions/arrow/default-params/readable-ref-param-shadow.js
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
      // scope/import-meta.js
      name: 'an import.meta property',
      code: `export const meta = typeof import.meta.db`,
      check: (client) => expect(client.meta).toBe('undefined'),
    },
    {
      // hoist/reexport-import-not-bound.js
      name: 'a re-export',
      code: `export { db } from './other'`,
      modules: { './other': `export const db = 'other'` },
      check: (client) => expect(client.db).toBe('other'),
    },
    {
      // typescript-eslint/ts-module/namespace.js, ts-module/scope.js
      name: 'a namespace member',
      code: `export namespace Repo {
  export const db = 'namespace'
  export const read = () => db
}`,
      check: (client) => expect(client.Repo.read()).toBe('namespace'),
    },
    {
      // typescript-eslint/type-declaration/interface1.js
      name: 'an interface property',
      code: `export interface Row {
  db: string
}`,
    },
    {
      // typescript-eslint/type-declaration/type1.js
      name: 'a type literal property',
      code: `export type Shape = { db: number }`,
    },
    {
      // typescript-eslint/functions/function-declaration/type-parameters/*
      name: 'a type parameter',
      code: `export function identity<db>(value: db): db {
  return value
}`,
      check: (client) => expect(client.identity('id')).toBe('id'),
    },
  ])('$name', async ({ code, modules = {}, check }) => {
    const compiled = await compileAll(`${base}${code}`)
    expect(importSources(compiled.client)).toEqual(Object.keys(modules).sort())
    check?.(await importModule(compiled.client, modules))
    expect(
      await callProvider(compiled.provider, 'fn', {
        ...modules,
        './db.server': dbServer,
      }),
    ).toBe('x')
  })

  // typescript-eslint/jsx/attribute.js, jsx/namespaced-attribute.js,
  // jsx/component-intrinsic-name.js, jsx/component-namespaced1.js,
  // jsx/this-jsxidentifier.js
  test('JSX attribute names, intrinsic tags and this members', async () => {
    const compiled =
      await compileAll(`${base}export const element = <svg db="attribute" xlink:db="namespaced" />
export const intrinsic = <db />
export const namespaced = <db:tag />
export class View {
  db = () => null
  render() {
    return <this.db />
  }
}`)
    expect(importSources(compiled.client)).toEqual([])
  })
})

describe('client code that reads an import through a nested scope keeps it', () => {
  test.each([
    {
      // hoist/function-hoist-block.js
      name: 'past a function declared in a nested block',
      code: `export function read() {
  {
    function store() {}
  }
  return store.value
}`,
    },
    {
      // scope/param-default-var-hoisting.js
      name: 'from a parameter default next to a var of the same name',
      code: `export function read(value = store.value) {
  var store = 'local'
  return value
}`,
    },
    {
      // hoist/shadow-partial-if-block-over-global.js
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
      // hoist/catch-binding-shadow.js
      name: 'in a try block whose catch parameter shadows it',
      code: `export function read() {
  try {
    return store.value
  } catch (store) {
    return store
  }
}`,
    },
  ])('$name', async ({ code }) => {
    const compiled = await compileAll(`${head}import { store } from './store'
import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())
${code}`)
    expect(importSources(compiled.client)).toEqual(['./store'])
    const modules = { './store': `export const store = { value: 'store' }` }
    const client = await importModule(compiled.client, modules)
    expect(client.read()).toBe('store')
  })
})

// hoist/function-hoist-block.js, hoist/catch-binding-shadow.js,
// scope/param-default-var-hoisting.js, scope/label.js
test('environment-only implementations keep the imports their side reads through nested scopes', async () => {
  const code = `import {
  createClientOnlyFn,
  createIsomorphicFn,
  createMiddleware,
  createServerOnlyFn,
} from '@tanstack/react-start'
import { chart } from './chart.client'
import { db } from './db.server'
export const iso = createIsomorphicFn()
  .server(() => {
    {
      function chart() {}
    }
    return db.x()
  })
  .client(() => {
    try {
      return chart.draw()
    } catch (db) {
      return db
    }
  })
export const serverOnly = createServerOnlyFn((value = db.x()) => {
  var db = 'local'
  return value
})
export const clientOnly = createClientOnlyFn(() => {
  db: {
    break db
  }
  return chart.draw()
})
export const mw = createMiddleware().server(async ({ next }) => {
  const chart = db
  return next({ context: { value: chart.x() } })
})`
  const modules = {
    '@tanstack/react-start': `const builder = () => ({ server: () => builder(), client: () => builder() })
export const createMiddleware = builder`,
    './chart.client': `export const chart = { draw: () => 'drawn' }`,
    './db.server': dbServer,
  }
  const client = await compileCode('client', code)
  const ssr = await compileCode('ssr', code)
  for (const output of [client, ssr]) {
    expect(output).not.toBeNull()
    expect(await getModuleErrors(output!)).toEqual([])
  }
  expect(importSources(client!)).toEqual(['./chart.client'])
  expect(importSources(ssr!)).toEqual(['./db.server'])
  const clientModule = await importModule(client!, modules)
  expect([clientModule.iso(), clientModule.clientOnly()]).toEqual([
    'drawn',
    'drawn',
  ])
  const ssrModule = await importModule(ssr!, modules)
  expect([ssrModule.iso(), ssrModule.serverOnly()]).toEqual(['x', 'x'])
})

describe('export forms next to server fns', () => {
  // wrap-export.test.ts "export destructuring"
  test('destructured exports', async () => {
    const compiled =
      await compileAll(`${head}export const { x, y: [z] } = { x: 'x', y: ['z'] }
export const fn = createServerFn().handler(async () => z)`)
    const client = await importModule(compiled.client)
    expect([client.x, client.z]).toEqual(['x', 'z'])
    expect(await callProvider(compiled.provider, 'fn')).toBe('z')
  })

  // wrap-export.test.ts "default function", "default class"
  test.each([
    `export default function Page() {\n  return fn\n}`,
    `export default class Page {\n  static fn = fn\n}`,
  ])('a named default export using the server fn: %s', async (code) => {
    const compiled =
      await compileAll(`${head}export const fn = createServerFn().handler(async () => 'fn')
${code}`)
    const client = await importModule(compiled.client)
    expect(client.default).toBeTypeOf('function')
    expect(await callProvider(compiled.provider, 'fn')).toBe('fn')
  })

  // wrap-export.test.ts "re-export simple", "re-export rename",
  // "re-export all simple", "re-export all rename"
  test('re-exports stay in the callers', async () => {
    const compiled = await compileAll(`${head}export { x } from './dep'
export { x as y } from './dep'
export * from './star'
export * as ns from './dep'
export const fn = createServerFn().handler(async () => 'fn')`)
    const modules = {
      './dep': `export const x = 'x'`,
      './star': `export const starred = 'starred'`,
    }
    for (const caller of [compiled.client, compiled.ssr]) {
      const module = await importModule(caller, modules)
      expect(Object.keys(module).sort()).toEqual([
        'fn',
        'ns',
        'starred',
        'x',
        'y',
      ])
      expect([module.x, module.y, module.starred, module.ns.x]).toEqual([
        'x',
        'x',
        'starred',
        'x',
      ])
    }
    expect(await callProvider(compiled.provider, 'fn', modules)).toBe('fn')
  })

  // source-map/wrap-export/reexport-attributes.js
  test('import attributes are kept in every output', async () => {
    const compiled =
      await compileAll(`${head}import config from './config.json' with { type: 'json' }
export { default as data } from './data.json' with { type: 'json' }
export const theme = config.theme
export const fn = createServerFn().handler(async () => config.secret)`)
    const modules = {
      './config.json': `{ "theme": "dark", "secret": "s3cret" }`,
      './data.json': `{ "data": true }`,
    }
    const attributes = /\bwith\s*\{\s*type:\s*["']json["']\s*\}/g
    for (const caller of [compiled.client, compiled.ssr]) {
      expect(caller.match(attributes)).toHaveLength(2)
      const module = await importModule(caller, modules)
      expect([module.theme, module.data]).toEqual(['dark', { data: true }])
    }
    expect(compiled.provider).toMatch(attributes)
    expect(await callProvider(compiled.provider, 'fn', modules)).toBe('s3cret')
  })

  // source-map/wrap-export/local-export-before-declaration.js
  test('an export list before the server fn declaration', async () => {
    const compiled = await compileAll(`${head}export { fn, fn as alias }
const fn = createServerFn().handler(async () => 'fn')`)
    const client = await importModule(compiled.client)
    expect(client.alias).toBe(client.fn)
    expect(client.fn.rpc).toHaveProperty('client')
    expect(await callProvider(compiled.provider, 'fn')).toBe('fn')
  })

  // source-map/wrap-export/dependent-declarators.js
  test('a server fn built from a sibling declarator', async () => {
    const compiled = await compileAll(`${head}import { db } from './db.server'
export const base = createServerFn(), fn = base.handler(async () => db.x())`)
    expect(importSources(compiled.client)).toEqual([])
    expect(
      await callProvider(compiled.provider, 'fn', { './db.server': dbServer }),
    ).toBe('x')
  })

  // proxy-export.test.ts "validates empty binding"
  test('empty destructuring exports', async () => {
    const compiled = await compileAll(`${head}export const {} = {}
export const [] = []
export const fn = createServerFn().handler(async () => 'fn')`)
    expect(await callProvider(compiled.provider, 'fn')).toBe('fn')
  })
})

describe('factories re-exported through export * chains', () => {
  const user = `import { createServerFn, createServerOnlyFn } from './start'
import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())
export const serverOnly = createServerOnlyFn(() => 'server only')`
  const serverOnlyStub =
    'createServerOnlyFn() functions can only be called on the server!'

  test.each<{
    name: string
    files: Record<string, string>
    code?: string
    startServerOnlyFn: boolean
  }>([
    {
      // expand-export-all/basic
      name: 'a nested chain',
      files: {
        '/test/src/start.ts': `export * from './inner'`,
        '/test/src/inner.ts': `export * from '@tanstack/react-start'`,
      },
      startServerOnlyFn: true,
    },
    {
      // expand-export-all/explicit-wins
      name: 'a local export that overrides the star export',
      files: {
        '/test/src/start.ts': `export * from '@tanstack/react-start'
export function createServerOnlyFn(fn) {
  return fn
}`,
      },
      startServerOnlyFn: false,
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
      startServerOnlyFn: true,
    },
    {
      // expand-export-all/bad-resolve
      name: 'an unresolvable star export next to the package',
      files: {
        '/test/src/start.ts': `export * from './missing'
export * from '@tanstack/react-start'`,
      },
      startServerOnlyFn: true,
    },
    {
      // expand-export-all/duplicate-star-same-source
      name: 'the same module re-exported twice',
      files: {
        '/test/src/start.ts': `export * from './inner'
export * from './inner'`,
        '/test/src/inner.ts': `export * from '@tanstack/react-start'`,
      },
      startServerOnlyFn: true,
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
      startServerOnlyFn: true,
    },
    {
      // expand-export-all/string-export-name
      name: 'string export names',
      files: {
        '/test/src/start.ts': `export { createServerFn as 'create server fn', createServerOnlyFn as 'server only' } from '@tanstack/react-start'`,
      },
      code: `import { 'create server fn' as createServerFn, 'server only' as createServerOnlyFn } from './start'
import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())
export const serverOnly = createServerOnlyFn(() => 'server only')`,
      startServerOnlyFn: true,
    },
  ])('$name', async ({ files, code = user, startServerOnlyFn }) => {
    const client = await compileCode('client', code, { files })
    expect(client).not.toBeNull()
    expect(await getModuleErrors(client!)).toEqual([])
    expect(client).toMatch(/createServerFn\(\)\.handler\(createClientRpc\(/)
    expect(client).not.toContain('db.server')
    if (startServerOnlyFn) {
      expect(client).toContain(serverOnlyStub)
    } else {
      expect(client).not.toContain(serverOnlyStub)
      expect(client).toContain(`createServerOnlyFn(() => 'server only')`)
    }
  })
})

describe('provider module directives', () => {
  // utils.test.ts "recognizes directive prologues"
  test.each([
    {
      name: 'after another directive',
      prologue: `'use strict'\n'use server'\n`,
      existing: true,
    },
    {
      name: 'after an import',
      prologue: `import './setup'\n'use server'\n`,
      existing: false,
    },
    { name: 'parenthesized', prologue: `('use server')\n`, existing: false },
    {
      name: 'after an empty statement',
      prologue: `;'use server'\n`,
      existing: false,
    },
  ])('a "use server" string $name', async ({ prologue, existing }) => {
    const code = `${prologue}${head}export const fn = createServerFn().handler(async () => 1)`
    const provider = await compileCode('provider', code, {
      directives: ['use server'],
    })
    expect(provider).not.toBeNull()
    expect(await getModuleErrors(provider!)).toEqual([])
    // The provider starts with a "use server" directive prologue.
    expect(provider).toMatch(
      /^(?:\s*(["'])use strict\1;?)?\s*(["'])use server\2/,
    )
    if (existing) {
      expect(provider!.match(/["']use server["']/g)).toHaveLength(1)
    }
  })

  // utils.test.ts "recognizes directive prologues", mixed-directives
  test("a 'use client' directive after 'use strict' stays in the callers' prologue", async () => {
    const code = `'use strict'\n'use client'\n${head}export const fn = createServerFn().handler(async () => 1)`
    for (const output of ['client', 'ssr'] as const) {
      const caller = await compileCode(output, code)
      expect(caller).toMatch(/^\s*(["'])use strict\1;?\s*(["'])use client\2/)
    }
  })
})

describe('CommonJS and TypeScript module formats', () => {
  // cjs.test.ts (fixtures/cjs): .cts/.mts sources are TypeScript without JSX
  test.each(['/test/src/fn.cts', '/test/src/fn.mts'])(
    '%s may use angle-bracket type assertions',
    async (id) => {
      const code = `${head}import { db } from './db.server'
const n = <number>(1 as unknown)
export const fn = createServerFn().handler(async () => [n, db.x()])`
      const client = await compileCode('client', code, { id })
      expect(client).toMatch(/createClientRpc\(/)
      expect(importSources(client!)).toEqual([])
    },
  )
})

describe('Hydrate children capture the bindings they read', () => {
  test.each<{
    name: string
    children: string
    params: Array<string>
    expected: string
  }>([
    {
      // hoist/function-hoist-block.js
      name: 'past a function declared in a nested block',
      children: `{(() => {
  const seen = value
  {
    function value() {}
  }
  return seen
})()}`,
      params: ['value'],
      expected: '<p>outer</p>',
    },
    {
      // scope/param-default-var-hoisting.js
      name: 'from a parameter default next to a var of the same name',
      children: `{((seen = value) => {
  var value = 'inner'
  return seen + ':' + value
})()}`,
      params: ['value'],
      expected: '<p>outer:inner</p>',
    },
    {
      // scope/label.js
      name: 'next to a label of the same name',
      children: `{(() => {
  value: for (const item of [1]) {
    if (item) {
      break value
    }
  }
  return value
})()}`,
      params: ['value'],
      expected: '<p>outer</p>',
    },
    {
      // hoist/computed-destructuring-key-captures-outer-binding.js
      name: 'through a computed destructuring key',
      children: `{(({ [key]: picked }) => picked)({ value })}`,
      params: ['key', 'value'],
      expected: '<p>outer</p>',
    },
    {
      // hoist/var-hoist-block.js, hoist/shadow-var-nested-block.js
      name: 'unless a var in a nested block shadows them',
      children: `{(() => {
  if (key) {
    var value = 'inner'
  }
  return value
})()}`,
      params: ['key'],
      expected: '<p>inner</p>',
    },
  ])('$name', async ({ children, params, expected }) => {
    const { parent, chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
export function Page() {
  const value = 'outer'
  const key = 'value'
  return <Hydrate><p>${children}</p></Hydrate>
}
`,
    )
    expect(chunks).toHaveLength(1)
    expect(await getModuleErrors(parent)).toEqual([])
    expect(await getModuleErrors(chunks[0]!)).toEqual([])
    expect(getChunkParams(chunks[0]!)).toEqual(params)
    expect(
      await renderChunk(chunks[0]!, { value: 'outer', key: 'value' }),
    ).toBe(expected)
  })

  // hoist/function-hoist-block.js (module-level binding)
  test('a module binding read past a block-level function moves into the chunk', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
const value = 'module'
export function Page() {
  return <Hydrate><p>{(() => {
  const seen = value
  {
    function value() {}
  }
  return seen
})()}</p></Hydrate>
}
`,
    )
    expect(chunks).toHaveLength(1)
    expect(await getModuleErrors(chunks[0]!)).toEqual([])
    expect(getChunkParams(chunks[0]!)).toEqual([])
    expect(await renderChunk(chunks[0]!, {})).toBe('<p>module</p>')
  })
})
