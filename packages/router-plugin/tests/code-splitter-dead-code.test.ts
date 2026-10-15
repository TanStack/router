import { describe, expect, it } from 'vitest'
import {
  compileRouteModules,
  declarationOf,
  evaluateModule,
  expectValidModules,
  head,
  importSources,
  importedNames,
  loadRouteModules,
  transformWithRouteHmrPlugin,
} from './regression-helpers'

const sharedModule = 'route.tsx?tsr-shared=1'

/** Whether a module declares `name` or imports it from the shared module. */
function binds(module: string, name: string) {
  return (
    declarationOf(name).test(module) ||
    importedNames(module, sharedModule).includes(name)
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
 * Renders the split component the way an app loads it: the shared module (if
 * any) and the reference module run first, then the component chunk, all
 * linked to one instance of the shared module. A top-level statement may then
 * reach the component by moving into its chunk or by staying in the
 * reference module and writing to a shared binding.
 */
async function renderSplitComponent(modules: Record<string, string>) {
  const stubs: Record<string, Record<string, unknown>> = {}
  if (modules.shared) {
    stubs[sharedModule] = await evaluateModule(modules.shared)
  }
  await evaluateModule(modules.reference!, {
    ...stubs,
    '@tanstack/react-router': {
      createFileRoute: () => (options: unknown) => ({ options }),
      lazyRouteComponent: () => () => null,
    },
  })
  const chunk = await evaluateModule(modules['virtual component']!, stubs)
  return chunk.component!()
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
      // Source: babel-dead-code-elimination dead-code-elimination.test.ts "only
      // eliminates newly unreferenced identifiers", "unexported circular references"
      // and "SCC with external caller used -> all preserved". The helper of
      // the split component moves into its chunk: `unused` stays as written,
      // with a dangling reference nothing can reach, since nothing calls it.
      name: 'unused functions, one calling a helper of the split component',
      setup: `function helper() { return 'helper' }
function unused() { return helper() }
function ping(): number { return pong() }
function pong(): number { return ping() }`,
      component: '<p>{helper()}</p>',
      declared: ['unused', 'ping', 'pong'],
      moved: ['helper'],
    },
    {
      // Regression in the Yuku migration: the only reads are an unused local
      // inside the declaration itself, and the reference module drops both
      // declarations with their register() calls.
      // Inputs adapted from @babel/plugin-proposal-decorators
      // 2023-11-misc/destructuring-transform-integration and TypeScript's
      // conformance test classes/propertyMemberDeclarations/autoAccessor10.ts.
      name: 'declarations only an unused local inside them reads',
      setup: `import { register } from './registry'
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
}`,
      declared: ['plugin', 'Widget'],
    },
    {
      // Regression in the Yuku migration, same cause: deleting the declaration
      // also deletes the ReferenceError its initializer threw when the route
      // module loaded (`later` is read before its declaration).
      name: 'a declaration only an unused local inside it reads, whose initializer reads a let before its declaration',
      setup: `const plugin = {
  id: later,
  describe() {
    const self = plugin
    return 'plugin'
  },
}
let later = 1`,
      declared: ['plugin', 'later'],
    },
    {
      // Regression in the Yuku migration, same cause: an uncalled function that
      // reads itself through an unused local is deleted, and then the
      // declaration only it read, with its register() call.
      name: 'a declaration only an uncalled function reads, the function reading itself through a local',
      setup: `import { register } from './registry'
const effect = register('effect')
function helper() {
  const self = helper
  return effect
}`,
      declared: ['effect'],
    },
  ])(
    'keeps $name that nothing used before splitting',
    async ({ setup, component = '<div />', declared, moved = [] }) => {
      const code = `${head}${setup}
export const Route = createFileRoute('/')({ component: () => ${component} })
`
      const modules = referenceModules(code)
      // The validator does not report references to undeclared names. A
      // binding the split component reads may come from the shared module.
      for (const [module, reference] of Object.entries(modules)) {
        for (const name of declared) {
          expect(binds(reference, name), `${module} binds ${name}`).toBe(true)
        }
        for (const name of moved) {
          expect(binds(reference, name), `${module} binds ${name}`).toBe(false)
        }
      }
      // Without code splitting, nothing moves.
      const unsplit = transformWithRouteHmrPlugin(code)
      for (const name of [...declared, ...moved]) {
        expect(unsplit, `the route HMR output declares ${name}`).toMatch(
          declarationOf(name),
        )
      }
      await expectValidModules({ ...modules, 'route HMR': unsplit })
    },
  )

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

  // Source: tanstack.com src/routes/index.tsx (`type PrincipleProof` next to
  // `function PrincipleProof`). TypeScript keeps types and values in separate
  // namespaces: a type the reference module keeps that names the type is not
  // a read of the value of the same name.
  it('moves a component only the split component uses into its chunk when a kept type shares its name', async () => {
    const code = `${head}import { heavy } from './heavy'
type Panel = 'a' | 'b'
export type Settings = { panel: Panel }
function Panel() {
  return <div>{heavy()}</div>
}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <Panel />,
})
`
    for (const reference of Object.values(referenceModules(code))) {
      expect(importSources(reference)).not.toContain('./heavy')
    }
    const { modules } = compileRouteModules(code)
    expect(importSources(modules['virtual component']!)).toContain('./heavy')
    await expectValidModules(modules)
  })

  // Source: Next.js ssg/getStaticProps/should-remove-re-exported-function-declarations-dependents-variables-functions-imports
  it('keeps the import specifiers nothing used before splitting', async () => {
    const { modules } =
      compileRouteModules(`${head}import { used, preUnused } from 'bar'
const b = function apples() { return used }
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{b()}</p>,
})
`)
    expect(importedNames(modules.reference!, 'bar')).toEqual(['preUnused'])
    expect(modules.reference).not.toContain('apples')
    expect(modules['virtual component']).toMatch(declarationOf('b'))
    expect(importedNames(modules['virtual component']!, 'bar')).toContain(
      'used',
    )
    await expectValidModules(modules)
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

  // Regression in the Yuku migration, found by differential fuzzing: the
  // component chunk copies a namespace that no split option reads, with its
  // body, so its initializer runs again when the chunk loads.
  it('runs the initializer of a namespace no split option reads only in the reference module', async () => {
    const { modules } =
      compileRouteModules(`${head}import { shared } from './shared'
namespace Unused { export const value = shared('side-effect-marker') }
export const Route = createFileRoute('/')({
  component: () => <div>{shared('component')}</div>,
})
`)
    expect(modules.reference).toContain('side-effect-marker')
    expect(modules['virtual component']).not.toContain('side-effect-marker')
    await expectValidModules(modules)
  })

  // TypeScript erases type positions, so a declaration whose binding only
  // appears in a type is still live code that runs when the route loads.
  it.each(
    [
      {
        name: 'the reference module',
        compile: (code: string) => compileRouteModules(code).modules.reference!,
      },
      {
        name: 'a route module compiled for HMR',
        compile: (code: string) => transformWithRouteHmrPlugin(code),
      },
    ].flatMap((target) =>
      [
        {
          types: 'a module augmentation',
          typeDeclaration: `declare module './analytics' {
  interface Registry {
    posts: typeof analytics
  }
}`,
        },
        {
          types: 'an exported type alias',
          typeDeclaration: 'export type Analytics = typeof analytics',
        },
      ].map((use) => ({ ...target, ...use })),
    ),
  )(
    'keeps a declaration only referenced from $types in $name',
    async ({ compile, typeDeclaration }) => {
      const output =
        compile(`${head}import { registerAnalytics } from './analytics'
const analytics = registerAnalytics('/posts')
${typeDeclaration}
export const Route = createFileRoute('/posts')({
  component: () => <p>posts</p>,
})
`)
      expect(output).toMatch(declarationOf('analytics'))
      expect(output).toContain('registerAnalytics(')
      await expectValidModules({ output })
    },
  )

  // Inputs adapted from babel-dead-code-elimination dead-code-elimination.test.ts
  // "object pattern" and "array pattern" > "unzips if all variables are
  // unused", which removes the whole declaration: an empty pattern declares
  // nothing, so splitting never left it unused and its initializer still runs.
  it('keeps the initializers of empty destructuring patterns', async () => {
    const { modules } =
      compileRouteModules(`${head}import { init, other } from './init'
const {} = init()
const [] = other()
const { a: {} } = init()
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>component</p>,
})
`)
    expect(modules.reference!.match(/\binit\(\)/g)).toHaveLength(2)
    expect(modules.reference).toContain('other()')
    expect(importSources(modules['virtual component']!)).not.toContain('./init')
    await expectValidModules(modules)
  })
})

