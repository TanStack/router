/**
 * Known code-splitter bugs. Each test asserts correct behaviour for a bug on
 * main and is marked .fails; remove .fails when the bug is fixed.
 */
import { BuildError } from '@tanstack/compiler-test-utils/build-harness'
import { parseSync } from 'vite'
import { describe, expect, test, vi } from 'vitest'
import { build, routeApp } from './build-harness'
import {
  buildAndRun,
  compileRouteModules,
  declarationOf,
  evaluateModule,
  expectValidModules,
  head,
  importSources,
  loadRoute,
} from './regression-helpers'
import type { Bundler } from '@tanstack/compiler-test-utils/build-harness'
import type { CodeSplitGroupings } from '../src/core/constants'

/**
 * Bundlers whose router plugin splits routes (the esbuild adapter does not;
 * pinned in build-harness.test.ts).
 */
const clientBundlers: Array<Bundler> = ['vite', 'rspack', 'webpack']

/** Stubs `./state`, counting the calls of `init` and `register`. */
function stateStub() {
  const state = {
    calls: 0,
    init: <T>(value: T) => {
      state.calls++
      return value
    },
    register: (items: Array<string>) => {
      state.calls++
      items.push('item')
    },
  }
  return state
}

describe('module state shared with split chunks', () => {
  // Control for loadRoute: a top-level const read by the loader and the split
  // component moves to the shared module and is initialized once.
  test('a const read by the loader and the split component is initialized once', async () => {
    const state = stateStub()
    const route = await loadRoute(
      `${head}import { init } from './state'
const value = init(1)
export const Route = createFileRoute('/')({
  loader: () => value,
  component: () => <p>{value}</p>,
  errorComponent: () => <p>error</p>,
})`,
      { stubs: { './state': state } },
    )
    // The route module has loaded; the split chunks load on demand.
    const callsBeforeChunks = state.calls
    expect([
      route.options.loader(),
      (await route.load('component'))(),
      (await route.load('errorComponent'))(),
      callsBeforeChunks,
      state.calls,
    ]).toEqual([1, '<p>1</p>', '<p>error</p>', 1, 1])
  })

  // Control for evaluateModule: a module may link a shared module through a
  // side-effect or namespace import, as a fix might emit.
  test('evaluateModule links side-effect and namespace imports', async () => {
    const { read } = await evaluateModule(
      `import './effects'
import * as lib from './lib'
export const read = () => lib.value`,
      { './effects': {}, './lib': { value: 'lib' } },
    )
    expect(read!()).toBe('lib')
  })

  // Bug: a `var` nested in a statement, an enum or a namespace is not shared.
  // The `var` is missed because module bindings are collected from top-level
  // declarations only (`collectLocalBindingsFromStatement`); same root cause
  // as the nested-block `var` pin in
  // start-plugin-core/tests/known-bugs-hydrate.test.ts.
  // Impact: the route throws a ReferenceError or runs the declaration per module.
  test.fails.each([
    {
      name: 'a var in an if block',
      declaration: `if (globalThis) { var value = init(1) }
const read = () => value`,
    },
    {
      name: 'a var in a try block',
      declaration: `try { var value = init(1) } catch {}
const read = () => value`,
    },
    {
      name: 'a var in a for head',
      declaration: `for (var value = init(0); value < 1; value++) {}
const read = () => value`,
    },
    {
      name: 'a var in a for head, read directly',
      declaration: `for (var value = init(0); value < 1; value++) {}`,
      read: 'value',
    },
    {
      name: 'an enum',
      declaration: `enum Value { One = init(1) }
const read = () => Value.One`,
    },
    {
      name: 'a namespace',
      declaration: `namespace Value { export const one = init(1) }
const read = () => Value.one`,
    },
  ])(
    'a binding declared by $name and read by the loader and the split component is initialized once',
    async ({ declaration, read = 'read()' }) => {
      const state = stateStub()
      const route = await loadRoute(
        `${head}import { init } from './state'
${declaration}
export const Route = createFileRoute('/')({
  loader: () => ${read},
  component: () => <p>{${read}}</p>,
})`,
        { stubs: { './state': state } },
      )
      expect([
        route.options.loader(),
        (await route.load('component'))(),
        state.calls,
      ]).toEqual([1, '<p>1</p>', 1])
    },
  )

  // Bug: a `let` that code in another module than its declaration reassigns
  // is imported there, read-only: a `let` the loader reassigns is shared, so
  // the route module assigns to an import of the shared module; an exported
  // `let` the split component reassigns stays in the route module, which the
  // chunk imports it from ("Cannot assign to import").
  // Impact: the route cannot be built as soon as code splitting is on.
  // Needs a real build: imports are live bindings, and the in-process harness
  // snapshots them, so even a correct fix would read a stale value there.
  test.fails.each([
    {
      name: 'the loader reassigns',
      route: `${head}let count = 0
export const Route = createFileRoute('/')({
  loader: () => { count++; return count },
  component: () => <p>{count}</p>,
})`,
      script: `const loaded = [await entry.Route.options.loader({}), await entry.Route.options.loader({})]
return [...loaded, await entry.render(entry.Route.options.component)]`,
      expected: [1, 2, '<p>2</p>'],
    },
    {
      name: 'the split component reassigns (exported)',
      route: `${head}export let count = 0
function Page() {
  count++
  return <p>{count}</p>
}
export const Route = createFileRoute('/')({ component: Page })`,
      script: `const component = entry.Route.options.component
return [await entry.render(component), await entry.render(component), entry.count]`,
      expected: ['<p>1</p>', '<p>2</p>', 2],
    },
  ])(
    'a let $name stays writable and the split component reads its value',
    async ({ route, script, expected }) => {
      expect(await buildAndRun(route, script)).toEqual(expected)
    },
    30_000,
  )

  // Bug: a top-level statement that writes a binding stays in the reference
  // module when the binding moves to the shared module or a split chunk.
  // Impact: the write throws (an import is read-only, or the moved binding is
  // not declared there) or runs after the shared declarations that it should
  // precede.
  test.fails.each([
    {
      name: 'a function (reassignment)',
      // Source: React Compiler fixture module-scoped-bindings.js
      setup: `function format() {
  return 'original'
}
format = () => 'reassigned'`,
      loader: 'format()',
      component: '() => <p>{format()}</p>',
      expected: ['reassigned', '<p>reassigned</p>'],
    },
    {
      name: 'a registry a shared store is created from (push)',
      // Source: Turbopack tree-shaker analyzer/write-order, analyzer/shared-2
      // and analyzer/shared-regression
      setup: `import { init } from './state'
const plugins: Array<string> = []
plugins.push('auth')
const store = init({ plugins: [...plugins] })
plugins.push('late')`,
      loader: 'store.plugins',
      component: '() => <p>{store.plugins.join()}</p>',
      // One store, created once.
      expected: [['auth'], '<p>auth</p>'],
      inits: 1,
    },
    {
      name: 'the split component (property assignment)',
      // Source: React Router remove-exports-test.ts "function statement with
      // property assignment" and "arrow function with property assignment"
      setup: `function Page() {
  return <div>{Page.displayName}</div>
}
Page.displayName = 'PageDisplay'`,
      loader: `'data'`,
      component: 'Page',
      expected: ['data', '<div>PageDisplay</div>'],
      split: 'Page',
    },
  ])(
    'top-level writes to $name stay with the binding they write',
    async ({ setup, loader, component, expected, inits = 0, split }) => {
      const state = stateStub()
      const route = await loadRoute(
        `${head}${setup}
export const Route = createFileRoute('/')({
  loader: () => ${loader},
  component: ${component},
})`,
        { stubs: { './state': state } },
      )
      const { modules } = route
      expect([
        route.options.loader(),
        (await route.load('component'))(),
        state.calls,
      ]).toEqual([...expected, inits])
      if (split) {
        // The component is still split out of the route module.
        expect(modules.reference).not.toMatch(declarationOf(split))
      }
    },
  )

  // Bug: shared bindings are computed from the statically named route options
  // only (`computeSharedBindings` skips computed keys), so a declaration that
  // one split chunk reads and that the reference module keeps as well (for an
  // export, a top-level call, another binding of the declaration, or a route
  // option under a computed key) is not shared: the chunk declares its own
  // copy.
  // Impact: module state is duplicated; the component reads another instance.
  test.fails.each([
    {
      name: 'a destructuring with one exported binding',
      declaration: `const { a, b } = init({ a: 'a', b: 'b' })
export { a }`,
      render: '{a + b}',
      html: '<p>ab</p>',
    },
    {
      name: 'a binding read by an exported function',
      // Source: Qwik optimizer test.rs
      // should_keep_module_level_var_used_in_both_main_and_qrl
      declaration: `const state = init({ count: 0 })
export function increment() {
  return ++state.count
}`,
      render: '{increment()}-{state.count}',
      html: '<p>1-1</p>',
    },
    {
      name: 'an array destructuring with an unreferenced binding',
      // Source: Next.js ssg/getStaticProps/destructuring-assignment-array
      declaration: `const [unused, value] = init(['unused', 'value'])`,
      render: '{value}',
      html: '<p>value</p>',
    },
    {
      name: 'a binding filled by a top-level registration call',
      // Source: React Router route-chunks-test.ts "top level await" and
      // "object property mutation"
      declaration: `const items: Array<string> = []
register(items)`,
      render: '{items.join()}',
      html: '<p>item</p>',
    },
    {
      name: 'a binding read by a computed-key route option',
      declaration: `const store = init({ count: 1 })
const key = 'staticData'`,
      options: `  [key]: { read: () => store },\n`,
      render: '{store.count}',
      html: '<p>1</p>',
    },
  ])(
    'module state that the reference module keeps for $name is initialized once',
    async ({ declaration, options = '', render, html }) => {
      const state = stateStub()
      const route = await loadRoute(
        `${head}import { init, register } from './state'
${declaration}
export const Route = createFileRoute('/')({
${options}  component: () => <p>${render}</p>,
})`,
        { stubs: { './state': state } },
      )
      expect([(await route.load('component'))(), state.calls]).toEqual([
        html,
        1,
      ])
    },
  )

  // Bug: split chunks keep the top-level statements that nothing references
  // unless they are expression statements: dead-code elimination only removes
  // what the split made unreferenced, and
  // `stripUnreferencedTopLevelExpressionStatements` only strips expression
  // statements, so an `if` block, a declaration whose binding is never read
  // or an `export * from` is copied into every split chunk.
  // A reference cycle that nothing else reads keeps its own references, so a
  // fix that drops only declarations nothing references still copies it.
  // Impact: side effects run again for every chunk that loads, even a chunk
  // holding only the errorComponent (duplicated subscriptions, logging); every
  // chunk depends on and re-exports all of the `export *` module through the
  // opaque namespace of its dynamic import, which defeats tree-shaking of it.
  test.fails.each([
    {
      name: 'an if statement',
      effect: `if (typeof globalThis === 'object') {
  track()
}`,
    },
    {
      name: 'an unused subscription',
      effect: `const unsubscribe = subscribe(() => {})`,
    },
    {
      name: 'an unused reference cycle',
      effect: `const a = subscribe(() => b)
const b = () => a`,
    },
    {
      name: 'a static field of an unused class',
      effect: `class Unused {
  static value = track()
}`,
    },
    {
      name: 'a member initializer of an unused enum',
      effect: `enum Unused {
  Value = track(),
}`,
    },
  ])(
    'an unreferenced top-level side effect ($name) runs once, with the route module',
    async ({ effect }) => {
      let calls = 0
      const route = await loadRoute(
        `${head}import { subscribe, track } from './effects'
${effect}
export const Route = createFileRoute('/')({
  component: () => <p>index</p>,
  errorComponent: () => <p>error</p>,
})`,
        {
          stubs: {
            './effects': {
              track: () => calls++,
              subscribe: (listener: () => void) => {
                calls++
                return listener
              },
            },
          },
        },
      )
      const callsBeforeChunks = calls
      const loaded: Array<string> = []
      for (const option of ['component', 'errorComponent']) {
        if (typeof (await route.load(option)) === 'function') {
          loaded.push(option)
        }
      }
      // Both chunks loaded, and the effect ran once, with the route module.
      expect([loaded.join(), callsBeforeChunks, calls]).toEqual([
        'component,errorComponent',
        1,
        1,
      ])
    },
  )

  test.fails('split chunks do not re-export a module-level export *', () => {
    const { modules } = compileRouteModules(`${head}export * from './lib'
export const Route = createFileRoute('/')({
  component: () => <p>index</p>,
})`)
    /** Sources a module imports or re-exports from. */
    const requested = (code: string) => [
      ...importSources(code),
      ...parseSync('module.tsx', code, {
        sourceType: 'module',
      }).module.staticExports.flatMap((statement) =>
        statement.entries.flatMap((entry) =>
          entry.moduleRequest ? [entry.moduleRequest.value] : [],
        ),
      ),
    ]
    expect(requested(modules.reference!)).toContain('./lib')
    const chunksRequestingLib = Object.keys(modules).filter(
      (name) =>
        name.startsWith('virtual ') &&
        requested(modules[name]!).includes('./lib'),
    )
    expect(chunksRequestingLib).toEqual([])
  })

  // Bug: an ambient `declare const` is handled as a module binding. Read by
  // the loader and the split component, it is shared: the shared module
  // exports a name that TypeScript erases, and the reference module and the
  // chunk import it. Used as a split option, the chunk exports it
  // (`export { GlobalPage as component }`), an export TypeScript erases.
  // Impact: the build fails with a missing export, e.g. for a constant
  // injected with Vite's `define`, or the split component is undefined.
  test.fails.each([
    {
      name: 'read by the loader and the split component',
      global: '1.0',
      route: `${head}declare const APP_VERSION: string
export const Route = createFileRoute('/')({
  loader: () => APP_VERSION,
  component: () => <p>{APP_VERSION}</p>,
})`,
      expected: ['1.0', '<p>1.0</p>'],
    },
    {
      name: 'used as the split component',
      global: () => '<p>global</p>',
      route: `${head}declare const APP_VERSION: any
export const Route = createFileRoute('/')({ component: APP_VERSION })`,
      expected: ['<p>global</p>'],
    },
  ])(
    'an ambient declare const $name stays a global',
    async ({ global, route, expected }) => {
      vi.stubGlobal('APP_VERSION', global)
      try {
        const loaded = await loadRoute(route)
        expect([
          ...(loaded.options.loader ? [loaded.options.loader()] : []),
          (await loaded.load('component'))(),
        ]).toEqual(expected)
      } finally {
        vi.unstubAllGlobals()
      }
    },
  )
})

