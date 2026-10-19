import { expect, test } from 'vitest'
import {
  callProvider,
  callServerFnThroughCallers,
  compileAll,
  compileCode,
  compileServer,
  createServerGraph,
  evaluateModule,
  evaluateProvider,
  moduleLoads,
  outputs,
} from '../regression-helpers'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import type { Output } from '../regression-helpers'

// The provider module runs the extracted handler: it must keep every module
// binding the handler closes over, however the handler is written and
// however its scopes shadow module names.

const head = `import { createServerFn } from '@tanstack/react-start'\n`
const dbServer = `export const db = { x: () => 'x', y: () => 'y' }`

// Source: Next.js server-actions fixtures server-graph/5, /6, /16
test('the provider keeps every kind of module binding the handler reads', async () => {
  const compiled = await compileAll(`${head}import * as ns from './ns'
var counter = 4
class Repo {
  static get() {
    return 'repo'
  }
}
enum Role {
  Admin = 'admin',
}
export const fn = createServerFn().handler(async () => [ns.x, counter, Repo.get(), Role.Admin])`)
  expectNotLoaded(await moduleLoads(compiled.client), ['./ns'])
  expect(
    await callProvider(compiled, 'fn', { './ns': `export const x = 'ns'` }),
  ).toEqual(['ns', 4, 'repo', 'admin'])
})

const handlerStubs = {
  './db.server': dbServer,
  './auth.server': `export const withAuth = (fn) => async (opts) => 'auth:' + (await fn(opts))`,
  './users.server': `export const getUsers = async () => 'users'`,
}

/**
 * Compiles a module with the server fn `fn`: the client loads none of the
 * server modules the handler reads and calls it through its RPC, whose id
 * runs the handler on the server, as does calling it from the SSR caller
 * (`callServerFnThroughCallers`). Returns what the handler returns.
 */
async function callHandler(code: string) {
  const compiled = await compileAll(
    `${head}${code.includes('db.') ? `import { db } from './db.server'\n` : ''}${code}`,
  )
  expectNotLoaded(
    await moduleLoads(compiled.client),
    Object.keys(handlerStubs),
  )
  return callServerFnThroughCallers(
    compiled,
    (module) => module.fn,
    handlerStubs,
  )
}

test.each<{
  name: string
  code: string
  expected: unknown
  read?: (value: any) => Promise<unknown>
}>([
  {
    // Source: Next.js server-actions fixtures server-graph/7, /44
    name: 'a named function expression',
    code: `export const fn = createServerFn().handler(async function deleteItem() {
  return deleteItem.name + db.x()
})`,
    expected: 'deleteItemx',
  },
  {
    // Start calls the handler with one argument, its context (`this` is
    // runtime-defined: Start calls it as a method of its options).
    // Source: Next.js server-actions fixtures server-graph/59
    name: 'a function using arguments and new.target',
    code: `export const fn = createServerFn().handler(async function () {
  return [arguments.length, new.target === undefined, db.x()]
})`,
    expected: [1, true, 'x'],
  },
  {
    // Source: Next.js server-actions fixtures server-graph/14 (streaming)
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
    // Source: Next.js server-actions fixtures server-graph/31
    name: 'an object literal method',
    code: `const handlers = {
  async f() {
    return db.x()
  },
}
export const fn = createServerFn().handler(handlers.f)`,
    expected: 'x',
  },
  {
    // Source: Next.js server-actions fixtures server-graph/21, /26
    name: 'a wrapper call',
    code: `import { withAuth } from './auth.server'
export const fn = createServerFn().handler(withAuth(async () => db.x()))`,
    expected: 'auth:x',
  },
  {
    // Source: Next.js server-actions fixtures server-graph/25
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
    // Source: Next.js server-actions fixtures server-graph/28, /30
    name: 'a call of a server fn declared later',
    code: `export const fn = createServerFn().handler(async () => (await later()) + db.x())
export const later = createServerFn().handler(async () => 'later:')`,
    expected: 'later:x',
  },
  {
    // Replaces createServerFn.test.ts "should remove imports used only as
    // caller handler identifiers" (N10).
    name: 'an imported function',
    code: `import { getUsers } from './users.server'
export const fn = createServerFn().handler(getUsers)`,
    expected: 'users',
  },
  {
    name: 'an initializer cast with as unknown as',
    code: `export const fn = createServerFn().handler(async () => db.x()) as unknown as () => Promise<string>`,
    expected: 'x',
  },
  {
    // Source: TanStack/router#3698
    name: 'a body calling other methods named handler',
    code: `const local = { handler: (value: string) => value + '!' }
export const fn = createServerFn().handler(async () =>
  local.handler([db].map((source) => ({ handler: source.y }))[0]!.handler() + db.x()),
)`,
    expected: 'yx!',
  },
])(
  'the handler can be $name',
  async ({ code, expected, read = async (value) => value }) => {
    expect(await read(await callHandler(code))).toEqual(expected)
  },
)

