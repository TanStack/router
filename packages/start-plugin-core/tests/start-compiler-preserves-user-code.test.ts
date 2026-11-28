import { pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, test } from 'vitest'
import {
  expectMapsTo,
  positionAt,
  tokenOffsets,
} from '@tanstack/compiler-test-utils/source-maps'
import { closeAfterAll } from './file-end'
import {
  callFromClient,
  callServerFnThroughCallers,
  createStartHost,
  inPage,
  serveCase,
} from './regression-helpers'
import type { StartCase, StartHost } from './regression-helpers'

/**
 * The host's app tsconfig (`start-host.ts`), which a case's own
 * `tsconfig.json` extends with the TypeScript settings it is about.
 */
const hostTsconfig = {
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    jsx: 'react-jsx',
    strict: true,
    verbatimModuleSyntax: true,
  },
}

// The compiler removes code that only served a transformed call. Everything
// else is user code that must survive, even when nothing seems to read it.
// Observed through the public Start host (`./start-host`): the client in a
// real page, the server in the SSR environment and in real requests.

let host: StartHost
const openHost = closeAfterAll()
beforeAll(async () => {
  host = await openHost(() => createStartHost())
}, 60_000)
beforeAll(async () => {
  await host.page()
}, 60_000)

/** Where the recording modules below record, in the realm they run in. */
const effectsKey = '__startHostSideEffects'

/** A recording function `name` (returning `value`) of a recording module. */
const recorder = (name: string, value: string) =>
  `export const ${name} = (...args: Array<unknown>) => {
  ;((globalThis as any).${effectsKey} ??= []).push([${JSON.stringify(name)}, ...args.filter((arg) => typeof arg === 'string')].join(':'))
  return ${value}
}
`

/**
 * The modules of the side effects these tests run (`./persist`,
 * `./registry`, `./analytics`, `./store`), each recording its calls, in
 * order, and `recorder.ts`, which starts the record and replaces
 * `setInterval` with a recording one (`restore()` puts it back).
 */
const effectFiles = {
  'persist.ts': recorder('createPersister', '{}'),
  'registry.ts': recorder('register', "'registered'"),
  'analytics.ts': recorder('registerAnalytics', '{}'),
  'store.ts': recorder('createStore', '{}'),
  // modules recording that they ran
  'side.ts': `;((globalThis as any).${effectsKey} ??= []).push('side')
export const unused = 'unused'
`,
  'side-too.ts': `;((globalThis as any).${effectsKey} ??= []).push('side-too')
export const label = 'label'
export const unusedToo = 'unused'
`,
  'recorder.ts': `const original = { setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval }
;(globalThis as any).${effectsKey} = []
;(globalThis as any).setInterval = (...args: Array<unknown>) => {
  ;(globalThis as any).${effectsKey}.push('setInterval')
  return 1
}
;(globalThis as any).clearInterval = () => {}
export function restore() {
  Object.assign(globalThis, original)
}
`,
}

/**
 * Imports the case module in the page after `recorder.ts`, runs `run` (a
 * page script with the case module as `m`) and returns what ran, in order.
 */
async function recordClientSideEffects(startCase: StartCase, run = '') {
  return inPage(
    startCase,
    `try {
  const m = await load('module.tsx')
  ${run}
  return globalThis.${effectsKey}
} finally {
  module.restore()
}`,
    { file: 'recorder.ts' },
  )
}

/** A case of `code` with the recording modules. */
async function effectCase(started: StartHost, code: string) {
  return started.case({ 'module.tsx': code, ...effectFiles })
}

// A declaration that only references itself, or a sibling that references
// it back, is still live: its initializer runs side effects.
test.each<{
  name: string
  code: string
  /** A page script with the module as `m`. */
  run?: string
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
    run: 'm.Page()',
    calls: ['register:nested-effect'],
  },
  {
    // An import nothing reads was dead before the compiler ran: its module
    // still runs, as it does when the statement keeps a specifier only the
    // erased handler read.
    name: 'the modules of an import nothing reads and of an import statement whose other specifier only the handler reads',
    code: `import { createServerFn } from '@tanstack/react-start'
import { unused } from './side'
import { label, unusedToo } from './side-too'
export const fn = createServerFn().handler(async () => label)`,
    calls: ['side', 'side-too'],
  },
])('keeps $name', async ({ code, run, calls }) => {
  const startCase = await effectCase(host, code)
  // The client serves a module that imports and runs
  await startCase.served()
  expect(await recordClientSideEffects(startCase, run)).toEqual(calls)
})