describe('code a split option needs moves with it', () => {
  // Inputs adapted from babel-dead-code-elimination dead-code-elimination.test.ts
  // "function" > "declaration" and "variable" > "identifier"
  it.each([
    {
      name: 'an overloaded function',
      declarations: `function load(id: string): string
function load(id: number): string
function load(id: any) { return lib.x(id) }`,
      render: '{load(1)}',
    },
    {
      name: 'a redeclared var',
      declarations: `var load = lib.a()
var load = lib.b()`,
      render: '{load}',
    },
  ])(
    'moves $name only the split component uses, and its import, into its chunk',
    async ({ declarations, render }) => {
      const { modules } =
        compileRouteModules(`${head}import { lib } from './lib'
${declarations}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>${render}</p>,
})
`)
      expect(importSources(modules.reference!)).not.toContain('./lib')
      expect(modules.reference).not.toMatch(/\bload\b/)
      expect(importedNames(modules['virtual component']!, './lib')).toEqual([
        'lib',
      ])
      await expectValidModules(modules)
    },
  )

  // Source: Next.js ssg/getStaticProps/should-support-class-exports
  it('moves a class component and the imports of its static fields into its chunk', async () => {
    const { modules } =
      compileRouteModules(`${head}import * as React from 'react'
import { format } from './format'
class Page extends React.Component {
  static title = format('home')
  render() {
    return <div>{Page.title}</div>
  }
}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: Page,
})
`)
    expect(modules.reference).not.toMatch(declarationOf('Page'))
    expect(importSources(modules.reference!)).not.toContain('./format')
    expect(modules['virtual component']).toMatch(declarationOf('Page'))
    expect(importedNames(modules['virtual component']!, './format')).toEqual([
      'format',
    ])
    await expectValidModules(modules)
  })

  // Regression in the Yuku migration: an unused function that renders the
  // split component keeps the component and its imports in the route module,
  // which defeats the split. The unused function stays as written, with a
  // dangling reference: nothing can call it.
  // Source: corpus-diff, Jp-K/DmCompanionAi frontend_old/src/routes/_layout/chat.tsx.
  it.each([
    {
      name: 'the split component',
      setup: `function Page() {
  return <p>{heavy()}</p>
}
function Unused() {
  return <Page />
}`,
      component: 'Page',
    },
    {
      name: 'a component the split component renders',
      setup: `function Card() {
  return <p>{heavy()}</p>
}
function Page() {
  return <Card />
}
const Unused = () => <Card />`,
      component: 'Page',
    },
    {
      name: 'a component an inline split component renders',
      setup: `function Page() {
  return <p>{heavy()}</p>
}
function Unused() {
  return <Page />
}`,
      component: '() => <Page />',
    },
  ])(
    'moves the split component and its imports into its chunk when an unused function renders $name',
    async ({ setup, component }) => {
      const { modules } =
        compileRouteModules(`${head}import { heavy } from './heavy'
export const Route = createFileRoute('/')({
  component: ${component},
})
${setup}
`)
      expect(importSources(modules.reference!)).not.toContain('./heavy')
      expect(modules.reference).toMatch(declarationOf('Unused'))
      expect(importSources(modules['virtual component']!)).toContain('./heavy')
      await expectValidModules(modules)
    },
  )

  // Imports do not move: the chunk imports what it reads itself, and the
  // unused function keeps the imports it reads, as on main.
  it('keeps the imports an unused function reads in the route module', async () => {
    const { modules } =
      compileRouteModules(`${head}import { format } from './format'
function Page() {
  return <p>{format('page')}</p>
}
function Unused() {
  return <p>{format('unused')}<Page /></p>
}
export const Route = createFileRoute('/')({ component: Page })
`)
    expect(modules.reference).not.toMatch(declarationOf('Page'))
    expect(importedNames(modules.reference!, './format')).toEqual(['format'])
    expect(importedNames(modules['virtual component']!, './format')).toEqual([
      'format',
    ])
    await expectValidModules(modules)
  })

  // A function that code staying in the route module can call is no unused
  // code: the component it renders stays declared there.
  it.each([
    {
      name: 'module-level code registers',
      setup: `registry.set('preview', Preview)`,
    },
    {
      name: 'an unused subscription calls back',
      setup: `const unsubscribe = subscribe((name) => registry.set(name, Preview))`,
    },
  ])(
    'keeps the split component in the route module for a function $name',
    async ({ setup }) => {
      const { modules, options, chunks } = await loadRouteModules(
        `${head}import { subscribe } from './subscribe'
const registry = new Map()
function Page() {
  return <p>page</p>
}
function Preview() {
  return <Page />
}
${setup}
export const Route = createFileRoute('/')({
  component: Page,
  loader: () => registry.get('preview')(),
})
`,
        {
          './subscribe': { subscribe: (callback: any) => callback('preview') },
        },
      )
      expect(options.loader()).toBe('<p>page</p>')
      expect(chunks.component!.component()).toBe('<p>page</p>')
      await expectValidModules(modules)
    },
  )

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
      const { modules } = compileRouteModules(`${head}${setup}
export const Route = createFileRoute('/')({
  component: () => ${render},
})
`)
      await expectValidModules(modules)
      expect(await renderSplitComponent(modules)).toBe(rendered)
    },
  )

  // Source: React Compiler hook-ref-callback.js and
  // dont-memoize-primitive-function-call-non-escaping.js: a function shared by
  // the loader and the split component declares a local it never reads.
  it.each([
    { name: 'a call', initializer: 'track(id)' },
    { name: 'an optional call', initializer: 'track?.(id)' },
  ])(
    'keeps an unused local initialized by $name in a shared function',
    async ({ initializer }) => {
      const { modules } =
        compileRouteModules(`${head}import { track } from './track'
function useShared(id) {
  const unused = ${initializer}
  return id
}
export const Route = createFileRoute('/')({
  loader: () => useShared('loader'),
  component: () => <p>{useShared('component')}</p>,
})
`)
      const calls: Array<string> = []
      const shared = await evaluateModule(modules.shared!, {
        './track': { track: (label: string) => calls.push(label) },
      })
      expect(shared.useShared!('render')).toBe('render')
      expect(calls).toEqual(['render'])
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
  it('moves a component created by an IIFE with its dependencies and shares the helper the loader uses too', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}import { removedLib } from 'removed-lib'
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
`)
    expect(sharedBindings).toEqual(['sharedUtil'])
    expect(importSources(modules.reference!)).toEqual([
      '@tanstack/react-router',
      'kept-lib',
      'route.tsx?tsr-shared=1',
    ])
    expect(modules.reference).not.toContain('removedUtil')
    expect(importSources(modules['virtual component']!)).toEqual([
      'removed-lib',
      'route.tsx?tsr-shared=1',
    ])
    expect(modules['virtual component']).toMatch(declarationOf('Page'))
    expect(importSources(modules.shared!)).toEqual(['shared-lib'])
    await expectValidModules(modules)
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
      const { modules, sharedBindings } =
        compileRouteModules(`${head}import { chunkMessage, mainMessage } from './messages'
${declarations}
export const Route = createFileRoute('/')({
  loader: () => main,
  component: Page,
})
`)
      expect(sharedBindings).toEqual([])
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
  it('shares a declarator that a sibling declarator reads', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}import { sharedMessage } from './messages'
const Page = () => <div>{sharedMessage}</div>,
  Preview = Page
export const Route = createFileRoute('/')({
  loader: () => Preview.name,
  component: Page,
})
`)
    expect(sharedBindings).toEqual(['Page'])
    // A React component goes to the shared components module
    expect(modules['shared components']).toMatch(declarationOf('Page'))
    expect(modules.reference).toMatch(declarationOf('Preview'))
    expect(
      importedNames(modules.reference!, 'route.tsx?tsr-shared=components'),
    ).toEqual(['Page'])
    expect(modules.reference).not.toMatch(declarationOf('Page'))
    expect(modules['virtual component']).not.toMatch(declarationOf('Page'))
    await expectValidModules(modules)
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
      // Known limitation: the statement runs in both modules instead of once
      // in the shared module; only check that each module binds `value`.
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
    expect(modules.shared).toContain('.add(199)')
    await expectValidModules(modules)
  })
})