// Bug: when the handler passed to `.handler()` is a `createIsomorphicFn()`
// chain, the chain is compiled first and the caller is never rewritten into
// an RPC (same cause as the createServerOnlyFn handler pin in
// known-bugs-start-compiler.test.ts).
// Impact: the server fn cannot be called through an RPC; the client runs
// the isomorphic fn's client implementation instead.
// Source: TanStack/router#8446; #8504 handler-scope.test.ts (corpus-diff,
// imaimai17468/tanstack-start-handler-call-expression-repro; red on main)
test.fails('the handler can be a createIsomorphicFn call', async () => {
  expect(
    await callHandler(`import { createIsomorphicFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(
  createIsomorphicFn()
    .server(async () => db.x())
    .client(() => 'client'),
)`),
  ).toBe('x')
})

// Source: TanStack/router#7341. In a `.ts` module, `<T>value` is a type
// assertion and `<T>(value: T) => value` a generic arrow function, not JSX.
test('a handler in a .ts module can use angle-bracket type assertions', async () => {
  const id = '/test/src/module.ts'
  const code = `${head}import { db } from './db.server'
const identity = <T>(value: T) => value
export const fn = createServerFn().handler(async () => <string>identity(<unknown>db.x()))`
  const compiled = {} as Record<Output, string>
  for (const output of outputs) {
    compiled[output] = (await compileCode(output, code, { id }))!
    expect(
      await getModuleErrors(compiled[output], 'module.ts'),
      output,
    ).toEqual([])
  }
  expectNotLoaded(await moduleLoads(compiled.client, { id }), ['./db.server'])
  // Linked under the `.ts` id, the modules are evaluated as TypeScript.
  const server = { ssr: compiled.ssr, provider: compiled.provider, id }
  const stubs = { './db.server': dbServer }
  expect(await callProvider(server, 'fn', stubs)).toBe('x')
  const serverFns = (await compileServer(code, { id })).serverFns
  const ssr = await createServerGraph({ ...server, serverFns }, stubs).ssr()
  expect(await ssr.fn()).toBe('x')
})