// Effectful declarations only a server fn's handler reads: the server
// evaluates them once, in source order, wherever the handler lives there;
// the client, where the handler is erased, runs none of them.
test('effectful declarations only a handler reads run once on the server, in source order', async () => {
  const startCase = await effectCase(
    host,
    `import { createServerFn } from '@tanstack/react-start'
import { register } from './registry'
const first = register('first')
const second = register('second')
const third = register('third')
export const fn = createServerFn().handler(async () => [first, second, third])`,
  )
  // before a call loads the module in the page
  expect(await recordClientSideEffects(startCase)).toEqual([])
  const global = globalThis as Record<string, unknown>
  global[effectsKey] = []
  try {
    expect(await callFromClient(startCase, 'module.fn')).toEqual([
      'registered',
      'registered',
      'registered',
    ])
    await callFromClient(startCase, 'module.fn')
    expect(global[effectsKey]).toEqual([
      'register:first',
      'register:second',
      'register:third',
    ])
  } finally {
    delete global[effectsKey]
  }
})

// The same with a declaration the module keeps calling the same import, and
// an effect between two augmentations of an object only the handler reads:
// the server runs every one once, in source order, when the module loads:
// the writes are statements, which stay with what they name (R154), and the
// handler module imports the object. The client, which keeps the augmented
// object, runs them in source order too.
test('effectful declarations and augmentations a handler reads run once each, the object with its writes in order', async () => {
  const startCase = await effectCase(
    host,
    `import { createServerFn } from '@tanstack/react-start'
import { register } from './registry'
export const kept = register('kept')
const tools = { name: register('tools') }
;(tools as any).first = register('first')
register('middle')
;(tools as any).second = register('second')
export const fn = createServerFn().handler(async () => [
  kept,
  tools.name,
  (tools as any).first,
  (tools as any).second,
])`,
  )
  const calls = [
    'register:kept',
    'register:tools',
    'register:first',
    'register:middle',
    'register:second',
  ]
  expect(await recordClientSideEffects(startCase)).toEqual(calls)
  const serverCalls = calls
  const global = globalThis as Record<string, unknown>
  global[effectsKey] = []
  try {
    expect(await callFromClient(startCase, 'module.fn')).toEqual([
      'registered',
      'registered',
      'registered',
      'registered',
    ])
    await callFromClient(startCase, 'module.fn')
    expect(global[effectsKey]).toEqual(serverCalls)
  } finally {
    delete global[effectsKey]
  }
})

