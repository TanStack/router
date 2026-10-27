import { pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, test } from 'vitest'
import {
  expectMapsTo,
  positionAt,
  tokenOffsets,
} from '@tanstack/compiler-test-utils/source-maps'
import {
  callFromClient,
  callServerFnThroughCallers,
  inPage,
  serveCase,
  useStartHost,
} from './regression-helpers'
import type { StartCase, StartHost } from './regression-helpers'

/**
 * The host defaults these tests use: no import
 * protection (its dev mock would hide a leaked server import from the
 * client's loads) and an app tsconfig with `verbatimModuleSyntax` (without
 * it, Vite's TypeScript transform drops unreferenced imports after the
 * compiler and hides leaks).
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
const hostDefaults = {
  start: { importProtection: { enabled: false } },
  files: { 'tsconfig.json': JSON.stringify(hostTsconfig) },
}

// The compiler removes code that only served a transformed call. Everything
// else is user code that must survive, even when nothing seems to read it.
// Observed through the public Start host (`./start-host`): the client in a
// real page, the server in the SSR environment and in real requests.

const host = useStartHost({
  start: hostDefaults.start,
  // Decorated classes are written for TypeScript's `experimentalDecorators`
  files: {
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        ...hostTsconfig.compilerOptions,
        experimentalDecorators: true,
      },
    }),
  },
})
beforeAll(async () => {
  await (await host()).page()
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
  const startCase = await effectCase(await host(), code)
  // The client serves a module that imports and runs
  await startCase.served()
  expect(await recordClientSideEffects(startCase, run)).toEqual(calls)
})

// Effectful declarations only a server fn's handler reads: the server
// evaluates them once, in source order, wherever the handler lives there;
// the client, where the handler is erased, runs none of them.
test('effectful declarations only a handler reads run once on the server, in source order', async () => {
  const startCase = await effectCase(
    await host(),
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
// the server runs every one once, in source order; the client, which keeps
// the augmented object, too.
test('effectful declarations and augmentations a handler reads keep their order on the server', async () => {
  const startCase = await effectCase(
    await host(),
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
    expect(global[effectsKey]).toEqual(calls)
  } finally {
    delete global[effectsKey]
  }
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
      const startCase = await effectCase(await host(), code)
      expect(await recordClientSideEffects(startCase)).toEqual([call])
    },
  )

  // Handling a server fn call runs the module's initializer, once: what the
  // server records while it handles a client's call (the module is first
  // evaluated by that request).
  test(`server: ${typeQuery.name}`, async () => {
    const startCase = await effectCase(await host(), typeQuery.code)
    const global = globalThis as Record<string, unknown>
    global[effectsKey] = []
    try {
      expect(await callFromClient(startCase, 'module.getPosts')).toEqual([])
      expect(global[effectsKey]).toEqual([typeQuery.call])
    } finally {
      delete global[effectsKey]
    }
  })
})

test('accepts type-only namespace imports and exports, and a type and a value exported under the same name', async () => {
  const served = await serveCase(await host(), {
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

// With the classic runtime the bundler compiles JSX to React.createElement
// after this compiler ran, so an import the source only reads in types is
// still needed by the JSX (SPEC J4.17, G12). Checked by rendering the
// module of an app whose React plugin uses the classic runtime
// (`react({ jsxRuntime: 'classic' })`), with the real React.
describe('keeps working with the classic JSX runtime downstream', () => {
  const classic = useStartHost({
    ...hostDefaults,
    react: { jsxRuntime: 'classic' },
  })

  test('the client and the server render it', async () => {
    const served = await serveCase(await classic(), {
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
  const served = await serveCase(await host(), {
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
  const served = await serveCase(await host(), {
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
  const served = await serveCase(await host(), {
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

// Bug: the client output prints an asserted update operand without its
// parentheses (`count as number++`).
// Impact: the module fails to parse, so the build fails.
// Source: typescript-eslint type-assertion/increment/as-increment.js,
// type-assertion/increment/non-null-increment.js, type-assertion/satisfies.js;
// #8504 start-compiler-preserves-user-code.test.ts (red on main)
test('keeps the parentheses of asserted update operands', async () => {
  const served = await serveCase(await host(), {
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

// Bug: the client output prints a type assertion that is the test of a
// conditional whose branch starts with a unary minus without its parentheses
// (`a as any ? -x : y`), which does not parse (`any ? -x` reads as the start
// of a conditional type). The root cause is upstream: @babel/generator 7.29.8
// drops the parentheses (parse+generate of `f = ((a) as any) ? -x : y` gives
// `f = a as any ? -x : y;`; no workaround here; router-utils/src/ast.ts:72
// `generateFromAst` prints with it). The code splitter has the same bug (pin
// in router-plugin/tests/known-bugs-code-splitter.test.ts).
// Impact: the module fails to parse, so the build fails.
// Source: fuzzing.
test('keeps the parentheses of an asserted conditional test', async () => {
  const served = await serveCase(await host(), {
    'module.tsx': `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 1)
export function pick(flag: unknown, x: number, y: number) {
  return ((flag) as any) ? -x : y
}`,
  })
  expect(await inPage(served, 'return module.pick(true, 1, 2)')).toBe(-1)
})

// Parenthesized JSX keeps working.
test('client: keeps parenthesized JSX working', async () => {
  const served = await serveCase(await host(), {
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
test.each(['client', 'ssr'] as const)(
  '%s: maps the string value of a JSX attribute to its own source column',
  async (environment) => {
    const code = `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 1)
export const Box = () => <div className="box" />
`
    const started = await host()
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
