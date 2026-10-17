import { SourceMapConsumer } from 'source-map'
import { describe, expect, test, vi } from 'vitest'
import {
  callReportedServerFns,
  compileCode,
  compileFor,
  compileHydrate,
  compileServer,
  evaluateModule,
  importSources,
} from './regression-helpers'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import type { ModuleStub, Output } from './regression-helpers'

// The compiler removes code that only served a transformed call. Everything
// else is user code that must survive, even when nothing seems to read it.

/**
 * Runs `evaluate` with recording stubs of the side effects the modules of
 * these tests run (`setInterval`, `./persist`, `./registry`, `./analytics`,
 * `./store`) and returns what ran, in order.
 */
async function recordSideEffectsOf(
  evaluate: (stubs: Record<string, ModuleStub>) => Promise<unknown>,
) {
  const calls: Array<string> = []
  const record =
    (name: string, value: unknown = {}) =>
    (...args: Array<unknown>) => {
      calls.push(
        [name, ...args.filter((arg) => typeof arg === 'string')].join(':'),
      )
      return value
    }
  vi.stubGlobal('setInterval', record('setInterval', 1))
  vi.stubGlobal('clearInterval', () => {})
  try {
    await evaluate({
      './persist': { createPersister: record('createPersister') },
      './registry': { register: record('register', 'registered') },
      './analytics': { registerAnalytics: record('registerAnalytics') },
      './store': { createStore: record('createStore') },
    })
  } finally {
    vi.unstubAllGlobals()
  }
  return calls
}

/**
 * Evaluates `code` with the recording stubs of `recordSideEffectsOf`, then
 * `run` on its exports, and returns what ran, in order.
 */
function recordSideEffects(
  code: string,
  run: (module: Record<string, any>) => void = () => {},
) {
  return recordSideEffectsOf(async (stubs) =>
    run(await evaluateModule(code, stubs)),
  )
}

/**
 * Compiles `code` into the modules of the SSR bundle, calls each server fn
 * the SSR caller reports through the module and export the report names
 * (like the server-fn resolver), with the recording stubs of
 * `recordSideEffectsOf`, and returns what ran, in order. The SSR caller only
 * runs if the provider imports it.
 */
async function recordServerSideEffects(code: string) {
  const server = await compileServer(code)
  return recordSideEffectsOf((stubs) =>
    callReportedServerFns(server, server.serverFns, stubs),
  )
}

// A declaration that only references itself, or a sibling that references
// it back, is still live: its initializer runs side effects.
test.each<{
  name: string
  code: string
  run?: (module: Record<string, any>) => void
  calls: Array<string>
}>([
  {
    name: 'a self-clearing interval',
    code: `import { createServerFn } from '@tanstack/react-start'
const interval = setInterval(() => {
  clearInterval(interval)
}, 1000)
export const fn = createServerFn().handler(async () => 1)`,
    calls: ['setInterval'],
  },
  {
    name: 'mutually-referencing declarations',
    code: `import { createServerFn } from '@tanstack/react-start'
import { createPersister } from './persist'
const persister = createPersister({ onRestore: () => restore() })
function restore() {
  persister.restore()
}
export const fn = createServerFn().handler(async () => 1)`,
    calls: ['createPersister'],
  },
  {
    // Source: #8504 start-compiler-preserves-user-code.test.ts (inputs
    // adapted from @babel/plugin-proposal-decorators
    // 2023-11-misc/destructuring-transform-integration and TypeScript's
    // conformance test classes/propertyMemberDeclarations/autoAccessor10.ts)
    name: 'declarations only an unused local inside them reads',
    code: `import { createServerFn } from '@tanstack/react-start'
import { register } from './registry'
const plugin = {
  id: register('plugin'),
  describe() {
    const self = plugin
    return 'plugin'
  },
}
class Widget {
  static {
    register('widget')
  }
  render() {
    const type = Widget
    return 'widget'
  }
}
export const fn = createServerFn().handler(async () => 1)`,
    calls: ['register:plugin', 'register:widget'],
  },
  {
    // Source: #8504 start-compiler-preserves-user-code.test.ts (the
    // destructuring runs the getter)
    name: 'a destructuring only an unused local inside it reads',
    code: `import { createServerFn } from '@tanstack/react-start'
import { register } from './registry'
const { plugin } = {
  get plugin() {
    register('getter')
    return {
      describe() {
        const self = plugin
        return 'plugin'
      },
    }
  },
}
export const fn = createServerFn().handler(async () => 1)`,
    calls: ['register:getter'],
  },
  {
    // Source: #8504 start-compiler-preserves-user-code.test.ts (the
    // statement runs on every call of Page)
    name: 'a statement in a function body that only an uncalled nested function reads',
    code: `import { createServerFn } from '@tanstack/react-start'
import { register } from './registry'
export function Page() {
  function describe() {
    const self = describe
    return effect
  }
  const effect = register('nested-effect')
  return 'page'
}
export const fn = createServerFn().handler(async () => 1)`,
    run: (module) => module.Page(),
    calls: ['register:nested-effect'],
  },
])('keeps $name', async ({ code, run, calls }) => {
  const client = await compileCode('client', code)
  expect(await getModuleErrors(client!)).toEqual([])
  expect(await recordSideEffects(client!, run)).toEqual(calls)
})