// Each handler reads the module binding `value` (or `key`) through a scope
// that also declares, or seems to declare, the same name.
test.each<{ name: string; code: string; data?: unknown; expected: unknown }>([
  {
    // Source: @vitejs/plugin-rsc hoist/function-hoist-block.js (block-level
    // functions are block scoped in modules)
    name: 'past a function declared in a nested block',
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
    // Source: @vitejs/plugin-rsc hoist/catch-binding-shadow.js
    name: 'past a catch parameter of the same name',
    code: `const value = { message: 'outer' }
export const fn = createServerFn().handler(async () => {
  const readOuter = () => value.message
  try {
    throw new Error('inner')
  } catch (value) {
    return [value.message, readOuter()]
  }
})`,
    expected: ['inner', 'outer'],
  },
  {
    // Source: @vitejs/plugin-rsc hoist/class-declaration-in-body.js
    name: 'from a class declared in the handler',
    code: `const value = 'outer'
export const fn = createServerFn().handler(async () => {
  class Helper {
    run() {
      return value
    }
  }
  return new Helper().run()
})`,
    expected: 'outer',
  },
  {
    // Source: @vitejs/plugin-rsc hoist/computed-destructuring-key-captures-outer-binding.js
    name: 'through a computed destructuring key',
    code: `const key = 'value'
export const fn = createServerFn().handler(async ({ data }) => {
  const { [key]: picked } = data
  return picked
})`,
    data: { value: 'picked' },
    expected: 'picked',
  },
  {
    // Source: @vitejs/plugin-rsc hoist/destructured-param-default-bound.js
    name: 'from a destructured parameter default',
    code: `const value = 'outer'
export const fn = createServerFn().handler(async ({ data: { x = value } = {} }) => x)`,
    expected: 'outer',
  },
  {
    // Source: @vitejs/plugin-rsc scope/param-default-var-hoisting.js
    // (parameter defaults do not see var declarations of the body)
    name: 'from a parameter default next to a var of the same name',
    code: `const value = 'outer'
export const fn = createServerFn().handler(async ({ data = value }) => {
  var value = 'inner'
  return [data, value]
})`,
    expected: ['outer', 'inner'],
  },
  {
    // Source: @vitejs/plugin-rsc hoist/shadow-partial-if-block-over-outer-local.js
    name: 'past a block that shadows it in one branch',
    code: `const value = 'outer'
export const fn = createServerFn().handler(async () => {
  const pick = (flag: boolean) => {
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
    // Source: @vitejs/plugin-rsc scope/let-const-block.js;
    // typescript-eslint class/declaration/static-block.js
    name: 'next to loop, switch and static block locals of the same name',
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
    // Source: @vitejs/plugin-rsc hoist/self-ref-inner-shadow.js
    name: 'next to an inner function expression named like the server fn',
    code: `const value = 1
export const fn = createServerFn().handler(async ({ data }) => {
  const result = (function fn(m) {
    return m > 0 ? fn(m - 1) : 0
  })(data)
  return value + result
})`,
    data: 3,
    expected: 1,
  },
  {
    // Source: @vitejs/plugin-rsc hoist/methods.js
    name: 'as computed method names',
    code: `const key = 'computed'
export const fn = createServerFn().handler(async () => {
  const api = { async [key]() {} }
  class Actions {
    static async [key]() {
      return 'static'
    }
  }
  return [Object.keys(api), await Actions[key]()]
})`,
    expected: [['computed'], 'static'],
  },
  {
    // Source: @vitejs/plugin-rsc scope/label.js (labels are not references)
    name: 'next to a label of the same name',
    code: `const value = 'outer'
export const fn = createServerFn().handler(async () => {
  value: for (const item of [1, 2]) {
    if (item) {
      break value
    }
  }
  return value
})`,
    expected: 'outer',
  },
  {
    // Source: React Compiler fixtures (tagged templates)
    name: 'as a template tag',
    code: `const value = (strings: TemplateStringsArray, n: number) => strings[0] + n
export const fn = createServerFn().handler(async () => value\`id-\${1}\`)`,
    expected: 'id-1',
  },
  {
    // Source: React Compiler fixtures (shorthand properties)
    name: 'as a shorthand property',
    code: `const value = 'outer'
export const fn = createServerFn().handler(async () => ({ value }))`,
    expected: { value: 'outer' },
  },
])(
  'the provider keeps a module binding the handler reads $name',
  async ({ code, data, expected }) => {
    const server = await compileServer(`${head}${code}`)
    expect(await callProvider(server, 'fn', {}, data)).toEqual(expected)
  },
)

// Source: @vitejs/plugin-rsc hoist/self-ref-nested-function.js,
// hoist/direct-recursion-self-binding.js
test('a handler can call its own server fn', async () => {
  const server = await compileServer(
    `${head}export const fn = createServerFn().handler(async ({ data }) =>
  data > 0 ? fn({ data: data - 1 }) : 'done')`,
  )
  expect(await callProvider(server, 'fn', {}, 2)).toBe('done')
})

// Source: @vitejs/plugin-rsc hoist/captured-local-assignment.js,
// wrap-export.test.ts "preserve reference"
test('a handler and client code can both update an exported let', async () => {
  const compiled = await compileAll(`${head}export let count = 0
export function changeCount() {
  count += 1
  return count
}
export const bump = createServerFn().handler(async () => ++count)`)
  const client = await evaluateModule(compiled.client)
  expect(client.changeCount()).toBe(1)
  expect(client.count).toBe(1)
  const provider = await evaluateProvider(compiled)
  expect(await callProvider(provider, 'bump')).toBe(1)
  expect(await callProvider(provider, 'bump')).toBe(2)
})

// Source: Next.js server-actions fixtures server-graph/27
test('exported helpers the handler uses are callable from the handler', async () => {
  const compiled = await compileAll(`${head}import { db } from './db.server'
export async function load() {
  return db.x()
}
export default function helper() {
  return db.y()
}
export class Repo {
  static z() {
    return 'z'
  }
}
const local = () => 'w'
export { local as alias }
export const fn = createServerFn().handler(async () => [await load(), helper(), Repo.z(), local()])`)
  expect(
    await callProvider(compiled, 'fn', { './db.server': dbServer }),
  ).toEqual(['x', 'y', 'z', 'w'])
})