// A top-level statement that is not a declaration is kept, with what it
// names, when the code the compiler erases was the only other reader of a
// binding it writes: whether writing that binding changes anything else
// (another module's object, the document, a setter, a user method named
// like a built-in one, a call in the written value) has no syntactic
// answer. Source: review-erasure-deletion-bounded.md rows 15 to 23, each
// a statement main keeps and runs, and the client used to delete.
describe('keeps a top-level statement on a binding only an erased handler reads', () => {
  /** A module recording its calls in `globalThis.caseCalls`. */
  const calls = `const record = (name: string) => {
  ;((globalThis as any).caseCalls ??= []).push(name)
  return name
}
export const register = (name: string) => record(name)
export const track = (name: string) => record(name)
export const connect = (name: string) => record(name)
export const connectPair = () => {
  record('pair')
  return { a: 1, b: 2 }
}
`
  const serverFn = `import { createServerFn } from '@tanstack/react-start'\n`
  test.each<{
    name: string
    files: Record<string, string>
    /** A page script (fresh document, the module imported) whose JSON value is checked. */
    run: string
    result: unknown
  }>([
    {
      name: "a write through a binding holding another module's object",
      files: {
        'config.ts': `export const config = { flags: {} as Record<string, boolean> }`,
        'module.tsx': `${serverFn}import { config } from './config'
const flags = config.flags
flags.newUi = true
export const fn = createServerFn().handler(async () => flags.newUi)`,
      },
      run: `return (await load('config.ts')).config.flags.newUi`,
      result: true,
    },
    {
      name: 'writes to the document through a binding',
      files: {
        'module.tsx': `${serverFn}const root = document.documentElement
root.classList.add('case-dark')
root.dataset.caseTheme = 'dark'
export const fn = createServerFn().handler(async () => root.className)`,
      },
      run: `return [document.documentElement.classList.contains('case-dark'), document.documentElement.dataset.caseTheme]`,
      result: [true, 'dark'],
    },
    {
      name: "a push into another module's array",
      files: {
        'items.ts': `export const store = { items: [] as Array<string> }`,
        'module.tsx': `${serverFn}import { store } from './items'
const view = store.items
view.push('x')
export const fn = createServerFn().handler(async () => view)`,
      },
      run: `return (await load('items.ts')).store.items`,
      result: ['x'],
    },
    {
      name: 'a push into a global array',
      files: {
        'plugins.ts': `;(globalThis as any).casePlugins = []`,
        'module.tsx': `${serverFn}import './plugins'
const list = (globalThis as any).casePlugins
list.push('plugin')
export const fn = createServerFn().handler(async () => list)`,
      },
      run: `return globalThis.casePlugins`,
      result: ['plugin'],
    },
    {
      name: "a write through an object literal holding another module's object",
      files: {
        'config.ts': `export const config: Record<string, unknown> = {}`,
        'module.tsx': `${serverFn}import { config } from './config'
const holder = { c: config }
holder.c.v = 1
export const fn = createServerFn().handler(async () => holder)`,
      },
      run: `return (await load('config.ts')).config.v`,
      result: 1,
    },
    {
      name: "a write after reassigning a binding to another module's object",
      files: {
        'targets.ts': `export const a: Record<string, unknown> = {}
export const b: Record<string, unknown> = {}`,
        'module.tsx': `${serverFn}import { a, b } from './targets'
let cur = a
cur = b
cur.v = 1
export const fn = createServerFn().handler(async () => cur)`,
      },
      run: `const t = await load('targets.ts')
return [t.a.v ?? null, t.b.v]`,
      result: [null, 1],
    },
    {
      name: 'a call of a user method named like an array method',
      files: {
        'module.tsx': `${serverFn}const bus = {
  push(e: string) {
    ;((globalThis as any).caseBus ??= []).push(e)
  },
}
bus.push('ready')
export const fn = createServerFn().handler(async () => bus)`,
      },
      run: `return globalThis.caseBus`,
      result: ['ready'],
    },
    {
      name: 'a call of a function property named like a Set method',
      files: {
        'module.tsx': `${serverFn}function log(m: string) {
  return m
}
log.add = (m: string) => {
  ;((globalThis as any).caseLog ??= []).push(m)
}
log.add('boot')
export const fn = createServerFn().handler(async () => log('x'))`,
      },
      run: `return globalThis.caseLog`,
      result: ['boot'],
    },
    {
      name: 'an assignment that runs a setter',
      files: {
        'module.tsx': `${serverFn}const state = {
  set title(v: string) {
    document.title = v
  },
}
state.title = 'case-title'
export const fn = createServerFn().handler(async () => state)`,
      },
      run: `return document.title`,
      result: 'case-title',
    },
    {
      name: 'a push of a call',
      files: {
        'calls.ts': calls,
        'module.tsx': `${serverFn}import { register } from './calls'
const list: Array<string> = []
list.push(register('list'))
export const fn = createServerFn().handler(async () => list)`,
      },
      run: `return globalThis.caseCalls`,
      result: ['list'],
    },
    {
      name: 'a property set to a call',
      files: {
        'calls.ts': calls,
        'module.tsx': `${serverFn}import { track } from './calls'
function Page() {
  return null
}
Page.tracker = track('page')
export const fn = createServerFn().handler(async () => Page.tracker)`,
      },
      run: `return globalThis.caseCalls`,
      result: ['page'],
    },
    {
      name: 'an assignment of a call to a `let`',
      files: {
        'calls.ts': calls,
        'module.tsx': `${serverFn}import { connect } from './calls'
let db: unknown
db = connect('db')
export const fn = createServerFn().handler(async () => db)`,
      },
      run: `return globalThis.caseCalls`,
      result: ['db'],
    },
    {
      name: 'a destructuring assignment of a call',
      files: {
        'calls.ts': calls,
        'module.tsx': `${serverFn}import { connectPair } from './calls'
let a: unknown, b: unknown
;({ a, b } = connectPair())
export const fn = createServerFn().handler(async () => [a, b])`,
      },
      run: `return globalThis.caseCalls`,
      result: ['pair'],
    },
  ])('client: $name', async ({ files, run, result }) => {
    const startCase = await host.case(files)
    const page = await startCase.client(run, { fresh: true })
    expect(page.errors).toEqual([])
    expect(page.result).toEqual(result)
  })

  // The same on the server, where a createClientOnlyFn's body is erased
  // (row 35)
  test('server: a push into a global array only a client-only function reads', async () => {
    const startCase = await host.case({
      'queue.ts': `;(globalThis as any).caseQueue = []`,
      'module.tsx': `import { createClientOnlyFn } from '@tanstack/react-start'
import './queue'
const queue = (globalThis as any).caseQueue
queue.push('boot')
export const read = createClientOnlyFn(() => queue)`,
    })
    const global = globalThis as Record<string, unknown>
    try {
      await startCase.ssr()
      expect(global.caseQueue).toEqual(['boot'])
    } finally {
      delete global.caseQueue
    }
  })
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

  // (an ambient declaration nobody names is read when it is named: T7)
  test('client: a global augmentation', async () => {
    const startCase = await effectCase(host, globalAugmentation.code)
    expect(await recordClientSideEffects(startCase)).toEqual([
      globalAugmentation.call,
    ])
  })

  // a type never keeps a value (user decision, 2026-11-25): an annotation of
  // code that runs names what it names, here through a local alias; the
  // declaration leaves with its evaluation, client and server (it stayed)
  test(`client: ${typeQuery.name} names what it names`, async () => {
    const startCase = await effectCase(host, typeQuery.code)
    expect(await recordClientSideEffects(startCase)).toEqual([])
  })

  // Handling a server fn call runs the module's initializer, once: what the
  // server records while it handles a client's call (the module is first
  // evaluated by that request).
  test(`server: ${typeQuery.name} names what it names`, async () => {
    const startCase = await effectCase(host, typeQuery.code)
    const global = globalThis as Record<string, unknown>
    global[effectsKey] = []
    try {
      expect(await callFromClient(startCase, 'module.getPosts')).toEqual([])
      expect(global[effectsKey]).toEqual([])
    } finally {
      delete global[effectsKey]
    }
  })
})