// TypeScript erases type positions, so a declaration whose binding only
// appears in a type is still live JavaScript: its initializer runs once at
// import time.
describe('keeps a declaration only referenced from types', () => {
  const typeQuery = {
    name: 'a typeof type query',
    call: 'registerAnalytics:analytics-marker',
    imported: './analytics',
    code: `import { createServerFn } from '@tanstack/react-start'
import { registerAnalytics } from './analytics'
const analytics = registerAnalytics('analytics-marker')
type Analytics = typeof analytics
export function describeClient(client?: Analytics) {
  return client ? 'custom' : 'default'
}
export const getPosts = createServerFn().handler(async () => [])`,
  }
  const globalAugmentation = {
    name: 'a global augmentation',
    call: 'createStore:store-marker',
    imported: './store',
    code: `import { createIsomorphicFn } from '@tanstack/react-start'
import { createStore } from './store'
const store = createStore('store-marker')
declare global {
  interface Window {
    appStore?: typeof store
  }
}
export const getKind = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')`,
  }

  test.each([typeQuery, globalAugmentation])(
    'client: $name',
    async ({ code, call, imported }) => {
      const compiled = await compileCode('client', code)
      expect(await getModuleErrors(compiled!)).toEqual([])
      expect(importSources(compiled!)).toContain(imported)
      expect(await recordSideEffects(compiled!)).toEqual([call])
    },
  )

  // Handling a server fn call runs the module's initializer, once.
  test(`server: ${typeQuery.name}`, async () => {
    expect(await recordServerSideEffects(typeQuery.code)).toEqual([
      typeQuery.call,
    ])
  })
})

test('accepts type-only namespace imports and exports, and a type and a value exported under the same name', async () => {
  const client = await compileCode(
    'client',
    `import { createServerFn } from '@tanstack/react-start'
import type * as Start from '@tanstack/react-start'
export type * as start from '@tanstack/react-start'
export type User = { name: string; register?: Start.Register }
function User(name: string): User {
  return { name }
}
export { User }
export const getUser = createServerFn().handler(async () => User('Ada'))`,
  )
  const module = await evaluateModule(client!)
  expect(module.User('Ada')).toEqual({ name: 'Ada' })
})

test('keeps a React import the classic JSX runtime needs', async () => {
  // With the classic runtime the bundler compiles JSX to React.createElement
  // after this compiler ran, so an import only used in types is still needed.
  const client = await compileCode(
    'client',
    `import * as React from 'react'
import { createServerFn } from '@tanstack/react-start'
export const getGreeting = createServerFn().handler(async () => 'hi')
export function Greeting({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>
}`,
  )
  expect(importSources(client!)).toEqual(['react'])
})

test('keeps a namespace only read through a TypeScript import alias', async () => {
  // `import red = Labels.red` compiles to `var red = Labels.red`.
  const client = await compileCode(
    'client',
    `import { createServerFn } from '@tanstack/react-start'
namespace Labels {
  export const red = 'red'
}
import red = Labels.red
export const label = red
export const fn = createServerFn().handler(async () => red)`,
  )
  expect((await evaluateModule(client!)).label).toBe('red')
})

