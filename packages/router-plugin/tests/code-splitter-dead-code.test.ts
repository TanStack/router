import { describe, expect, it } from 'vitest'
import { build, routeApp } from './build-harness'
import {
  compileRouteModules,
  declaredNames,
  evaluateModule,
  expectValidModules,
  head,
  importSources,
  importedNames,
  loadRoute,
  routeSpecifier,
  transformWithRouteHmrPlugin,
} from './regression-helpers'

/**
 * The route compiled without and with React HMR: HMR rewrites the route
 * options (hoisted components, refresh anchor) before dead code is removed,
 * so the removal runs on a different program.
 */
const hmrModes = [{ hmr: false }, { hmr: true }]

/**
 * Renders the split component the way an app loads it: the route module (and
 * what it imports) runs first, then the component loads lazily, every module
 * linked to the others. A top-level statement may then reach the component
 * by moving into its chunk or by staying in the route module and writing to
 * a shared binding.
 */
async function renderSplitComponent(code: string) {
  const route = await loadRoute(code)
  return (await route.load('component'))()
}

describe('the reference module only drops code that splitting left unused', () => {
  describe.each(hmrModes)('with hmr: $hmr', ({ hmr }) => {
    it.each([
      {
        name: 'a store subscription that unsubscribes itself',
        setup: `import { store } from './store'
const unsubscribe = store.subscribe(() => {
  if (store.state.done) unsubscribe()
})`,
        calls: ['subscribe'],
      },
      {
        name: 'mutually-referencing declarations',
        setup: `import { createPersister } from './persist'
const persister = createPersister({ onRestore: () => restore() })
function restore() {
  persister.restore()
}`,
        calls: ['createPersister', 'restore'],
      },
      {
        // A reference cycle longer than two declarations: d closes it
        name: 'a reference cycle of four declarations',
        setup: `import { register } from './registry'
const a = register(() => b)
const b = register(() => c)
const c = register(() => d)
const d = register(() => a)`,
        calls: ['register', 'register', 'register', 'register'],
      },
    ])(
      'keeps $name that nothing used before splitting',
      async ({ setup, calls: expected }) => {
        // Each stub calls back what it is given, so a kept declaration that
        // lost what it reads throws.
        const calls: Array<string> = []
        const route = await loadRoute(
          `${head}${setup}
export const Route = createFileRoute('/')({ component: () => <div /> })
`,
          {
            hmr,
            stubs: {
              './store': {
                store: {
                  state: { done: true },
                  subscribe: (listener: () => void) => {
                    calls.push('subscribe')
                    queueMicrotask(listener)
                    return () => {}
                  },
                },
              },
              './persist': {
                createPersister: ({ onRestore }: { onRestore: () => void }) => {
                  calls.push('createPersister')
                  queueMicrotask(onRestore)
                  return { restore: () => calls.push('restore') }
                },
              },
              './registry': {
                register: (read: () => unknown) => {
                  calls.push('register')
                  queueMicrotask(read)
                  return read
                },
              },
            },
          },
        )
        await new Promise((resolve) => setTimeout(resolve))
        expect(calls).toEqual(expected)
        await expectValidModules(route.modules)
        expect((await route.load('component'))()).toBe('<div></div>')
      },
    )
  })

  // A declaration that only an unused local inside it, or an uncalled
  // function, reads is still live code: its initializer runs when the route
  // module loads. Source: #8504 (regressions of the Yuku migration); inputs
  // adapted from @babel/plugin-proposal-decorators
  // 2023-11-misc/destructuring-transform-integration and TypeScript's
  // conformance test classes/propertyMemberDeclarations/autoAccessor10.ts.
  describe.each(hmrModes)('with hmr: $hmr', ({ hmr }) => {
    it.each([
      {
        name: 'declarations only an unused local inside them reads',
        setup: `const plugin = {
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
}`,
        registered: ['plugin', 'widget'],
      },
      {
        name: 'a declaration only an uncalled function reads, the function reading itself through a local',
        setup: `const effect = register('effect')
function helper() {
  const self = helper
  return effect
}`,
        registered: ['effect'],
      },
    ])(
      'runs the initializers of $name when the route module loads',
      async ({ setup, registered }) => {
        const calls: Array<string> = []
        const route = await loadRoute(
          `${head}import { register } from './registry'
${setup}
export const Route = createFileRoute('/')({ component: () => <div /> })
`,
          {
            hmr,
            stubs: {
              './registry': { register: (name: string) => calls.push(name) },
            },
          },
        )
        expect(calls).toEqual(registered)
        expect((await route.load('component'))()).toBe('<div></div>')
      },
    )
  })

  // Source: babel-dead-code-elimination dead-code-elimination.test.ts "only
  // eliminates newly unreferenced identifiers", "unexported circular references"
  // and "SCC with external caller used -> all preserved". Whether unused user
  // code is kept or dropped is free, and unused code may name a binding its
  // module no longer declares (user ruling 2026-10-17, widened: the bundlers
  // delete it; the validator checks what Rolldown's tree-shaking keeps);
  // every module stays valid and the split component still reaches its
  // helper.
  const unusedFunctions = `${head}function helper() { return 'helper' }
function unused() { return 'MARK_UNUSED_END' + helper() }
function ping(): number { return pong() + 'MARK_PING_END'.length }
function pong(): number { return ping() }
export const Route = createFileRoute('/')({ component: () => <p>{helper()}</p> })
`
  it('keeps the modules of unused functions, one calling a helper of the split component, valid', async () => {
    await expectValidModules(compileRouteModules(unusedFunctions).modules)
    await expectValidModules(
      compileRouteModules(unusedFunctions, { hmr: true }).modules,
    )
    expect(await renderSplitComponent(unusedFunctions)).toBe('<p>helper</p>')
  })

  // The other half of the ruling: the unused functions (and any binding they
  // name that their module no longer declares) do not reach a production
  // client bundle.
  it.each(['vite', 'rspack', 'webpack'] as const)(
    'drops unused functions, one calling a helper of the split component, from a production client build (%s)',
    async (bundler) => {
      const app = await build({
        bundler,
        env: 'client',
        files: routeApp(unusedFunctions, { env: 'client' }),
      })
      const run = await app.run(
        `await entry.mount(entry.Route.options.component)`,
      )
      expect({
        unused: app.where('MARK_UNUSED_END'),
        ping: app.where('MARK_PING_END'),
        html: run.html,
      }).toEqual({
        unused: 'nowhere',
        ping: 'nowhere',
        html: '<div id="root"><p>helper</p></div>',
      })
    },
    60_000,
  )

  // Source: babel-dead-code-elimination dead-code-elimination.test.ts "SCC dead
  // code elimination" > "arrow functions in mutual recursion -> removed"
  it.each(hmrModes)(
    'moves mutually recursive helpers only the component uses, and their imports, out of the route module (hmr: $hmr)',
    async ({ hmr }) => {
      const route = await loadRoute(
        `${head}import { dep } from './dep'
const ping = (n: number): number => (n > 0 ? pong(n - 1) : 0)
const pong = function (n: number): number { return n > 0 ? ping(n - 1) : dep }
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{ping(3)}</p>,
})
`,
        { hmr, stubs: { './dep': { dep: 'dep' } } },
      )
      const reference = route.modules.reference!
      expect(declaredNames(reference)).not.toContain('ping')
      expect(declaredNames(reference)).not.toContain('pong')
      expect(importSources(reference)).not.toContain('./dep')
      await expectValidModules(route.modules)
      expect((await route.load('component'))()).toBe('<p>dep</p>')
    },
  )

  // Source: Next.js ssg/getStaticProps/should-remove-re-exported-function-declarations-dependents-variables-functions-imports
  it('stops importing what only the split component reads from a module with an unused specifier', async () => {
    const route = await loadRoute(
      `${head}import { used, preUnused } from 'bar'
const b = function apples() { return used }
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{b()}</p>,
})
`,
      { stubs: { bar: { used: 'used', preUnused: 'unused' } } },
    )
    // The route module no longer imports `used` (whether it keeps loading
    // `bar` is free).
    expect(importedNames(route.modules.reference!, 'bar')).not.toContain('used')
    await expectValidModules(route.modules)
    expect((await route.load('component'))()).toBe('<p>used</p>')
  })

  // That `track` runs once too is pinned in known-bugs-code-splitter.test.ts
  // ("an unreferenced top-level side effect (an unused subscription) runs
  // once"): split chunks still copy it.
  it('creates a store the split component shares once, next to a side effect nothing reads', async () => {
    let created = 0
    let tracked = 0
    const route = await loadRoute(
      `${head}import { createStore, track } from './store'
const store = createStore()
const stop = track(() => stop())
export const Route = createFileRoute('/')({
  beforeLoad: () => store.get(),
  component: () => <p>{store.get()}</p>,
})
`,
      {
        stubs: {
          './store': {
            createStore: () => {
              const id = ++created
              return { get: () => id }
            },
            track: (listener: () => void) => {
              tracked++
              return listener
            },
          },
        },
      },
    )
    await expectValidModules(route.modules)
    // The side effect runs when the route module loads.
    expect(tracked).toBe(1)
    expect([
      route.options.beforeLoad(),
      (await route.load('component'))(),
      created,
    ]).toEqual([1, '<p>1</p>', 1])
  })

  // Source: React Router route-chunks-test.ts "shared imports across chunks but
  // not main chunk with shared side effect usage"
  it('runs a top-level call once, with the route module, even when the chunks import its callee', async () => {
    const calls: Array<string> = []
    const route = await loadRoute(
      `${head}import { shared } from './shared'
shared('top-level')
export const Route = createFileRoute('/')({
  component: () => <div>{shared('component')}</div>,
  errorComponent: () => <div>{shared('error')}</div>,
})
`,
      {
        stubs: {
          './shared': {
            shared: (label: string) => {
              calls.push(label)
              return label
            },
          },
        },
      },
    )
    expect(calls).toEqual(['top-level'])
    expect([
      (await route.load('component'))(),
      (await route.load('errorComponent'))(),
    ]).toEqual(['<div>component</div>', '<div>error</div>'])
    expect(calls).toEqual(['top-level', 'component', 'error'])
    await expectValidModules(route.modules)
  })

  // Source: #8504 (differential fuzzing). Other unused declarations with
  // side effects run again in every chunk: pinned in
  // known-bugs-code-splitter.test.ts ("an unreferenced top-level side
  // effect").
  it('runs the initializer of a namespace no split option reads once, with the route module', async () => {
    const calls: Array<string> = []
    const route = await loadRoute(
      `${head}import { track } from './track'
namespace Unused { export const value = track('namespace') }
export const Route = createFileRoute('/')({
  component: () => <div>{track('component')}</div>,
})
`,
      {
        stubs: {
          './track': {
            track: (label: string) => {
              calls.push(label)
              return label
            },
          },
        },
      },
    )
    expect(calls).toEqual(['namespace'])
    expect((await route.load('component'))()).toBe('<div>component</div>')
    expect(calls).toEqual(['namespace', 'component'])
  })

  // TypeScript erases type positions, so a declaration whose binding only
  // appears in a type is still live code that runs when the route loads.
  it.each([
    {
      name: 'the reference module',
      load: async (code: string, stubs: Record<string, any>) =>
        (await loadRoute(code, { stubs })).modules.reference!,
    },
    {
      name: 'a route module compiled for HMR',
      load: async (code: string, stubs: Record<string, any>) => {
        const output = transformWithRouteHmrPlugin(code)
        await evaluateModule(output, {
          ...stubs,
          '@tanstack/react-router': {
            createFileRoute: () => (options: unknown) => ({ options }),
          },
        })
        return output
      },
    },
  ])(
    'runs a declaration only referenced from types in $name',
    async ({ load }) => {
      const registered: Array<string> = []
      const output = await load(
        `${head}import { registerAnalytics } from './analytics'
const analytics = registerAnalytics('/posts')
declare module './analytics' {
  interface Registry {
    posts: typeof analytics
  }
}
export const Route = createFileRoute('/posts')({
  component: () => <p>posts</p>,
})
`,
        {
          './analytics': {
            registerAnalytics: (path: string) => registered.push(path),
          },
        },
      )
      expect(registered).toEqual(['/posts'])
      await expectValidModules({ output })
    },
  )
})