test('accepts type-only namespace imports and exports, and a type and a value exported under the same name', async () => {
  const served = await serveCase(host, {
    'module.tsx': `import { createServerFn } from '@tanstack/react-start'
import type * as Start from '@tanstack/react-start'
export type * as start from '@tanstack/react-start'
export type User = { name: string; register?: Start.Register }
function User(name: string): User {
  return { name }
}
export { User }
export const getUser = createServerFn().handler(async () => User('Ada'))`,
  })
  expect(await inPage(served, `return module.User('Ada')`)).toEqual({
    name: 'Ada',
  })
})

// TypeScript allows a type-only import and a value of the same name. The
// client erases the handler, the only reader of `Badge`; the declaration
// stays type-only (`import { Label }` would be a runtime import of a type
// the module does not export, with the host's `verbatimModuleSyntax`).
test('keeps a type-only import type-only when the client erases a value of the same name', async () => {
  const served = await serveCase(host, {
    'labels.ts': `export type Badge = { name: string }
export type Label = string`,
    'module.tsx': `import { createServerFn } from '@tanstack/react-start'
import type { Badge, Label } from './labels'
export type Kept = Label
function Badge(name: string): Badge {
  return { name }
}
export const getBadge = createServerFn().handler(async () => Badge('Ada'))`,
  })
  expect(await callFromClient(served, 'module.getBadge')).toEqual({
    name: 'Ada',
  })
})