// An empty destructuring pattern binds nothing, but its initializer still
// runs, once: when the client loads the module, and when the server handles
// a call of the module's server fn.
// Bug: dead-code elimination removes a declaration whose pattern binds no
// name (`const {} = init()`, `const [] = other()`), initializer included.
// Impact: the initializer's side effects (a registration, a setup call) no
// longer run in the client or on the server.
// Source: babel-dead-code-elimination "object pattern" > "unzips if all
// variables are unused", "array pattern" > "unzips if all variables are
// unused"; #8504 start-compiler-preserves-user-code.test.ts (red on main)
test.fails.each(['client', 'server'] as const)(
  '%s: keeps the initializers of empty destructuring patterns',
  async (env) => {
    const code = `import { createServerFn } from '@tanstack/react-start'
import { init, other } from './init'
const {} = init()
const [] = other()
const { a: {} } = init()
export const fn = createServerFn().handler(async () => 'ok')`
    const calls: Array<string> = []
    const stubs = {
      './init': {
        init: () => {
          calls.push('init')
          return { a: {} }
        },
        other: () => {
          calls.push('other')
          return []
        },
      },
    }
    if (env === 'client') {
      await evaluateModule((await compileCode('client', code))!, stubs)
    } else {
      const server = await compileServer(code)
      expect(
        await callReportedServerFns(server, server.serverFns, stubs),
      ).toEqual(['ok'])
    }
    expect(calls).toEqual(['init', 'other', 'init'])
  },
)

// Bug: the client output prints an asserted update operand without its
// parentheses (`count as number++`).
// Impact: the module fails to parse, so the build fails.
// Source: typescript-eslint type-assertion/increment/as-increment.js,
// type-assertion/increment/non-null-increment.js, type-assertion/satisfies.js;
// #8504 start-compiler-preserves-user-code.test.ts (red on main)
test.fails('keeps the parentheses of asserted update operands', async () => {
  const client = await compileCode(
    'client',
    `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 1)
let count = 0
export function bump() {
  ;(count as number)++
  ;(count satisfies number)++
  count!++
  ;(count as any) += 1
  return count
}`,
  )
  expect(await getModuleErrors(client!)).toEqual([])
  expect((await evaluateModule(client!)).bump()).toBe(4)
})

/** Compiles a module whose `Page` returns `expression` for the client. */
async function compilePageReturning(expression: string) {
  const client = await compileCode(
    'client',
    `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 1)
export function Page() {
  return ${expression}
}`,
  )
  return client!
}

// Control for the pin below (same harness): parenthesized JSX alone.
test('client: keeps parenthesized JSX working', async () => {
  const client = await compilePageReturning('(<p>page</p>)')
  expect(await getModuleErrors(client)).toEqual([])
  expect((await evaluateModule(client)).Page()).toBe('<p>page</p>')
})

// Bug: the client output prints parenthesized JSX under a non-null assertion
// or a member access without its parentheses (`<p>page</p>!`). The root
// cause is upstream: @babel/generator 7.29.8 drops the parentheses (no
// workaround here; router-utils/src/ast.ts:72 `generateFromAst` prints with
// it). The code splitter has the same bug (pin in
// router-plugin/tests/known-bugs-code-splitter.test.ts).
// Impact: the module fails to parse ("Expected a semicolon"), so the build
// fails.
// Source: fuzzing (oracle mode, N3).
test.fails.each([
  { name: 'a non-null assertion', expression: '(<p>page</p>)!' },
  {
    name: 'a non-null assertion of a fragment',
    expression: '(<><i /></>)!',
    rendered: '<i></i>',
  },
  { name: 'a member call', expression: '(<p>page</p>).valueOf()' },
])(
  'client: keeps parenthesized JSX under $name working',
  async ({ expression, rendered = '<p>page</p>' }) => {
    const client = await compilePageReturning(expression)
    expect(await getModuleErrors(client)).toEqual([])
    expect((await evaluateModule(client)).Page()).toBe(rendered)
  },
)