// Type arguments name types only: TypeScript erases them, so a type, its
// parameters and the values a `typeof` there names are no reads of module
// bindings. Source: #8504 (shared-bindings helper tests; lost case L6).
it.each([
  { name: 'a function type', type: '(value: Item) => void' },
  { name: 'a constructor type', type: 'new (value: Item) => object' },
  { name: 'a method signature', type: '{ read(value: Item): void }' },
  { name: 'a generic function type', type: '<T extends Item>(value: T) => T' },
  {
    name: 'a conditional type with infer',
    type: 'Item extends Array<infer U> ? U : typeof item',
  },
])(
  'keeps a context created with $name as type argument working in the split component',
  async ({ type }) => {
    let created = 0
    const route = await loadRoute(
      `${head}import { createContext } from 'react'
type Item = { id: string }
const item: Item = { id: 'item' }
const Context = createContext<${type}>(null!)
export const Route = createFileRoute('/')({
  loader: () => item.id,
  component: () => <p>{String(Context.value)}</p>,
})
`,
      {
        stubs: {
          react: {
            createContext: (value: unknown) => {
              created++
              return { value }
            },
          },
        },
      },
    )
    await expectValidModules(route.modules)
    expect([
      route.options.loader(),
      (await route.load('component'))(),
      created,
    ]).toEqual(['item', '<p>null</p>', 1])
  },
)

