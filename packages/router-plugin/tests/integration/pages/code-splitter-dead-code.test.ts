/**
 * Dead code around split route options: what the route module keeps, what
 * moves into a chunk, and that every surviving effect runs once (SPEC
 * J2.5, J2.12, G1, G3). Each route runs in a real browser page served by a
 * real Vite dev server with the public router plugin (`route-app.ts`); the
 * route's other modules are files of the app, which record what runs. D5
 * absence checks read the modules the page loads: a user marker (a decoded
 * string of the user's code) or an import of a binding (type-only imports
 * left out), never declared names or printed text.
 */
import { parseSync } from 'vite'
import { describe, expect, it } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import {
  expectValidModules,
  head,
  holdsMarker,
  loadRoute,
} from '../../route-app'
import type { RouteAppOptions } from '../../route-app'

/**
 * The route compiled without and with React HMR: HMR rewrites the route
 * options (hoisted components, refresh anchor) before dead code is removed,
 * so the removal runs on a different program.
 */
const hmrModes = [{ hmr: false }, { hmr: true }]

/**
 * Value bindings a served module imports from a module whose request
 * matches `source` (type-only specifiers left out): an independent parse of
 * the module as the page receives it, for D5 checks that a binding only a
 * split option reads is no longer imported by what loads with the route.
 */
function importedNamesFrom(code: string, source: RegExp) {
  return parseSync('module.js', code, {
    sourceType: 'module',
  })
    .module.staticImports.filter((statement) =>
      source.test(statement.moduleRequest.value),
    )
    .flatMap((statement) =>
      statement.entries
        .filter((entry) => !entry.isType)
        .map((entry) =>
          entry.importName.kind === 'Default'
            ? 'default'
            : entry.importName.kind === 'NamespaceObject'
              ? '*'
              : entry.importName.name!,
        ),
    )
}

/** A package of the app (`node_modules/<name>`), ES module `source`. */
function appPackage(name: string, source: string) {
  return {
    [`node_modules/${name}/package.json`]: JSON.stringify({
      name,
      type: 'module',
      exports: './index.js',
    }),
    [`node_modules/${name}/index.js`]: source,
  }
}

/** A module recording what runs, in `calls` (read it with `app('calls.ts')`). */
const callsModule = { 'calls.ts': 'export const calls: Array<string> = []\n' }

/**
 * Renders the split component the way an app loads it: the route module (and
 * what it imports) runs first, then the component loads lazily, every module
 * linked to the others. A top-level statement may then reach the component
 * by moving into its chunk or by staying in the route module and writing to
 * a shared binding.
 */
async function renderSplitComponent(
  code: string,
  options: RouteAppOptions = {},
) {
  return (await loadRoute(code, options)).run<string>(
    `return render('component')`,
  )
}