// Bug: same root cause as above, for the `fallback` of a `<Hydrate>`, which
// the client parent keeps.
// Impact: the client parent fails to parse, so the build fails.
// Source: fuzzing (oracle mode, N3).
test.fails(
  'client: keeps a parenthesized JSX fallback under a non-null assertion of a Hydrate working',
  async () => {
    const { parent, chunks } = await compileHydrate(
      'client',
      `import { Hydrate } from '@tanstack/react-start'
export function Page() {
  return <Hydrate fallback={(<div>wait</div>)!}><p>page</p></Hydrate>
}`,
    )
    expect(
      await Promise.all(
        [parent, ...chunks].map((code) => getModuleErrors(code)),
      ),
    ).toEqual([[], []])
  },
)

// Bundlers read these comments: minifiers keep legal comments, and Rollup and
// Rolldown treat calls of functions annotated `__NO_SIDE_EFFECTS__` as pure.
// Source: #8504 start-compiler-preserves-user-code.test.ts
describe('keeps the comments bundlers read', () => {
  const legal = '/*! Example Corp. | MIT License */'

  test('client: a leading legal comment survives the removal of the import it leads', async () => {
    const client = await compileCode(
      'client',
      `${legal}
import { createIsomorphicFn } from '@tanstack/react-start'
const where = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')
export const label = () => where()`,
    )
    expect(client).toContain(legal)
  })

  test('client: a Hydrate chunk keeps the leading legal comment of its module', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `${legal}
import { Hydrate } from '@tanstack/react-start'
export function Page() {
  return <Hydrate><p>hi</p></Hydrate>
}`,
    )
    expect(chunks[0]).toContain(legal)
  })

  // Wherever an output declares the annotated function (a Hydrate chunk or
  // the provider may import it from the parent module instead), the
  // annotation still leads the declaration.
  test.each([
    {
      name: 'function',
      code: `/* #__NO_SIDE_EFFECTS__ */
export function makeLabel() {
  return 'label'
}`,
    },
    {
      name: 'arrow function',
      code: `/* @__NO_SIDE_EFFECTS__ */
export const makeLabel = () => 'label'`,
    },
  ])(
    'the annotation of an exported $name leads it in every output that declares it',
    async ({ code }) => {
      const source = `import { Hydrate, createServerFn } from '@tanstack/react-start'
${code}
export const fn = createServerFn().handler(async () => makeLabel())
export function Page() {
  return <Hydrate><p>{makeLabel()}</p></Hydrate>
}`
      const { parent, chunks } = await compileHydrate('client', source)
      const provider = await compileCode('provider', source)
      const declares = /\b(?:function|const) makeLabel\b/
      const declaring = [parent, chunks[0]!, provider!].filter((output) =>
        declares.test(output),
      )
      expect(declaring.length).toBeGreaterThan(0)
      for (const output of declaring) {
        expect(output).toMatch(
          /__NO_SIDE_EFFECTS__ \*\/\s*(?:export\s+)?(?:function|const) makeLabel\b/,
        )
      }
    },
  )
})

// Source maps point to the user's code (R6).
// Source: #8504 start-compiler-preserves-user-code.test.ts
test.each(['client', 'ssr'] satisfies Array<Output>)(
  '%s: maps the string value of a JSX attribute to its own source column',
  async (output) => {
    const code = `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 1)
export const Box = () => <div className="box" />
`
    const result = await compileFor(output, code)
    const lines = result.code!.split('\n')
    const line = lines.findIndex((text) => text.includes('"box"'))
    expect(line).toBeGreaterThanOrEqual(0)
    const consumer = await new SourceMapConsumer(result.map as never)
    try {
      expect(
        consumer.originalPositionFor({
          line: line + 1,
          column: lines[line]!.indexOf('"box"'),
        }),
      ).toMatchObject({
        line: 3,
        column: code.split('\n')[2]!.indexOf('"box"'),
      })
    } finally {
      consumer.destroy()
    }
  },
)

// Devtools and error reporters show the original source from the map. The
// client is left out: whether client maps should carry stripped server code
// (D1) is out of scope.
test('ssr: the map carries the original source', async () => {
  const code = `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'x')
`
  const result = await compileFor('ssr', code)
  expect(result.map?.sourcesContent).toEqual([code])
})