// With the classic runtime the bundler compiles JSX to React.createElement
// after this compiler ran, so an import the source only reads in types is
// still needed by the JSX (SPEC J4.17, G12). Checked by rendering the
// module of an app whose React plugin uses the classic runtime
// (`react({ jsxRuntime: 'classic' })`), with the real React.
describe('keeps working with the classic JSX runtime downstream', () => {
  let classic: StartHost
  const openClassic = closeAfterAll()
  beforeAll(async () => {
    classic = await openClassic(() =>
      createStartHost({ react: { jsxRuntime: 'classic' } }),
    )
  }, 60_000)

  test('the client and the server render it', async () => {
    const served = await serveCase(classic, {
      'module.tsx': `import * as React from 'react'
import { createServerFn } from '@tanstack/react-start'
export const getGreeting = createServerFn().handler(async () => 'hi')
export function Greeting({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>
}`,
      'render.tsx': `import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Greeting } from './module'
export const html = () => renderToStaticMarkup(<Greeting>hi</Greeting>)
`,
    })
    expect(
      await inPage(
        served,
        `const element = module.Greeting({ children: 'hi' })
return { type: element.type, children: element.props.children }`,
      ),
    ).toEqual({ type: 'p', children: 'hi' })
    expect((await served.ssr('render.tsx')).html()).toBe('<p>hi</p>')
  })
})

test('keeps a namespace only read through a TypeScript import alias', async () => {
  // `import red = Labels.red` compiles to `var red = Labels.red`.
  const served = await serveCase(host, {
    'module.tsx': `import { createServerFn } from '@tanstack/react-start'
namespace Labels {
  export const red = 'red'
}
import red = Labels.red
export const label = red
export const fn = createServerFn().handler(async () => red)`,
  })
  expect(await inPage(served, 'return module.label')).toBe('red')
})

// A JSON import written with the deprecated `assert` keyword (Node 22+ and
// the bundlers only read `with`) keeps working in every output (SPEC J2.17:
// `assert` stays supported; dropping it once nobody writes it is fine).
test('an import attribute written with assert keeps working in every output', async () => {
  const served = await serveCase(host, {
    'module.tsx': `import { createServerFn } from '@tanstack/react-start'
import config from './config.json' assert { type: 'json' }
import secrets from './secrets.json' assert { type: 'json' }
export const theme = config.theme
export const fn = createServerFn().handler(async () => secrets.key)`,
    'config.json': `{ "theme": "dark" }`,
    'secrets.json': `{ "key": "MARK_KEY" }`,
  })
  expect(await inPage(served, 'return module.theme')).toBe('dark')
  expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('MARK_KEY')
})

// Decorated classes (TypeScript `experimentalDecorators`) next to a server
// fn: every environment serves and evaluates the module (running them,
// decorators included, is checked through real builds too:
// integration/start-build-user-code.test.ts).
test('decorated classes next to a server fn compile to valid modules', async () => {
  const served = await serveCase(host, {
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        ...hostTsconfig.compilerOptions,
        experimentalDecorators: true,
      },
    }),
    'module.tsx': `import { createServerFn } from '@tanstack/react-start'
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
export const fn = createServerFn().handler(async () => new Repository().read())`,
  })
  expect(await inPage(served, 'return new module.Widget().label()')).toBe(
    'widget',
  )
  expect(await callFromClient(served, 'module.fn')).toBe('from repository')
})