describe('split route options', () => {
  /** Loads `/` with a real router and returns each match's loader data. */
  const routerEntry = `import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export async function load() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return router.state.matches.map((match) => match.loaderData ?? null)
}`

  function loadWithSplitLoader(loader: string, declarations = '') {
    return buildAndRun(
      `${head}${declarations}export const Route = createFileRoute('/')({
  loader: ${loader},
  component: () => <p>index</p>,
})`,
      `return await entry.load()`,
      {
        files: { 'entry.ts': routerEntry },
        groupings: [['loader'], ['component']],
      },
    )
  }

  // Control for the object-form loader pin below (same harness).
  test('a split loader loads route data', async () => {
    expect(await loadWithSplitLoader(`() => 'loaded'`)).toEqual([
      null,
      'loaded',
    ])
  }, 30_000)

  // Bug: the object form `loader: { handler }` cannot be split: the virtual
  // compiler throws "Unexpected splitNode type ☝️: ObjectExpression".
  // Impact: a route with an object-form loader cannot be built once the
  // loader is split.
  test.fails(
    'a split loader in object form loads route data',
    async () => {
      expect(await loadWithSplitLoader(`{ handler: () => 'loaded' }`)).toEqual([
        null,
        'loaded',
      ])
    },
    30_000,
  )

  // Bug: an object-form loader passed by reference (`loader` holding
  // `{ handler }`) is split as if it were the loader function, so the route
  // calls the object ("... is not a function").
  // Impact: the route's data never loads once the loader is split.
  test.fails(
    'a split loader in object form passed by reference loads route data',
    async () => {
      expect(
        await loadWithSplitLoader(
          'loader',
          `const loader = { handler: () => 'loaded' }\n`,
        ),
      ).toEqual([null, 'loaded'])
    },
    30_000,
  )
})