describe('code a split option needs moves with it', () => {
  // Source: Qwik optimizer test.rs should_not_move_over_side_effects,
  // example_drop_side_effects; Turbopack tree-shaker analyzer/route-kind
  it.each([
    {
      name: 'a compound component member assignment',
      setup: `function Card({ children }) { return <div>{children}</div> }
Card.Title = function Title() { return <h1>t</h1> }`,
      render: '<Card><Card.Title /></Card>',
      rendered: '<div><h1>t</h1></div>',
    },
    {
      name: 'a registry filled by a top-level call',
      setup: `const registry = new Map()
registry.set('a', 'A')`,
      render: `<p>{registry.get('a')}</p>`,
      rendered: '<p>A</p>',
    },
    {
      name: 'a compiled enum initializing a var',
      setup: `var Kind: any
;(function (Kind: any) {
  Kind['A'] = 'a'
})(Kind || (Kind = {}))`,
      render: '<p>{Kind.A}</p>',
      rendered: '<p>a</p>',
    },
  ])(
    'renders a split component that relies on $name',
    async ({ setup, render, rendered }) => {
      const code = `${head}${setup}
export const Route = createFileRoute('/')({
  component: () => ${render},
})
`
      const route = await loadRoute(code)
      await expectValidModules(route.modules)
      expect((await route.load('component'))()).toBe(rendered)
    },
  )

  // An unused function that renders the split component stays as written, or
  // goes, without keeping the component's imports in the route module.
  // Other shapes are pinned in known-bugs-code-splitter.test.ts ("page code
  // left in the route module"). Source: #8504 (corpus-diff, Jp-K/DmCompanionAi
  // frontend_old/src/routes/_layout/chat.tsx).
  it('moves the split component and its imports into its chunk when an unused function renders it', async () => {
    const route = await loadRoute(
      `${head}import { heavy } from './heavy'
export const Route = createFileRoute('/')({
  component: Page,
})
function Page() {
  return <p>{heavy()}</p>
}
function Unused() {
  return <Page />
}
`,
      { stubs: { './heavy': { heavy: () => 'heavy' } } },
    )
    expect(importSources(route.modules.reference!)).not.toContain('./heavy')
    expect((await route.load('component'))()).toBe('<p>heavy</p>')
  })

  // Bundlers drop unused calls of a function annotated #__NO_SIDE_EFFECTS__,
  // so the annotation must move with the function, also when every output
  // module repeats a file-level pragma comment.
  it('keeps the #__NO_SIDE_EFFECTS__ annotation of a function in every module that declares it, in a file with a pragma', () => {
    const { modules } =
      compileRouteModules(`/** @jsxImportSource @emotion/react */
${head}/* #__NO_SIDE_EFFECTS__ */ function makeLabel() { return 'label' }
export const Route = createFileRoute('/')({
  component: () => <p>{makeLabel()}</p>,
})
`)
    const declaring = Object.entries(modules).filter(([, code]) =>
      declaredNames(code).has('makeLabel'),
    )
    expect(declaring.length).toBeGreaterThan(0)
    for (const [name, code] of declaring) {
      expect(code, name).toMatch(
        /\/\*\s*[#@]__NO_SIDE_EFFECTS__\s*\*\/\s*function makeLabel\(/,
      )
    }
  })

  // Source: React Compiler hook-ref-callback.js and
  // dont-memoize-primitive-function-call-non-escaping.js: a function shared by
  // the loader and the split component declares a local it never reads.
  it.each([
    { name: 'a call', initializer: 'track(id)' },
    { name: 'an optional call', initializer: 'track?.(id)' },
  ])(
    'keeps an unused local initialized by $name in a shared function',
    async ({ initializer }) => {
      const calls: Array<string> = []
      const route = await loadRoute(
        `${head}import { track } from './track'
function useShared(id) {
  const unused = ${initializer}
  return id
}
export const Route = createFileRoute('/')({
  loader: () => useShared('loader'),
  component: () => <p>{useShared('component')}</p>,
})
`,
        {
          stubs: {
            './track': { track: (label: string) => calls.push(label) },
          },
        },
      )
      expect([
        route.options.loader(),
        (await route.load('component'))(),
        calls,
      ]).toEqual(['loader', '<p>component</p>', ['loader', 'component']])
    },
  )

  // Source: babel-dead-code-elimination dead-code-elimination.test.ts "object
  // pattern" > "within function param"
  it('keeps empty destructuring parameters of helpers moved into the chunk', async () => {
    const route =
      await loadRoute(`${head}function f(a: any, {}: any) { return a }
const g = (a: any, []: any) => a
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{f.length}{g.length}</p>,
})
`)
    expect((await route.load('component'))()).toBe('<p>22</p>')
  })

  // Source: React Router remove-exports-test.ts "iife with dependencies"
  it('moves a component created by an IIFE with its dependencies, next to a helper the loader uses too', async () => {
    const route = await loadRoute(
      `${head}import { removedLib } from 'removed-lib'
import { keptLib } from 'kept-lib'
import { sharedLib } from 'shared-lib'
const sharedUtil = (value?: unknown) => sharedLib(value)
const removedUtil = () => sharedUtil(removedLib())
const keptUtil = () => sharedUtil(keptLib())
const Page = (() => {
  const message = removedUtil()
  return () => <div>{String(message)}</div>
})()
export const Route = createFileRoute('/')({
  loader: () => keptUtil(),
  component: Page,
})
`,
      {
        stubs: {
          'removed-lib': { removedLib: () => 'removed' },
          'kept-lib': { keptLib: () => 'kept' },
          'shared-lib': { sharedLib: (value: unknown) => `shared:${value}` },
        },
      },
    )
    const { modules } = route
    expect(importSources(modules.reference!)).not.toContain('removed-lib')
    for (const name of Object.keys(modules)) {
      if (name.startsWith('lazy ')) {
        expect(importSources(modules[name]!), name).not.toContain('kept-lib')
      }
    }
    await expectValidModules(modules)
    expect([route.options.loader(), (await route.load('component'))()]).toEqual(
      ['shared:kept', '<div>shared:removed</div>'],
    )
  })

  // Source: React Router route-chunks-test.ts "isolated exported variable
  // declarations sharing an export statement"; Next.js
  // ssg/getStaticProps/should-remove-re-exported-variable-declarations-safe
  it.each([
    {
      name: 'plain declarators',
      declarations: `const Page = () => <div>{chunkMessage}</div>,
  main = mainMessage`,
    },
    {
      name: 'destructured declarators',
      declarations: `const { Page } = { Page: () => <div>{chunkMessage}</div> },
  { main } = { main: mainMessage }`,
    },
  ])(
    'gives each of the $name of one statement to the module that reads it',
    async ({ declarations }) => {
      const route = await loadRoute(
        `${head}import { chunkMessage, mainMessage } from './messages'
${declarations}
export const Route = createFileRoute('/')({
  loader: () => main,
  component: Page,
})
`,
        {
          stubs: {
            './messages': { chunkMessage: 'chunk', mainMessage: 'main' },
          },
        },
      )
      // The route module holds nothing of the component, the chunk nothing
      // of the loader.
      expect(
        importedNames(route.modules.reference!, './messages'),
      ).not.toContain('chunkMessage')
      expect(declaredNames(route.modules.reference!)).not.toContain('Page')
      const chunk = route.chunkOf('component')
      expect(importedNames(chunk, './messages')).not.toContain('mainMessage')
      expect(declaredNames(chunk)).not.toContain('main')
      await expectValidModules(route.modules)
      expect([
        route.options.loader(),
        (await route.load('component'))(),
      ]).toEqual(['main', '<div>chunk</div>'])
    },
  )

  // Source: React Router route-chunks-test.ts "exported variable declarations
  // sharing an export statement"
  it('keeps one component that a sibling declarator reads', async () => {
    const route = await loadRoute(
      `${head}import { sharedMessage } from './messages'
const Page = () => <div>{sharedMessage}</div>,
  Preview = Page
export const Route = createFileRoute('/')({
  loader: () => Preview,
  component: Page,
})
`,
      { stubs: { './messages': { sharedMessage: 'shared' } } },
    )
    await expectValidModules(route.modules)
    const Component = await route.load('component')
    expect(route.options.loader()).toBe(Component)
    expect(Component()).toBe('<div>shared</div>')
  })
})

describe('var declarations nested in top-level statements', () => {
  it.each([
    {
      name: 'a for loop head',
      setup: 'for (var value = 0; value < 3; value++) {}',
      value: 3,
    },
    { name: 'a for-of head', setup: "for (var value of ['a']) {}", value: 'a' },
    {
      name: 'an if block',
      setup: "if (typeof window === 'undefined') { var value = 'server' }",
      value: 'server',
    },
  ])(
    'give the loader and the component the value of a binding $name declares',
    async ({ setup, value }) => {
      const route = await loadRoute(`${head}${setup}
export const Route = createFileRoute('/')({
  loader: () => value,
  component: () => <div>{value}</div>,
})
`)
      // That the statement runs once is pinned in
      // known-bugs-code-splitter.test.ts ("a binding declared by a var in …").
      await expectValidModules(route.modules)
      expect([
        route.options.loader(),
        (await route.load('component'))(),
      ]).toEqual([value, `<div>${value}</div>`])
    },
  )

  it('stay exported when exported and read by the component', async () => {
    const route =
      await loadRoute(`${head}if (typeof window === 'undefined') { var flag = 'server' }
export { flag }
export const Route = createFileRoute('/')({
  component: () => <div>{flag}</div>,
})
`)
    await expectValidModules(route.modules)
    const { flag } = await route.importFromRoute(
      `export { flag } from '${routeSpecifier}'`,
    )
    expect([flag, (await route.load('component'))()]).toEqual([
      'server',
      '<div>server</div>',
    ])
  })

  // Source: babel-dead-code-elimination dead-code-elimination.test.ts "variable"
  // (var bindings declared inside nested statements)
  it('run once and give each option its value', async () => {
    const calls = { compute: 0, connect: 0 }
    const route = await loadRoute(
      `${head}import { compute, connect } from './lib'
if (typeof globalThis !== 'undefined') {
  var flag = compute()
}
for (var index = 0; index < 3; index++) {}
{
  var block = connect()
}
export const Route = createFileRoute('/')({
  loader: () => block,
  component: () => <p>{String(flag)}{index}</p>,
})
`,
      {
        stubs: {
          './lib': {
            compute: () => {
              calls.compute++
              return 'flag'
            },
            connect: () => {
              calls.connect++
              return 'block'
            },
          },
        },
      },
    )
    await expectValidModules(route.modules)
    expect([
      route.options.loader(),
      (await route.load('component'))(),
      calls,
    ]).toEqual(['block', '<p>flag3</p>', { compute: 1, connect: 1 }])
  })
})

describe('robustness', () => {
  it('compiles a route with a long method chain', async () => {
    // Builder APIs (schemas, query builders) produce deep left-nested calls
    const chain = Array.from({ length: 200 }, (_, i) => `.add(${i})`).join('')
    const calls = { builder: 0, add: 0 }
    const schema = {
      add: () => {
        calls.add++
        return schema
      },
      toString: () => 'schema',
    }
    const route = await loadRoute(
      `${head}import { builder } from './builder'
const schema = builder()${chain}
export const Route = createFileRoute('/')({
  loader: () => schema,
  component: () => <div>{String(schema)}</div>,
})
`,
      {
        stubs: {
          './builder': {
            builder: () => {
              calls.builder++
              return schema
            },
          },
        },
      },
    )
    await expectValidModules(route.modules)
    // The chain runs once, whichever module holds it.
    expect([
      route.options.loader(),
      (await route.load('component'))(),
      calls,
    ]).toEqual([schema, '<div>schema</div>', { builder: 1, add: 200 }])
  })
})
