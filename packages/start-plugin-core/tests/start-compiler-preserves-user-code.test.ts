import { transformWithOxc } from 'vite'
import { describe, expect, test, vi } from 'vitest'
import {
  callReportedServerFns,
  callServerFnThroughCallers,
  compileAll,
  compileCode,
  compileFor,
  compileServer,
  createTestModuleGraph,
  evaluateModule,
  moduleId,
  renderToHtml,
} from './regression-helpers'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import {
  expectMapsTo,
  positionAt,
  tokenOffsets,
} from '@tanstack/compiler-test-utils/source-maps'
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
    async ({ code, call }) => {
      const compiled = await compileCode('client', code)
      expect(await getModuleErrors(compiled!)).toEqual([])
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

// With the classic runtime the bundler compiles JSX to React.createElement
// after this compiler ran, so an import the source only reads in types is
// still needed by the JSX (SPEC J4.17, G12). Checked by rendering the client
// output after a classic JSX transform, with the real React.
test('keeps working with the classic JSX runtime downstream', async () => {
  const client = await compileCode(
    'client',
    `import * as React from 'react'
import { createServerFn } from '@tanstack/react-start'
export const getGreeting = createServerFn().handler(async () => 'hi')
export function Greeting({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>
}`,
  )
  const graph = createTestModuleGraph({
    modules: { [moduleId]: client! },
    // What `@vitejs/plugin-react` with `jsxRuntime: 'classic'` (or esbuild's
    // default) does after the Start compiler.
    transform: async (code, id) =>
      (
        await transformWithOxc(code, id, {
          lang: /\.tsx?$/.test(id) || id === moduleId ? 'tsx' : 'js',
          jsx: { runtime: 'classic' },
        })
      ).code,
  })
  const { Greeting } = await graph.import(moduleId)
  expect(await renderToHtml(Greeting({ children: 'hi' }))).toBe('<p>hi</p>')
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

// A JSON import written with the deprecated `assert` keyword (Node 22+ and
// the bundlers only read `with`) keeps working in every output (user ruling
// D9: `assert` stays supported; dropping it once nobody writes it is fine).
// Source: FIX-PLAN V2-23.
test('an import attribute written with assert keeps working in every output', async () => {
  const compiled =
    await compileAll(`import { createServerFn } from '@tanstack/react-start'
import config from './config.json' assert { type: 'json' }
import secrets from './secrets.json' assert { type: 'json' }
export const theme = config.theme
export const fn = createServerFn().handler(async () => secrets.key)`)
  const stubs = {
    './config.json': `{ "theme": "dark" }`,
    './secrets.json': `{ "key": "MARK_KEY" }`,
  }
  expect((await evaluateModule(compiled.client, stubs)).theme).toBe('dark')
  expect(
    await callServerFnThroughCallers(compiled, (module) => module.fn, stubs),
  ).toBe('MARK_KEY')
})

// Decorated classes (TypeScript `experimentalDecorators`) next to a server
// fn: every output is a valid module (running them, decorators included, is
// checked through real builds: integration/start-build-user-code.test.ts).
// Source: FIX-PLAN V2-23.
test('decorated classes next to a server fn compile to valid modules', async () => {
  await compileAll(`import { createServerFn } from '@tanstack/react-start'
const tag = (name: string) => (target: unknown) => target
@tag('repository')
class Repository {
  read() {
    return 'from repository'
  }
}
@tag('widget')
export class Widget {
  @tag('method') label() {
    return 'widget'
  }
}
export const fn = createServerFn().handler(async () => new Repository().read())`)
})

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

// Bug: the client output prints a type assertion that is the test of a
// conditional whose branch starts with a unary minus without its parentheses
// (`a as any ? -x : y`), which does not parse (`any ? -x` reads as the start
// of a conditional type). The root cause is upstream: @babel/generator 7.29.8
// drops the parentheses (parse+generate of `f = ((a) as any) ? -x : y` gives
// `f = a as any ? -x : y;`; no workaround here; router-utils/src/ast.ts:72
// `generateFromAst` prints with it). The code splitter has the same bug (pin
// in router-plugin/tests/known-bugs-code-splitter.test.ts).
// Impact: the module fails to parse, so the build fails.
// Source: fuzzing (oracle mode, round 2).
test.fails(
  'keeps the parentheses of an asserted conditional test',
  async () => {
    const client = await compileCode(
      'client',
      `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 1)
export function pick(flag: unknown, x: number, y: number) {
  return ((flag) as any) ? -x : y
}`,
    )
    expect(await getModuleErrors(client!)).toEqual([])
    expect((await evaluateModule(client!)).pick(true, 1, 2)).toBe(-1)
  },
)

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

// Parenthesized JSX keeps working.
test('client: keeps parenthesized JSX working', async () => {
  const client = await compilePageReturning('(<p>page</p>)')
  expect(await getModuleErrors(client)).toEqual([])
  expect(await renderToHtml((await evaluateModule(client)).Page())).toBe(
    '<p>page</p>',
  )
})

// Where license comments end up is free outside the code splitter (SPEC G12,
// user ruling OQ12). The `__NO_SIDE_EFFECTS__` annotations bundlers read are
// checked through a real production build
// (integration/start-build-user-code.test.ts).

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
    const [generated] = tokenOffsets(result.code!, { string: 'box' })
    expect(generated, 'the attribute value in the output').toBeDefined()
    const [original] = tokenOffsets(code, { string: 'box' })
    expectMapsTo(result.map as never, positionAt(result.code!, generated!), {
      file: '/test/src/module.tsx',
      ...positionAt(code, original!),
    })
  },
)