describe('route options read from the environment', () => {
  /**
   * The component the route renders: the route option itself, or what the
   * lazy option loads when it was split.
   */
  async function routeComponent(
    code: string,
    stubs: Record<string, Record<string, unknown>> = {},
  ) {
    return (await loadRoute(code, { stubs })).load('component')
  }

  // Control for the pins below (same harness).
  test('a split component imported by the route file renders', async () => {
    const Page = () => null
    expect(
      await routeComponent(
        `import { Page } from './page'
${head}export const Route = createFileRoute('/')({ component: Page })
`,
        { './page': { Page } },
      ),
    ).toBe(Page)
  })

  // Bug: a split option that is a global (no declaration in the module) or
  // an ambient `declare const` is exported from the chunk under a name the
  // chunk never declares ("Export '...' is not defined"), or the export is
  // erased with the `declare`.
  // Impact: the chunk fails to load, or the route renders no component.
  test.fails.each([
    { name: 'an undeclared global', declaration: '' },
    {
      name: 'an ambient declare const',
      declaration: 'declare const TsrGlobalPage: () => null\n',
    },
  ])('a component read from $name renders', async ({ declaration }) => {
    const TsrGlobalPage = () => null
    vi.stubGlobal('TsrGlobalPage', TsrGlobalPage)
    try {
      expect(
        await routeComponent(`${head}${declaration}export const Route = createFileRoute('/')({
  component: TsrGlobalPage,
})
`),
      ).toBe(TsrGlobalPage)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('classic JSX pragmas', () => {
  /** Emotion's `jsx`, rendering intrinsic elements as `<emotion:tag>`. */
  const emotion = {
    jsx: (type: string, _props: unknown, ...children: Array<string>) =>
      `<emotion:${type}>${children.join('')}</emotion:${type}>`,
  }
  const pragma = `/** @jsxRuntime classic */
/** @jsx jsx */
import { jsx } from '@emotion/react'
`

  // Control for the JSX pragma pin below (same rendering).
  test('evaluateModule renders JSX through the factory of a classic JSX pragma', async () => {
    const { Page } = await evaluateModule(
      `${pragma}export const Page = () => <div>page</div>`,
      { '@emotion/react': emotion },
    )
    expect(Page!()).toBe('<emotion:div>page</emotion:div>')
  })

  // Bug: dead-code elimination does not count a classic JSX pragma
  // (`/** @jsx jsx */`) as a use of the factory it names, so a chunk whose
  // only use of the factory is its JSX drops the factory import. Same root
  // cause as the JSX pragma pins in
  // start-plugin-core/tests/known-bugs-start-compiler.test.ts and
  // known-bugs-hydrate.test.ts.
  // Impact: the split component throws "jsx is not defined".
  test.fails(
    'a split component renders through the factory of a classic JSX pragma',
    async () => {
      const route = await loadRoute(
        `${pragma}${head}export const Route = createFileRoute('/')({
  component: () => <div>page</div>,
  errorComponent: () => jsx('b', null, 'error'),
})`,
        { stubs: { '@emotion/react': emotion } },
      )
      expect((await route.load('component'))()).toBe(
        '<emotion:div>page</emotion:div>',
      )
    },
  )

  // Bug: the shared-binding analysis does not count the JSX of a split option
  // as a read of the classic JSX factory it compiles to, so a factory that
  // the route module creates and the loader reads is not shared with the
  // split component: the chunk drops it (same root cause as the pin above),
  // and keeping it in the chunk without sharing it creates it again there.
  // Impact: the split component throws "jsx is not defined", or the route
  // module and the chunk each create their own factory.
  test.fails(
    'a factory the route module creates and the loader reads is created once for the split component',
    async () => {
      let creations = 0
      const route = await loadRoute(
        `/** @jsxRuntime classic */
/** @jsx jsx */
${head}import { createJsx } from './jsx'
const jsx = createJsx()
export const Route = createFileRoute('/')({
  loader: () => jsx('span', null),
  component: () => <div>page</div>,
})`,
        {
          stubs: {
            './jsx': {
              createJsx: () => {
                creations++
                return emotion.jsx
              },
            },
          },
        },
      )
      expect([
        route.options.loader(),
        (await route.load('component'))(),
        creations,
      ]).toEqual([
        '<emotion:span></emotion:span>',
        '<emotion:div>page</emotion:div>',
        1,
      ])
    },
  )
})

describe('exported bindings', () => {
  // Bug: the "will not be code-split" warning is only reported when the code
  // splitter changes the route module. In a production build, a route whose
  // only split candidate is an exported component is left as is, so the
  // warning is never shown (route HMR changes the module in dev, which shows
  // it).
  // Impact: no diagnostic in production builds for a page that stays in the
  // entry chunk.
  test.fails(
    'an exported component that is the only split candidate is split or reported as not code-split',
    async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const route = await loadRoute(`${head}export function Page() {
  return <p>page</p>
}
export const Route = createFileRoute('/')({ component: Page })
`)
        expect({
          split: route.isLazy('component'),
          warned: warn.mock.calls.some(([message]) =>
            String(message).includes('will not be code-split'),
          ),
        }).not.toEqual({ split: false, warned: false })
      } finally {
        warn.mockRestore()
      }
    },
  )

  /**
   * Builds an app whose entry imports the route, and returns where the code
   * marked `MARK_DECLARATION` ends up: `entry` for a module the entry loads
   * statically, `lazy` for a chunk it loads on demand.
   */
  function placeMarkedCode(route: string) {
    return buildAndRun(
      route,
      `const fs = await import('node:fs')
const path = await import('node:path')
const url = await import('node:url')
const dir = path.dirname(url.fileURLToPath(entry.entryUrl))
const read = (file) => fs.readFileSync(path.join(dir, file), 'utf8')
const eager = new Set()
const visit = (file) => {
  if (eager.has(file)) return
  eager.add(file)
  for (const [, specifier] of read(file).matchAll(/(?:\\bfrom\\s*|\\bimport\\s*)["']\\.\\/([^"']+)["']/g)) visit(specifier)
}
visit('entry.mjs')
return [
  ...new Set(
    fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.mjs') && read(file).includes('MARK_DECLARATION'))
      .map((file) => (eager.has(file) ? 'entry' : 'lazy')),
  ),
]`,
      {
        files: {
          // Without it the app inherits the package's `sideEffects: false`
          'package.json': JSON.stringify({
            name: 'app',
            private: true,
            type: 'module',
          }),
          'entry.ts': `import { Route } from './routes/index'
export { Route }
export const entryUrl = import.meta.url
`,
          'heavy.ts': `export function heavy(label: string) {
  return label
}
`,
        },
      },
    )
  }

  // Control for the pin below (same app, `Card` not exported).
  test('a const only a split component renders is loaded with its chunk', async () => {
    expect(
      await placeMarkedCode(`${head}import { heavy } from '../heavy'
const Card = () => <b>{heavy('MARK_DECLARATION')}</b>
function Page() {
  return <Card />
}
export const Route = createFileRoute('/')({ component: Page })
`),
    ).toEqual(['lazy'])
  }, 30_000)

  // Bug: a split chunk imports an exported variable from the route module, so
  // a component defined as `export const Card = () => ...` that only the
  // split component renders stays in the route module, which the entry chunk
  // loads, with everything it imports.
  // Impact: page code exported for tests or reuse loads with the entry chunk.
  test.fails(
    'an exported const only a split component renders is loaded with its chunk',
    async () => {
      expect(
        await placeMarkedCode(`${head}import { heavy } from '../heavy'
export const Card = () => <b>{heavy('MARK_DECLARATION')}</b>
function Page() {
  return <Card />
}
export const Route = createFileRoute('/')({ component: Page })
`),
      ).toEqual(['lazy'])
    },
    30_000,
  )
})

describe('TypeScript-only syntax', () => {
  // Bug: a type-only import re-exported without `type` (`export { Settings }`,
  // which TypeScript accepts unless verbatimModuleSyntax is on) loses its
  // import in the route module and the split chunks, which keep the export
  // that the TypeScript transform can then no longer erase. The Start
  // compiler has the same bug (pin in
  // start-plugin-core/tests/known-bugs-start-compiler.test.ts).
  // Impact: the route fails to load ("Export 'Settings' is not defined").
  test.fails.each([
    `import type { Settings } from './settings'`,
    `import { type Settings } from './settings'`,
  ])(
    'a type-only import re-exported as `export { Settings }` is erased (%s)',
    async (importDeclaration) => {
      const { modules } = compileRouteModules(`${head}${importDeclaration}
export { Settings }
export const Route = createFileRoute('/')({
  component: () => <p>index</p>,
})`)
      await expectValidModules(modules)
    },
  )

  /** A route whose `beforeLoad` and split loader both call `helper`. */
  const sharedHelperRoute = (helper: string) => `${head}${helper}
export { helper as helperAlias }
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['component'], ['loader']],
  component: () => null,
  beforeLoad: () => helper('before'),
  loader: () => helper(42),
})`

  async function callSharedHelper(helper: string) {
    const route = await loadRoute(sharedHelperRoute(helper))
    return [
      route.exports.helperAlias === route.exports.helper,
      route.options.beforeLoad(),
      await route.options.loader(),
    ]
  }

  // Control for the overload pin below (same route, no overload signatures).
  test('a function the route module and a split loader share keeps working', async () => {
    expect(
      await callSharedHelper(
        `export function helper(value: string | number) { return value }`,
      ),
    ).toEqual([true, 'before', 42])
  })

  // Bug: the overload signatures of a function that the route module and a
  // split chunk share stay in both modules, next to the import of the shared
  // function, and the TypeScript transform then takes them for the binding's
  // declaration and drops the import (dead-code elimination never removes
  // overload signatures). Source: #8505.
  // Impact: the route module fails to load ("Export 'helper' is not defined").
  test.fails(
    'an overloaded function the route module and a split loader share keeps working',
    async () => {
      expect(
        await callSharedHelper(`export function helper(value: string): string
export function helper(value: number): number
export function helper(value: string | number) { return value }`),
      ).toEqual([true, 'before', 42])
    },
  )
})

describe('app paths', () => {
  const route = `${head}export const Route = createFileRoute('/')({
  component: () => <p>index</p>,
})`
  const script = `return await entry.render(entry.Route.options.component)`

  // Control for the `#` pin below (same app, without `#`).
  test('an app builds and preloads a split component', async () => {
    expect(await buildAndRun(route, script)).toBe('<p>index</p>')
  }, 30_000)

  // Bug: the route module imports its chunks by absolute file path with the
  // split query (`<root>/routes/index.tsx?tsr-split=component`), and a `#`
  // in the path is read as the start of a URL fragment.
  // Impact: an app in a directory whose name contains `#` cannot be built
  // with code splitting ([UNRESOLVED_IMPORT]).
  test.fails(
    'an app in a directory with # in its name builds and preloads a split component',
    async () => {
      expect(
        await buildAndRun(route, script, { prefix: '.regression-build-#' }),
      ).toBe('<p>index</p>')
    },
    30_000,
  )

  // Bug: the route module's chunk importers are built by pasting the
  // absolute file path into a single-quoted string
  // (`import('${splitUrl}')`), so a `'` in the path ends the string early.
  // Source: #7754.
  // Impact: an app in a directory whose name contains `'` (e.g. a user
  // folder) cannot be built or served once code splitting is on: every route
  // fails with a syntax error.
  test.fails(
    "an app in a directory with ' in its name builds and preloads a split component",
    async () => {
      expect(
        await buildAndRun(route, script, { prefix: ".regression-build-it's-" }),
      ).toBe('<p>index</p>')
    },
    30_000,
  )
})

describe('code that reads a split binding', () => {
  /**
   * Loads a route whose component is `Page`, declared next to `exports`, and
   * returns what the route renders and what `read` gets from the route
   * module's exports.
   */
  async function renderPage(
    exports: string,
    read: (moduleExports: Record<string, any>) => unknown,
  ) {
    const route = await loadRoute(
      `${head}import { wrap } from './wrap'
function Page() {
  return <p>page</p>
}
${exports}
export const Route = createFileRoute('/')({ component: Page })
`,
      { stubs: { './wrap': { wrap: (component: unknown) => component } } },
    )
    return [(await route.load('component'))(), read(route.exports)]
  }

  // Control for the pin below (same harness, an export that does not read
  // `Page`).
  test('a split component renders next to another export', async () => {
    expect(
      await renderPage(
        `export const label = wrap('label')`,
        (moduleExports) => moduleExports.label,
      ),
    ).toEqual(['<p>page</p>', 'label'])
  })

  // Bug: when a route option names a binding that the code splitter moves
  // into a chunk, the splitter deletes the binding's declaration from the
  // route module (`removeIdentifierLiteral`), even when other code there
  // still reads it. Only `export function`/`export const` declarations are
  // checked, so export lists, aliases and exports that use the binding lose
  // it. Source: #8505 (`export { component as View }`), gap O7.
  // Impact: the route module throws when it loads ("Page is not defined",
  // "Export 'Page' is not defined"), so the route never renders.
  test.fails.each([
    {
      name: 'an exported object',
      exports: 'export const meta = { fn: Page }',
      read: (moduleExports: Record<string, any>) => moduleExports.meta.fn(),
    },
    {
      name: 'an exported function',
      exports: 'export function Preview() { return <Page /> }',
      read: (moduleExports: Record<string, any>) => moduleExports.Preview(),
    },
    {
      name: 'a default export',
      exports: 'export default wrap(Page)',
      read: (moduleExports: Record<string, any>) => moduleExports.default(),
    },
    {
      name: 'an export list',
      exports: 'export { Page }',
      read: (moduleExports: Record<string, any>) => moduleExports.Page(),
    },
    {
      name: 'an export alias',
      exports: 'export { Page as View }',
      read: (moduleExports: Record<string, any>) => moduleExports.View(),
    },
  ])(
    'a split component that $name reads renders from both',
    async ({ exports, read }) => {
      expect(await renderPage(exports, read)).toEqual([
        '<p>page</p>',
        '<p>page</p>',
      ])
    },
  )
})

describe('class components', () => {
  // Control for the class pin below (same harness, a function component).
  test('a function component declared in the route file renders', async () => {
    const route = await loadRoute(`${head}function Page() {
  return 'page'
}
export const Route = createFileRoute('/')({ component: Page })
`)
    expect((await route.load('component'))()).toBe('page')
  })

  // Bug: a route option that names a class cannot be split: the virtual
  // compiler throws "Unexpected splitNode type ☝️: ClassDeclaration".
  // Source: #8505 (`export class component {}`).
  // Impact: a route whose component is a class component cannot be built
  // once code splitting is on.
  test.fails.each([
    `class Page { render() { return 'page' } }`,
    `export class Page { render() { return 'page' } }`,
  ])(
    'a class component declared in the route file renders (%s)',
    async (declaration) => {
      const route = await loadRoute(`${head}${declaration}
export const Route = createFileRoute('/')({ component: Page })
`)
      const Component = await route.load('component')
      expect(new Component().render()).toBe('page')
    },
  )
})

describe('side-effect imports', () => {
  /** Stubs of `./setup` and `./Page` that record when each module runs. */
  function recordingStubs(log: Array<string>) {
    const Page = () => '<p>page</p>'
    return {
      './setup': {
        get ready() {
          log.push('./setup')
          return true
        },
      },
      './Page': {
        get Page() {
          log.push('./Page')
          return Page
        },
      },
    }
  }

  // Control for the pin below: a side-effect import of another module runs
  // when the route module loads.
  test('a side-effect import runs when the route module loads', async () => {
    const log: Array<string> = []
    const route = await loadRoute(
      `${head}import './setup'
import { Page } from './Page'
export const Route = createFileRoute('/')({ component: Page })
`,
      { stubs: recordingStubs(log) },
    )
    expect(log).toEqual(['./setup'])
    expect((await route.load('component'))()).toBe('<p>page</p>')
  })

  // Bug: when the split component is imported (`import { Page } from
  // './Page'`), the code splitter also removes every bare import of that path
  // from the route module (`removableImportPaths`), including the user's own
  // `import './Page'`. Source: gap O2.
  // Impact: what that module does when it loads (registrations, styles,
  // polyfills) is deferred until the component chunk loads.
  test.fails(
    "a side-effect import of the split component's module runs when the route module loads",
    async () => {
      const log: Array<string> = []
      const route = await loadRoute(
        `${head}import './Page'
import { Page } from './Page'
export const Route = createFileRoute('/')({ component: Page })
`,
        { stubs: recordingStubs(log) },
      )
      expect(log).toEqual(['./Page'])
      expect((await route.load('component'))()).toBe('<p>page</p>')
    },
  )
})

describe('`this` in split callbacks', () => {
  /**
   * Builds an app whose `/` route has `loader`, with the given groupings,
   * loads `/` with a real router and returns the route's loader data; or
   * `reported` when the build fails or warns about `this`.
   */
  async function loadWithLoader(loader: string, groupings: CodeSplitGroupings) {
    let app
    try {
      app = await build({
        bundler: 'vite',
        env: 'ssr',
        minify: false,
        packageJson: null,
        files: routeApp(
          `${head}export const Route = createFileRoute('/')({
  loader: ${loader},
  component: () => <p>index</p>,
})`,
          {
            files: {
              'entry.ts': `import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export async function load() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return router.state.matches.at(-1)?.loaderData
}`,
            },
          },
        ),
        pluginOptions: { codeSplittingOptions: { defaultBehavior: groupings } },
      })
    } catch (error) {
      if (error instanceof BuildError && /\bthis\b/.test(error.message)) {
        return 'reported'
      }
      throw error
    }
    if (
      [...app.warnings, ...app.consoleMessages].some((message) =>
        /\bthis\b/.test(message),
      )
    ) {
      return 'reported'
    }
    return (await app.run('return await entry.load()')).result
  }

  const readsThis = `function () {
  return this === undefined ? 'no this' : 'this: ' + Object.keys(this).join()
}`

  // Control for the pin below: the router calls an unsplit loader without a
  // `this`.
  test('an unsplit loader is called without a `this`', async () => {
    expect(await loadWithLoader(readsThis, [['component']])).toBe('no this')
  }, 60_000)

  // Bug: a split loader is called as a method of its chunk's module
  // namespace (`lazyFn` calls `imported[key](...args)`), so its `this` is
  // the chunk's exports, where the router calls an unsplit loader without a
  // `this`. Source: #8688.
  // Impact: a loader that reads `this` behaves differently once split,
  // without any diagnostic.
  test.fails(
    'a split loader sees the same `this` as an unsplit one, or the build reports it',
    async () => {
      expect(['no this', 'reported']).toContain(
        await loadWithLoader(readsThis, [['loader'], ['component']]),
      )
    },
    60_000,
  )
})

describe('server-only route options on the client', () => {
  /** Start's client configuration of the code splitter. */
  const deleteNodes = ['ssr', 'server', 'headers']
  const db = {
    db: { flag: () => true, all: () => [], headers: () => ({}) },
  }

  /**
   * Compiles a route for the client as Start does and reports whether any
   * emitted module imports `./db.server`, which server-only options the
   * route still has, and what it renders.
   */
  async function compileForClient(code: string) {
    const route = await loadRoute(code, {
      deleteNodes,
      stubs: {
        './db.server': db,
        './opts': { makeOpts: (options: unknown) => options },
      },
    })
    return {
      serverImports: Object.values(route.modules).filter((module) =>
        importSources(module).includes('./db.server'),
      ).length,
      serverOptions: deleteNodes.filter((key) => key in route.options),
      rendered: (await route.load('component'))(),
    }
  }

  const stripped = { serverImports: 0, serverOptions: [], rendered: '<p>x</p>' }

  // Control for the pins below: options written as `key: value` are removed
  // with their imports.
  test('server-only options written as properties are removed with their imports', async () => {
    expect(
      await compileForClient(`${head}import { db } from './db.server'
export const Route = createFileRoute('/')({
  ssr: () => db.flag(),
  server: { handlers: { GET: () => db.all() } },
  headers: () => db.headers(),
  component: () => <p>x</p>,
})`),
    ).toEqual(stripped)
  })

  // Bug: `deleteNodes` only removes route options written as `key: value`
  // (`ObjectProperty`); a method (`ssr() {}`, `async ssr() {}`,
  // `headers() {}`) is kept, with the imports it uses. Source: gap D11/S26
  // (docs `selective-ssr.md` promise `ssr` is stripped).
  // Impact: Start's client bundle ships the route's `ssr`/`headers` code and
  // its server-only imports.
  test.fails.each([
    'ssr() { return db.flag() }',
    'async ssr() { return db.flag() }',
    'headers() { return db.headers() }',
  ])(
    'a server-only option written as a method is removed with its imports (%s)',
    async (option) => {
      expect(
        await compileForClient(`${head}import { db } from './db.server'
export const Route = createFileRoute('/')({
  ${option},
  component: () => <p>x</p>,
})`),
      ).toEqual(stripped)
    },
  )

  // Bug: server-only options whose key is not written literally in the
  // route options (a spread, a computed key, options built by a call) are
  // kept, with their imports, and nothing reports it. Removing them is best
  // effort; refusing the route with an error naming the option is a valid
  // fix too. Source: gap D11.
  // Impact: Start's client bundle silently ships server handlers and their
  // server-only imports.
  test.fails.each([
    {
      name: 'a spread',
      code: `const serverOptions = { server: { handlers: { GET: () => db.all() } } }
export const Route = createFileRoute('/')({
  ...serverOptions,
  component: () => <p>x</p>,
})`,
    },
    {
      name: 'a computed key',
      code: `export const Route = createFileRoute('/')({
  ['server']: { handlers: { GET: () => db.all() } },
  component: () => <p>x</p>,
})`,
    },
    {
      name: 'a call',
      code: `import { makeOpts } from './opts'
export const Route = createFileRoute('/')(
  makeOpts({
    server: { handlers: { GET: () => db.all() } },
    component: () => <p>x</p>,
  }),
)`,
    },
  ])(
    'a server-only option given through $name is removed, or the route is refused',
    async ({ code }) => {
      let result
      try {
        result = await compileForClient(
          `${head}import { db } from './db.server'\n${code}`,
        )
      } catch (error) {
        expect(String(error)).toMatch(/\b(ssr|server|headers)\b/)
        return
      }
      expect(result).toEqual(stripped)
    },
  )

  /** A client build with Start's `deleteNodes`, reading a server secret. */
  async function secretPlacement(bundler: Bundler, option: string) {
    const app = await build({
      bundler,
      env: 'client',
      pluginOptions: { codeSplittingOptions: { deleteNodes } },
      files: routeApp(
        `${head}import { readSecret } from '../db.server'
export const Route = createFileRoute('/')({
  ${option},
  component: () => <p>page</p>,
})
`,
        {
          env: 'client',
          files: {
            'db.server.ts': `export function readSecret() {
  return (globalThis as any).MARK_SERVER_SECRET
}
`,
          },
        },
      ),
    })
    return app.where('MARK_SERVER_SECRET')
  }

  // Control for the build-level canary below.
  test.each(clientBundlers)(
    'a client build has no server code of an `ssr` property (%s)',
    async (bundler) => {
      expect(await secretPlacement(bundler, 'ssr: () => !!readSecret()')).toBe(
        'nowhere',
      )
    },
    60_000,
  )

  // Bug: build-level canary of the method pin above (same root cause).
  // Impact: the server code of an `ssr()` method reaches the client bundle.
  test.fails.each(clientBundlers)(
    'a client build has no server code of an `ssr()` method (%s)',
    async (bundler) => {
      expect(
        await secretPlacement(bundler, 'ssr() { return !!readSecret() }'),
      ).toBe('nowhere')
    },
    60_000,
  )
})

describe('symlinked route files', () => {
  /**
   * A client build with `deleteNodes: ['server']` of a route file reached
   * through `routes/index.tsx`, a symlink when `linked`; returns where the
   * server handler's code is, or `refused` when the build fails.
   */
  async function serverCodePlacement(bundler: Bundler, linked: boolean) {
    const route = `${head}import { readSecret } from '../db.server'
export const Route = createFileRoute('/')({
  server: { handlers: { GET: () => readSecret() } },
  component: () => <p>page</p>,
})
`
    const files = routeApp(route, {
      env: 'client',
      files: {
        'db.server.ts': `export function readSecret() {
  return (globalThis as any).MARK_SERVER_SECRET
}
`,
      },
    })
    if (linked) {
      delete files['routes/index.tsx']
      files['linked/index.tsx'] = route
    }
    try {
      const app = await build({
        bundler,
        env: 'client',
        pluginOptions: { codeSplittingOptions: { deleteNodes: ['server'] } },
        files,
        symlinks: linked ? { 'routes/index.tsx': 'linked/index.tsx' } : {},
      })
      return app.where('MARK_SERVER_SECRET')
    } catch (error) {
      if (error instanceof BuildError) {
        return 'refused'
      }
      throw error
    }
  }

  // Control for the pin below (same app, a regular route file).
  test.each(clientBundlers)(
    'a client build has no server handler code (%s)',
    async (bundler) => {
      expect(await serverCodePlacement(bundler, false)).toBe('nowhere')
    },
    60_000,
  )

  // Bug: the code splitter looks route files up by the path the generator
  // scanned (the symlink), but bundlers resolve modules to their real path,
  // so a symlinked route file is never compiled: nothing is split or
  // removed, silently. Failing the build is a valid fix too. Source: #8514.
  // Impact: with symlinked sources (Bazel, Nix, linked checkouts), Start's
  // client bundle ships `server.handlers` and their server-only imports.
  test.fails.each(clientBundlers)(
    'a client build of a symlinked route file has no server handler code (%s)',
    async (bundler) => {
      expect(['nowhere', 'refused']).toContain(
        await serverCodePlacement(bundler, true),
      )
    },
    60_000,
  )
})

describe('source maps', () => {
  /**
   * Source files named by the source maps of a client build's chunks that
   * hold the split component (`MARK_PAGE`) or a binding the route module
   * shares with it (`MARK_SHARED`).
   */
  async function splitChunkSources(bundler: Bundler) {
    const app = await build({
      bundler,
      env: 'client',
      minify: false,
      sourcemap: true,
      files: routeApp(
        `${head}const shared = { label: 'MARK_SHARED' }
function Page() {
  return <p>MARK_PAGE {shared.label}</p>
}
export const Route = createFileRoute('/')({
  loader: () => shared,
  component: Page,
})
`,
        { env: 'client' },
      ),
    })
    const chunks = app.chunks.filter(
      (chunk) =>
        chunk.code.includes('MARK_PAGE') || chunk.code.includes('MARK_SHARED'),
    )
    return [...new Set(chunks.flatMap((chunk) => chunk.map?.sources ?? []))]
  }

  /** Whether the sources name the route file, and none a virtual module. */
  function namesRouteFile(sources: Array<string>) {
    return {
      routeFile: sources.some((source) => source.includes('routes/index.tsx')),
      virtualModules: sources.filter((source) => /[?&]tsr-/.test(source)),
    }
  }

  // Control for the pin below: Rspack and webpack name modules by their
  // resource path.
  test.each(['rspack', 'webpack'] as const)(
    'split code maps to the route file (%s)',
    async (bundler) => {
      expect(namesRouteFile(await splitChunkSources(bundler))).toEqual({
        routeFile: true,
        virtualModules: [],
      })
    },
    60_000,
  )

  // Bug: the split chunk and shared modules are compiled with their module
  // id as the source file name, query included (`routes/index.tsx?tsr-split=
  // component`), and Vite keeps the source names of the maps plugins return.
  // Source: gap CC-S2 (plausible cause of #6667, #3828, #2991).
  // Impact: devtools and error trackers show split code under a separate
  // `index.tsx?tsr-split=…` file, so breakpoints set in the route file do
  // not hit in split code.
  test.fails(
    'split code maps to the route file (vite)',
    async () => {
      expect(namesRouteFile(await splitChunkSources('vite'))).toEqual({
        routeFile: true,
        virtualModules: [],
      })
    },
    60_000,
  )
})

describe('production builds', () => {
  /**
   * A production client build of a route whose exported component cannot
   * be split, with `NODE_ENV` as given (`null`: unset); returns where the
   * "will not be code-split" warning and the app's absolute path are.
   */
  async function warningPlacement(bundler: Bundler, nodeEnv?: null) {
    const app = await build({
      bundler,
      env: 'client',
      nodeEnv,
      files: routeApp(
        `${head}export function Page() {
  return <p>page</p>
}
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: () => <p>error</p>,
})
`,
        { env: 'client' },
      ),
    })
    return {
      warning: app.where('will not be code-split'),
      appPath: app.where(app.root),
    }
  }

  // Control for the pin below: with `NODE_ENV=production` exported.
  test.each(['rspack', 'webpack'] as const)(
    'a production client bundle has no development warning (%s)',
    async (bundler) => {
      expect(await warningPlacement(bundler)).toEqual({
        warning: 'nowhere',
        appPath: 'nowhere',
      })
    },
    60_000,
  )

  // Bug: the "will not be code-split" `console.warn` is injected into the
  // route module unless the build process's `NODE_ENV` is `production`,
  // instead of following the bundler's mode as the rest of the code
  // splitter does. webpack and Rspack set `NODE_ENV` only inside the bundle.
  // Source: gap CC-P2.
  // Impact: webpack/Rspack production bundles built from a shell without
  // `NODE_ENV` log a development warning in every user's console, with the
  // developer's absolute file path.
  test.fails.each(['rspack', 'webpack'] as const)(
    'a production client bundle has no development warning when NODE_ENV is unset (%s)',
    async (bundler) => {
      expect(await warningPlacement(bundler, null)).toEqual({
        warning: 'nowhere',
        appPath: 'nowhere',
      })
    },
    60_000,
  )
})