// TypeScript's decorator metadata (`emitDecoratorMetadata`: DI containers,
// ORMs, validation DTOs) reads the class a decorated member names in its type
// when the class is defined: the import stays a value the class reads,
// wherever the class runs (`main` keeps it; astra-r3 fact-check B3).
test.each([
  { name: 'only the handler reads the class', exported: '' },
  { name: 'the module exports the class too', exported: 'export { Entity }' },
])(
  'decorator metadata records the imported class a decorated member names in its type when $name',
  async ({ exported }) => {
    const served = await serveCase(host, {
      'module.tsx': `import { createServerFn } from '@tanstack/react-start'
import { Model } from './model'
;(Reflect as any).metadata = (key: string, value: any) => (target: any) => {
  if (key === 'design:type') target.constructor.recorded = value.name
}
const seen = (..._args: Array<unknown>): any => {}
class Entity {
  @seen model!: Model
}
${exported}
export const fn = createServerFn().handler(async () => (Entity as any).recorded)`,
      'model.ts': 'export class Model {}',
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          ...hostTsconfig.compilerOptions,
          verbatimModuleSyntax: false,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        },
      }),
    })
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('Model')
    expect(await inPage(served, 'return module.Entity?.recorded ?? null')).toBe(
      exported === '' ? null : 'Model',
    )
  },
)

// On main, the module fails to parse, so the build fails.
// Source: typescript-eslint type-assertion/increment/as-increment.js,
// type-assertion/increment/non-null-increment.js, type-assertion/satisfies.js;
// #8504 start-compiler-preserves-user-code.test.ts (red on main)
test('keeps the parentheses of asserted update operands', async () => {
  const served = await serveCase(host, {
    'module.tsx': `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 1)
let count = 0
export function bump() {
  ;(count as number)++
  ;(count satisfies number)++
  count!++
  ;(count as any) += 1
  return count
}`,
  })
  expect(await inPage(served, 'return module.bump()')).toBe(4)
})

// On main, the module fails to parse, so the build fails.
// Source: fuzzing.
test('keeps the parentheses of an asserted conditional test', async () => {
  const served = await serveCase(host, {
    'module.tsx': `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 1)
export function pick(flag: unknown, x: number, y: number) {
  return ((flag) as any) ? -x : y
}`,
  })
  expect(await inPage(served, 'return module.pick(true, 1, 2)')).toBe(-1)
})

// A string statement after a declaration is no directive (SPEC J4.17, G12):
// the client erases the declaration only the server-only function reads,
// and the string stays an expression (as a directive, `'use strict'` is a
// syntax error in a function with a rest parameter).
// Source: whole-PR review C5-02 (Astra C5 #1)
test('client: a string statement after an erased declaration stays an expression', async () => {
  const served = await serveCase(host, {
    'module.tsx': `import { createServerOnlyFn } from '@tanstack/react-start'
export function choose(...args: Array<string>) {
  const label = args.join('-')
  'use strict'
  return createServerOnlyFn(() => label)
}`,
  })
  expect(await inPage(served, 'return typeof module.choose')).toBe('function')
})

// A kept client-only fn nested in another, under TypeScript wrappers: the
// call's value, not a reference to the member it read (`(obj.m as any)()`
// calls with `this`, `delete (obj.m as any)` deletes the property, a direct
// `eval` sees local bindings, `typeof` of an undeclared name does not
// throw). Source: emit prototype review (Gemini 1)
test('client: a member kept through nested client-only fns is a value where it is called, deleted, evaluated or under typeof', async () => {
  const served = await serveCase(host, {
    'module.tsx': `import { createClientOnlyFn } from '@tanstack/react-start'
const obj = {
  m(this: unknown) {
    return this === obj
  },
}
export function called() {
  return createClientOnlyFn(createClientOnlyFn(obj.m as any) as any)()
}
export function deleted() {
  delete createClientOnlyFn(createClientOnlyFn(obj.m as any) as any)
  return 'm' in obj
}
export function evaluated() {
  const local = 'local'
  return createClientOnlyFn(createClientOnlyFn(eval as any) as any)(
    'typeof local',
  )
}
export function typed() {
  try {
    return typeof createClientOnlyFn(createClientOnlyFn(undeclaredName as any) as any)
  } catch (error) {
    return (error as Error).name
  }
}`,
  })
  expect(
    await inPage(
      served,
      'return [module.called(), module.deleted(), module.evaluated(), module.typed()]',
    ),
  ).toEqual([false, true, 'undefined', 'ReferenceError'])
})

