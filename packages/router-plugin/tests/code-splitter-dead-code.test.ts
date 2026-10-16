import { describe, expect, it } from 'vitest'
import {
  compileRouteModules,
  countAcrossModules,
  declarationOf,
  evaluateModule,
  expectValidModules,
  head,
  importSources,
  importedNames,
  loadRoute,
  routeModuleSources,
  transformWithRouteHmrPlugin,
} from './regression-helpers'

/**
 * Whether a module declares `name` or imports it from another module the
 * code splitter emits for the route.
 */
function binds(module: string, name: string) {
  return (
    declarationOf(name).test(module) ||
    routeModuleSources(module).some((source) =>
      importedNames(module, source).includes(name),
    )
  )
}

/**
 * The reference module, compiled without and with React HMR: HMR rewrites the
 * route options (hoisted components, refresh anchor) before dead code is
 * removed, so the removal runs on a different program.
 */
function referenceModules(code: string) {
  return {
    reference: compileRouteModules(code).modules.reference!,
    'reference with HMR': compileRouteModules(code, { hmr: true }).modules
      .reference!,
  }
}

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
  it.each([
    {
      name: 'a store subscription that unsubscribes itself',
      setup: `import { store } from './store'
const unsubscribe = store.subscribe(() => {
  if (store.state.done) unsubscribe()
})`,
      declared: ['unsubscribe'],
    },
    {
      name: 'mutually-referencing declarations',
      setup: `import { createPersister } from './persist'
const persister = createPersister({ onRestore: () => restore() })
function restore() {
  persister.restore()
}`,
      declared: ['persister', 'restore'],
    },
    {
      // A reference cycle longer than two declarations: d closes it
      name: 'a reference cycle of four declarations',
      setup: `import { register } from './registry'
const a = register(() => b)
const b = register(() => c)
const c = register(() => d)
const d = register(() => a)`,
      declared: ['a', 'b', 'c', 'd'],
    },
  ])(
    'keeps $name that nothing used before splitting',
    async ({ setup, declared }) => {
      const code = `${head}${setup}
export const Route = createFileRoute('/')({ component: () => <div /> })
`
      const modules = referenceModules(code)
      // The validator does not report references to undeclared names. A
      // binding the split component reads may come from the shared module.
      for (const [module, reference] of Object.entries(modules)) {
        for (const name of declared) {
          expect(binds(reference, name), `${module} binds ${name}`).toBe(true)
        }
      }
      await expectValidModules(modules)
    },
  )

  // Source: babel-dead-code-elimination dead-code-elimination.test.ts "only
  // eliminates newly unreferenced identifiers", "unexported circular references"
  // and "SCC with external caller used -> all preserved". Whether unused user
  // code is kept or dropped is free; every module stays valid and the split
  // component still reaches its helper.
  it('keeps the modules of unused functions, one calling a helper of the split component, valid', async () => {
    const code = `${head}function helper() { return 'helper' }
function unused() { return helper() }
function ping(): number { return pong() }
function pong(): number { return ping() }
export const Route = createFileRoute('/')({ component: () => <p>{helper()}</p> })
`
    await expectValidModules(compileRouteModules(code).modules)
    await expectValidModules(compileRouteModules(code, { hmr: true }).modules)
    expect(await renderSplitComponent(code)).toBe('<p>helper</p>')
  })

  // Source: babel-dead-code-elimination dead-code-elimination.test.ts "SCC dead
  // code elimination" > "arrow functions in mutual recursion -> removed"
  it('moves mutually recursive helpers only the component uses, and their imports, into its chunk', async () => {
    const code = `${head}import { dep } from './dep'
const ping = (n: number): number => (n > 0 ? pong(n - 1) : 0)
const pong = function (n: number): number { return n > 0 ? ping(n - 1) : dep }
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{ping(3)}</p>,
})
`
    for (const reference of Object.values(referenceModules(code))) {
      expect(reference).not.toMatch(declarationOf('ping'))
      expect(reference).not.toMatch(declarationOf('pong'))
      expect(importSources(reference)).not.toContain('./dep')
    }
    const { modules } = compileRouteModules(code)
    expect(modules['virtual component']).toMatch(declarationOf('ping'))
    expect(modules['virtual component']).toMatch(declarationOf('pong'))
    await expectValidModules(modules)
  })

  // Source: Next.js ssg/getStaticProps/should-remove-re-exported-function-declarations-dependents-variables-functions-imports
  it('keeps requesting a module whose specifiers nothing used before splitting', async () => {
    const { modules } =
      compileRouteModules(`${head}import { used, preUnused } from 'bar'
const b = function apples() { return used }
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{b()}</p>,
})
`)
    // The route module still loads `bar` (as a bare import or with the
    // unused specifier), but no longer for `used`.
    expect(importSources(modules.reference!)).toContain('bar')
    expect(importedNames(modules.reference!, 'bar')).not.toContain('used')
    expect(importedNames(modules['virtual component']!, 'bar')).toContain(
      'used',
    )
    await expectValidModules(modules)
  })

  // That `track` runs once too is pinned in known-bugs-code-splitter.test.ts
  // ("an unreferenced top-level side effect (an unused subscription) runs
  // once"): split chunks still copy it.
  it('creates a store the split component shares once, next to a side effect nothing reads', async () => {
    let created = 0
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
            track: (listener: () => void) => listener,
          },
        },
      },
    )
    await expectValidModules(route.modules)
    expect([
      route.options.beforeLoad(),
      (await route.load('component'))(),
      created,
    ]).toEqual([1, '<p>1</p>', 1])
  })

  // Source: React Router route-chunks-test.ts "shared imports across chunks but
  // not main chunk with shared side effect usage"
  it('runs a top-level call only in the reference module, even when the chunks import its callee', async () => {
    const { modules } =
      compileRouteModules(`${head}import { shared } from './shared'
shared('side-effect-marker')
export const Route = createFileRoute('/')({
  component: () => <div>{shared('component')}</div>,
  errorComponent: () => <div>{shared('error')}</div>,
})
`)
    expect(modules.reference).toContain('side-effect-marker')
    expect(modules['virtual component']).not.toContain('side-effect-marker')
    expect(modules['virtual errorComponent']).not.toContain(
      'side-effect-marker',
    )
    await expectValidModules(modules)
  })

  // TypeScript erases type positions, so a declaration whose binding only
  // appears in a type is still live code that runs when the route loads.
  it.each([
    {
      name: 'the reference module',
      compile: (code: string) => compileRouteModules(code).modules.reference!,
    },
    {
      name: 'a route module compiled for HMR',
      compile: (code: string) => transformWithRouteHmrPlugin(code),
    },
  ])(
    'keeps a declaration only referenced from types in $name',
    async ({ compile }) => {
      const output =
        compile(`${head}import { registerAnalytics } from './analytics'
const analytics = registerAnalytics('/posts')
declare module './analytics' {
  interface Registry {
    posts: typeof analytics
  }
}
export const Route = createFileRoute('/posts')({
  component: () => <p>posts</p>,
})
`)
      expect(output).toMatch(declarationOf('analytics'))
      expect(output).toContain('registerAnalytics(')
      await expectValidModules({ output })
    },
  )
})

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
      const { modules } = compileRouteModules(code)
      await expectValidModules(modules)
      expect(await renderSplitComponent(code)).toBe(rendered)
    },
  )

  // Bundlers drop unused calls of a function annotated #__NO_SIDE_EFFECTS__,
  // so the annotation must move with the function, also when every output
  // module repeats a file-level pragma comment.
  it('keeps the #__NO_SIDE_EFFECTS__ annotation of a function moved into the chunk in a file with a pragma', () => {
    const { modules } =
      compileRouteModules(`/** @jsxImportSource @emotion/react */
${head}/* #__NO_SIDE_EFFECTS__ */ function makeLabel() { return 'label' }
export const Route = createFileRoute('/')({
  component: () => <p>{makeLabel()}</p>,
})
`)
    expect(modules['virtual component']).toMatch(
      /\/\*\s*[#@]__NO_SIDE_EFFECTS__\s*\*\/\s*function makeLabel\(/,
    )
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
    const { modules } =
      compileRouteModules(`${head}function f(a: any, {}: any) { return a }
const g = (a: any, []: any) => a
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{f.length}{g.length}</p>,
})
`)
    const chunk = await evaluateModule(modules['virtual component']!)
    expect(chunk.component!()).toBe('<p>22</p>')
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
      if (name.startsWith('virtual ')) {
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
      const { modules } =
        compileRouteModules(`${head}import { chunkMessage, mainMessage } from './messages'
${declarations}
export const Route = createFileRoute('/')({
  loader: () => main,
  component: Page,
})
`)
      expect(importedNames(modules.reference!, './messages')).toEqual([
        'mainMessage',
      ])
      expect(modules.reference).not.toMatch(/\bPage\b/)
      expect(
        importedNames(modules['virtual component']!, './messages'),
      ).toEqual(['chunkMessage'])
      expect(modules['virtual component']).not.toMatch(/\bmain\b/)
      await expectValidModules(modules)
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
    expect(countAcrossModules(route.modules, declarationOf('Page'))).toBe(1)
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
    },
    { name: 'a for-of head', setup: "for (var value of ['a']) {}" },
    {
      name: 'an if block',
      setup: "if (typeof window === 'undefined') { var value = 'server' }",
    },
  ])(
    'stay bound in every module when $name declares a binding the loader and the component read',
    async ({ setup }) => {
      const { modules } = compileRouteModules(`${head}${setup}
export const Route = createFileRoute('/')({
  loader: () => value,
  component: () => <div>{value}</div>,
})
`)
      // Known limitation on main: the statement runs in both modules instead
      // of once in the shared module; only check that each module binds `value`.
      // Pinned in known-bugs-code-splitter.test.ts ("a binding declared by a var in …").
      for (const name of ['reference', 'virtual component']) {
        expect(binds(modules[name]!, 'value'), `${name} binds value`).toBe(true)
      }
      await expectValidModules(modules)
    },
  )

  it('stay bound in the reference module when exported and read by the component', async () => {
    const { modules } =
      compileRouteModules(`${head}if (typeof window === 'undefined') { var flag = 'server' }
export { flag }
export const Route = createFileRoute('/')({
  component: () => <div>{flag}</div>,
})
`)
    expect(binds(modules.reference!, 'flag')).toBe(true)
    await expectValidModules(modules)
  })

  // Source: babel-dead-code-elimination dead-code-elimination.test.ts "variable"
  // (var bindings declared inside nested statements)
  it('follow the only option that reads them', async () => {
    const { modules } =
      compileRouteModules(`${head}import { compute, connect } from './lib'
if (typeof window !== 'undefined') {
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
`)
    expect(modules.reference).not.toContain('compute()')
    expect(modules.reference).toMatch(declarationOf('block'))
    const chunk = modules['virtual component']!
    expect(chunk).toMatch(declarationOf('flag'))
    expect(chunk).toMatch(declarationOf('index'))
    expect(chunk).not.toContain('connect()')
    await expectValidModules(modules)
  })
})

describe('robustness', () => {
  it('compiles a route with a long method chain', async () => {
    // Builder APIs (schemas, query builders) produce deep left-nested calls
    const chain = Array.from({ length: 200 }, (_, i) => `.add(${i})`).join('')
    const { modules } =
      compileRouteModules(`${head}import { builder } from './builder'
const schema = builder()${chain}
export const Route = createFileRoute('/')({
  loader: () => schema,
  component: () => <div>{String(schema)}</div>,
})
`)
    // The chain is evaluated once, whichever module holds it.
    expect(countAcrossModules(modules, /\.add\(199\)/)).toBe(1)
    await expectValidModules(modules)
  })
})