describe('the reference module only drops code that splitting left unused', () => {
  // Each stub calls back what it is given, so a kept declaration that lost
  // what it reads throws (an uncaught error of the page).
  const callbackStubs = {
    ...callsModule,
    'store.ts': `import { calls } from './calls'
export const store = {
  state: { done: true },
  subscribe: (listener: () => void) => {
    calls.push('subscribe')
    queueMicrotask(listener)
    return () => {}
  },
}
`,
    'persist.ts': `import { calls } from './calls'
export const createPersister = ({ onRestore }: { onRestore: () => void }) => {
  calls.push('createPersister')
  queueMicrotask(onRestore)
  return { restore: () => calls.push('restore') }
}
`,
    'registry.ts': `import { calls } from './calls'
export const register = (read: () => unknown) => {
  calls.push('register')
  queueMicrotask(read)
  return read
}
`,
  }

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
        const route = await loadRoute(
          `${head}${setup}
export const Route = createFileRoute('/')({ component: () => <div /> })
`,
          { hmr, files: callbackStubs },
        )
        const run =
          await route.runPage(`await new Promise((resolve) => setTimeout(resolve))
return { calls: [...(await app('calls.ts')).calls], html: await render('component') }`)
        expect(run.result).toEqual({ calls: expected, html: '<div></div>' })
        expect(run.errors).toEqual([])
        await expectValidModules(route)
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
        const route = await loadRoute(
          `${head}import { register } from './register'
${setup}
export const Route = createFileRoute('/')({ component: () => <div /> })
`,
          {
            hmr,
            files: {
              ...callsModule,
              'register.ts': `import { calls } from './calls'
export const register = (name: string) => calls.push(name)
`,
            },
          },
        )
        expect(
          await route.run(`const loaded = [...(await app('calls.ts')).calls]
return [loaded, await render('component')]`),
        ).toEqual([registered, '<div></div>'])
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
    await expectValidModules(await loadRoute(unusedFunctions))
    await expectValidModules(await loadRoute(unusedFunctions, { hmr: true }))
    expect(await renderSplitComponent(unusedFunctions)).toBe('<p>helper</p>')
  })

  // Source: babel-dead-code-elimination dead-code-elimination.test.ts "SCC dead
  // code elimination" > "arrow functions in mutual recursion -> removed"
  it.each(hmrModes)(
    'moves mutually recursive helpers only the component uses, and their imports, out of the route module (hmr: $hmr)',
    async ({ hmr }) => {
      // The helpers carry user markers (their results are unchanged), so
      // that their code is recognised wherever it goes (D5, N10). The
      // markers join values of another module, so no compiler can fold
      // them away.
      const route = await loadRoute(
        `${head}import { dep } from './dep'
const ping = (n: number): number => (n > 0 ? pong(n - 1) : ('MARK_PING' + dep).length)
const pong = function (n: number): number { return n > 0 ? ping(n - 1) : dep ?? 'MARK_PONG' }
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{ping(3)}</p>,
})
`,
        { hmr, files: { 'dep.ts': `export const dep = 'dep'\n` } },
      )
      // Nothing that loads with the route holds the helpers, or requests
      // what only they read; what the component loads holds them.
      const eager = await route.eagerModules()
      expect(
        eager.filter((code) => holdsMarker(code, 'MARK_PING')),
      ).toHaveLength(0)
      expect(
        eager.filter((code) => holdsMarker(code, 'MARK_PONG')),
      ).toHaveLength(0)
      expect(await route.requested()).not.toContain('/dep.ts')
      const component = await route.loadedBy('component')
      expect(
        ['MARK_PING', 'MARK_PONG'].filter((marker) =>
          component.some((code) => holdsMarker(code, marker)),
        ),
      ).toEqual(['MARK_PING', 'MARK_PONG'])
      await expectValidModules(route)
      expect(await route.run(`return render('component')`)).toBe('<p>dep</p>')
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
      {
        // A package of the app is written with a host of its own (Vite's
        // watcher does not report files in node_modules)
        fresh: true,
        files: appPackage(
          'bar',
          `export const used = 'used'\nexport const preUnused = 'unused'\n`,
        ),
      },
    )
    // What loads with the route no longer imports `used` (whether it keeps
    // loading `bar` is free).
    expect(
      (await route.eagerModules()).flatMap((code) =>
        importedNamesFrom(code, /\/node_modules\/bar\//),
      ),
    ).not.toContain('used')
    await expectValidModules(route)
    expect(await route.run(`return render('component')`)).toBe('<p>used</p>')
  })

  // That `track` runs once too is pinned in known-bugs-code-splitter.test.ts
  // ("an unreferenced top-level side effect (an unused subscription) runs
  // once"): split chunks still copy it.
  it('creates a store the split component shares once, next to a side effect nothing reads', async () => {
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
        files: {
          'store.ts': `export const counts = { created: 0, tracked: 0 }
export const createStore = () => {
  const id = ++counts.created
  return { get: () => id }
}
export const track = (listener: () => void) => {
  counts.tracked++
  return listener
}
`,
        },
      },
    )
    await expectValidModules(route)
    expect(
      await route.run(`const { counts } = await app('store.ts')
// The side effect runs when the route module loads.
const tracked = counts.tracked
return [tracked, options.beforeLoad(), await render('component'), counts.created]`),
    ).toEqual([1, 1, '<p>1</p>', 1])
  })

  // Source: React Router route-chunks-test.ts "shared imports across chunks but
  // not main chunk with shared side effect usage"
  it('runs a top-level call once, with the route module, even when the chunks import its callee', async () => {
    const route = await loadRoute(
      `${head}import { shared } from './shared'
shared('top-level')
export const Route = createFileRoute('/')({
  component: () => <div>{shared('component')}</div>,
  errorComponent: () => <div>{shared('error')}</div>,
})
`,
      {
        files: {
          ...callsModule,
          'shared.ts': `import { calls } from './calls'
export const shared = (label: string) => {
  calls.push(label)
  return label
}
`,
        },
      },
    )
    expect(
      await route.run(`const { calls } = await app('calls.ts')
const loaded = [...calls]
const rendered = [await render('component'), await render('errorComponent')]
return [loaded, rendered, [...calls]]`),
    ).toEqual([
      ['top-level'],
      ['<div>component</div>', '<div>error</div>'],
      ['top-level', 'component', 'error'],
    ])
    await expectValidModules(route)
  })

  // Source: #8504 (differential fuzzing). Other unused declarations with
  // side effects run again in every chunk: pinned in
  // known-bugs-code-splitter.test.ts ("an unreferenced top-level side
  // effect").
  it('runs the initializer of a namespace no split option reads once, with the route module', async () => {
    const route = await loadRoute(
      `${head}import { track } from './track'
namespace Unused { export const value = track('namespace') }
export const Route = createFileRoute('/')({
  component: () => <div>{track('component')}</div>,
})
`,
      {
        files: {
          ...callsModule,
          'track.ts': `import { calls } from './calls'
export const track = (label: string) => {
  calls.push(label)
  return label
}
`,
        },
      },
    )
    expect(
      await route.run(`const { calls } = await app('calls.ts')
const loaded = [...calls]
return [loaded, await render('component'), [...calls]]`),
    ).toEqual([
      ['namespace'],
      '<div>component</div>',
      ['namespace', 'component'],
    ])
  })

  // TypeScript erases type positions, so a declaration whose binding only
  // appears in a type is still live code that runs when the route loads.
  it.each([
    { name: 'the reference module', options: {} },
    {
      name: 'a route module compiled for HMR',
      // The composed plugin without code splitting: its route HMR plugin
      options: {
        hmr: true,
        pluginOptions: { autoCodeSplitting: false },
      } satisfies RouteAppOptions,
    },
  ])(
    'runs a declaration only referenced from types in $name',
    async ({ options }) => {
      const route = await loadRoute(
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
          ...options,
          routeId: '/posts',
          files: {
            'analytics.ts': `export interface Registry {}
export const registered: Array<string> = []
export const registerAnalytics = (path: string) => registered.push(path)
`,
          },
        },
      )
      expect(
        await route.run(`return [...(await app('analytics.ts')).registered]`),
      ).toEqual(['/posts'])
      await expectValidModules(route)
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
    // A user module stands for the context factory (React is never
    // stubbed): it counts the contexts created.
    const route = await loadRoute(
      `${head}import { createContext } from './context'
type Item = { id: string }
const item: Item = { id: 'item' }
const Context = createContext<${type}>(null!)
export const Route = createFileRoute('/')({
  loader: () => item.id,
  component: () => <p>{String(Context.value)}</p>,
})
`,
      {
        files: {
          'context.ts': `export const counts = { created: 0 }
export const createContext = <T,>(value: T) => {
  counts.created++
  return { value }
}
`,
        },
      },
    )
    await expectValidModules(route)
    expect(
      await route.run(`return [
  options.loader(),
  await render('component'),
  (await app('context.ts')).counts.created,
]`),
    ).toEqual(['item', '<p>null</p>', 1])
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
      await expectValidModules(route)
      expect(await route.run(`return render('component')`)).toBe(rendered)
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
      { files: { 'heavy.ts': `export const heavy = () => 'heavy'\n` } },
    )
    expect(await route.requested()).not.toContain('/heavy.ts')
    expect(await route.run(`return render('component')`)).toBe('<p>heavy</p>')
  })

  // A function annotated #__NO_SIDE_EFFECTS__ keeps its annotation where the
  // code splitter moves it (a file with a pragma): its unused calls leave
  // production builds, integration/code-splitter-dead-code.test.ts.

  // Source: React Compiler hook-ref-callback.js and
  // dont-memoize-primitive-function-call-non-escaping.js: a function shared by
  // the loader and the split component declares a local it never reads.
  it.each([
    { name: 'a call', initializer: 'track(id)' },
    { name: 'an optional call', initializer: 'track?.(id)' },
  ])(
    'keeps an unused local initialized by $name in a shared function',
    async ({ initializer }) => {
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
          files: {
            ...callsModule,
            'track.ts': `import { calls } from './calls'
export const track = (label: string) => calls.push(label)
`,
          },
        },
      )
      expect(
        await route.run(`return [
  options.loader(),
  await render('component'),
  [...(await app('calls.ts')).calls],
]`),
      ).toEqual(['loader', '<p>component</p>', ['loader', 'component']])
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
    expect(await route.run(`return render('component')`)).toBe('<p>22</p>')
  })

  // Source: React Router remove-exports-test.ts "iife with dependencies".
  // The IIFE has no purity hint, so a compiler may also keep it eager, once,
  // and warn once naming the file and the option (J2.8); splitting it with
  // its dependencies is the better outcome.
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
        fresh: true,
        files: {
          ...appPackage(
            'removed-lib',
            `export const removedLib = () => 'removed'\n`,
          ),
          ...appPackage('kept-lib', `export const keptLib = () => 'kept'\n`),
          ...appPackage(
            'shared-lib',
            `export const sharedLib = (value) => 'shared:' + value\n`,
          ),
        },
      },
    )
    await expectValidModules(route)
    if (await route.isLazy('component')) {
      // Nothing that loads with the route requests what only the component
      // reads, nothing the component loads imports what only the loader
      // reads.
      expect(
        await route.run(
          `return performance.getEntriesByType('resource').map((entry) => new URL(entry.name).pathname)`,
        ),
      ).not.toContainEqual(
        expect.stringContaining('/node_modules/removed-lib/'),
      )
      expect(
        (await route.loadedBy('component')).flatMap((code) =>
          importedNamesFrom(code, /\/node_modules\/kept-lib\//),
        ),
      ).toEqual([])
    } else {
      expectDiagnostic(await route.diagnostics(), {
        severity: 'warning',
        file: 'route.tsx',
        root: route.host.root,
        times: 1,
      })
    }
    expect(
      await route.run(`return [options.loader(), await render('component')]`),
    ).toEqual(['shared:kept', '<div>shared:removed</div>'])
  })

  // Source: React Router route-chunks-test.ts "isolated exported variable
  // declarations sharing an export statement"; Next.js
  // ssg/getStaticProps/should-remove-re-exported-variable-declarations-safe
  // The declarators carry user markers, so that each one's code is
  // recognised wherever it goes (D5, N10). The markers are part of what the
  // route shows and returns, so no compiler can fold them away.
  it.each([
    {
      name: 'plain declarators',
      declarations: `const Page = () => <div title="MARK_PAGE">{chunkMessage}</div>,
  main = 'MARK_MAIN ' + mainMessage`,
    },
    {
      name: 'destructured declarators',
      declarations: `const { Page } = { Page: () => <div title="MARK_PAGE">{chunkMessage}</div> },
  { main } = { main: 'MARK_MAIN ' + mainMessage }`,
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
          files: {
            'messages.ts': `export const chunkMessage = 'chunk'\nexport const mainMessage = 'main'\n`,
          },
        },
      )
      // What loads with the route holds nothing of the component, what the
      // component loads nothing of the loader; each holds its own.
      const eager = await route.eagerModules()
      expect(
        eager.flatMap((code) => importedNamesFrom(code, /^\/messages\.ts/)),
      ).not.toContain('chunkMessage')
      expect(eager.filter((code) => holdsMarker(code, 'MARK_PAGE'))).toEqual([])
      expect(eager.some((code) => holdsMarker(code, 'MARK_MAIN'))).toBe(true)
      const component = await route.loadedBy('component')
      expect(
        component.flatMap((code) => importedNamesFrom(code, /^\/messages\.ts/)),
      ).not.toContain('mainMessage')
      expect(
        component.filter((code) => holdsMarker(code, 'MARK_MAIN')),
      ).toEqual([])
      expect(component.some((code) => holdsMarker(code, 'MARK_PAGE'))).toBe(
        true,
      )
      await expectValidModules(route)
      expect(
        await route.run(`return [options.loader(), await render('component')]`),
      ).toEqual(['MARK_MAIN main', '<div title="MARK_PAGE">chunk</div>'])
    },
  )

  // Source: React Router route-chunks-test.ts "exported variable declarations
  // sharing an export statement"
  // The component records the instance of `Page` it runs as: the one the
  // loader returns.
  it('keeps one component that a sibling declarator reads', async () => {
    const route = await loadRoute(
      `${head}import { sharedMessage, see } from './messages'
const Page = () => <div>{see(Page)}{sharedMessage}</div>,
  Preview = Page
export const Route = createFileRoute('/')({
  loader: () => Preview,
  component: Page,
})
`,
      {
        files: {
          'messages.ts': `export const sharedMessage = 'shared'
export const seen: Array<unknown> = []
export const see = (value: unknown) => {
  seen.push(value)
  return ''
}
`,
        },
      },
    )
    await expectValidModules(route)
    expect(
      await route.run(`const html = await render('component')
const { seen } = await app('messages.ts')
return [html, seen.length, seen[0] === options.loader()]`),
    ).toEqual(['<div>shared</div>', 1, true])
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
      // The branch the page takes (the old server-only branch never runs
      // in a browser): the value is the browser's
      name: 'an if block',
      setup: "if (typeof window !== 'undefined') { var value = 'browser' }",
      value: 'browser',
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
      await expectValidModules(route)
      expect(
        await route.run(`return [options.loader(), await render('component')]`),
      ).toEqual([value, `<div>${value}</div>`])
    },
  )

  it('stay exported when exported and read by the component', async () => {
    const route = await loadRoute(
      `${head}if (typeof window !== 'undefined') { var flag = 'browser' }
export { flag }
export const Route = createFileRoute('/')({
  component: () => <div>{flag}</div>,
})
`,
      { files: { 'importer.ts': `export { flag } from './route'\n` } },
    )
    await expectValidModules(route)
    expect(
      await route.run(
        `return [(await app('importer.ts')).flag, await render('component')]`,
      ),
    ).toEqual(['browser', '<div>browser</div>'])
  })

  // Source: babel-dead-code-elimination dead-code-elimination.test.ts "variable"
  // (var bindings declared inside nested statements)
  it('run once and give each option its value', async () => {
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
        files: {
          'lib.ts': `export const calls = { compute: 0, connect: 0 }
export const compute = () => {
  calls.compute++
  return 'flag'
}
export const connect = () => {
  calls.connect++
  return 'block'
}
`,
        },
      },
    )
    await expectValidModules(route)
    expect(
      await route.run(`return [
  options.loader(),
  await render('component'),
  { ...(await app('lib.ts')).calls },
]`),
    ).toEqual(['block', '<p>flag3</p>', { compute: 1, connect: 1 }])
  })
})

describe('robustness', () => {
  it('compiles a route with a long method chain', async () => {
    // Builder APIs (schemas, query builders) produce deep left-nested calls
    const chain = Array.from({ length: 200 }, (_, i) => `.add(${i})`).join('')
    const route = await loadRoute(
      `${head}import { builder } from './builder'
const schema = builder()${chain}
export const Route = createFileRoute('/')({
  loader: () => schema,
  component: () => <div>{String(schema)}</div>,
})
`,
      {
        files: {
          'builder.ts': `export const calls = { builder: 0, add: 0 }
export const schema = {
  add: () => {
    calls.add++
    return schema
  },
  toString: () => 'schema',
}
export const builder = () => {
  calls.builder++
  return schema
}
`,
        },
      },
    )
    await expectValidModules(route)
    // The chain runs once, whichever module holds it.
    expect(
      await route.run(`const lib = await app('builder.ts')
return [
  options.loader() === lib.schema,
  await render('component'),
  { ...lib.calls },
]`),
    ).toEqual([true, '<div>schema</div>', { builder: 1, add: 200 }])
  })
})