// The same string statement after a removed import, with the server fn's
// RPC import the compiler writes before it: a specifier literal ends that
// glue, and it is no directive prologue (under the self-checks our test runs
// enable, `TSR_COMPILER_VERIFY=1`, the compile must not fail on it).
// Source: emit review re-check (Fable R2, Gemini 2)
test('client: a string statement after a removed import and a generated import stays an expression', async () => {
  const served = await serveCase(host, {
    'module.tsx': `import { createServerOnlyFn } from '@tanstack/react-start'
'str'
import { createServerFn } from '@tanstack/react-start'
const secret = createServerOnlyFn(() => 1)
export const sf = createServerFn().handler(async () => secret())`,
  })
  expect(await inPage(served, 'return typeof module.sf')).toBe('function')
})

// Parenthesized JSX keeps working.
test('client: keeps parenthesized JSX working', async () => {
  const served = await serveCase(host, {
    'module.tsx': `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 1)
export function Page() {
  return (<p>page</p>)
}`,
    'render.client.tsx': `import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { Page } from './module'
export function html() {
  const container = document.createElement('div')
  const root = createRoot(container)
  flushSync(() => root.render(createElement(Page)))
  const markup = container.innerHTML
  root.unmount()
  return markup
}
`,
  })
  expect(
    await inPage(served, 'return module.html()', {
      file: 'render.client.tsx',
    }),
  ).toBe('<p>page</p>')
})

// Where license comments end up is free outside the code splitter (SPEC G12,
// SPEC §6 OQ12). The `__NO_SIDE_EFFECTS__` annotations bundlers read are
// checked through a real production build
// (integration/start-build-user-code.test.ts).

// Source maps point to the user's code (SPEC R6): the map each environment
// serves with the module (Vite's composed map of every plugin's transform).
// Source: #8504 start-compiler-preserves-user-code.test.ts
// A lone CR ending a kept statement, then a removed import and its LF:
// the output's CR and LF are one line terminator, and the map counts the
// lines the output has. Source: emit prototype review (Astra 3)
test.each([
  ['a lone CR', '\r'],
  ['an LF (control)', '\n'],
])(
  'client: maps code after a removed import that followed %s to its source line',
  async (_, end) => {
    const code = `export const a = 1${end}import { createClientOnlyFn } from '@tanstack/react-start'\n\nexport const marker = createClientOnlyFn(() => 23)\n`
    const started = host
    const startCase = await started.case({ 'module.tsx': code })
    const result =
      await started.host.dev.vite.environments.client.transformRequest(
        startCase.url(),
      )
    expect(result, 'the served module').toBeTruthy()
    const [generated] = tokenOffsets(result!.code, { identifier: 'marker' })
    expect(generated, 'the declaration in the output').toBeDefined()
    const [original] = tokenOffsets(code, { identifier: 'marker' })
    expectMapsTo(result!.map as never, positionAt(result!.code, generated!), {
      file: startCase.file(),
      root: started.root,
      mapUrl: pathToFileURL(startCase.file()).href,
      ...positionAt(code, original!),
    })
  },
)

test.each(['client', 'ssr'] as const)(
  '%s: maps the string value of a JSX attribute to its own source column',
  async (environment) => {
    const code = `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 1)
export const Box = () => <div className="box" />
`
    const started = host
    const startCase = await started.case({ 'module.tsx': code })
    const result = await started.host.dev.vite.environments[
      environment
    ].transformRequest(startCase.url())
    expect(result, 'the served module').toBeTruthy()
    const [generated] = tokenOffsets(result!.code, { string: 'box' })
    expect(generated, 'the attribute value in the output').toBeDefined()
    const [original] = tokenOffsets(code, { string: 'box' })
    expectMapsTo(result!.map as never, positionAt(result!.code, generated!), {
      file: startCase.file(),
      root: started.root,
      // Vite's map names its sources relative to the served module
      mapUrl: pathToFileURL(startCase.file()).href,
      ...positionAt(code, original!),
    })
  },
)
