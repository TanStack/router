/**
 * Known code-splitter bugs. Each test asserts correct behaviour for a bug on
 * main and is marked .fails; remove .fails when the bug is fixed.
 */
import { BuildError } from '@tanstack/compiler-test-utils/build-harness'
import { parseSync } from 'vite'
import { afterAll, describe, expect, onTestFinished, test, vi } from 'vitest'
import { build, routeApp } from './build-harness'
import {
  buildAndRun,
  compileRouteModules,
  declarationOf,
  evaluateModule,
  expectValidModules,
  exportedNames,
  head,
  importSources,
  loadRoute,
} from './regression-helpers'
import type {
  BuildResult,
  Bundler,
} from '@tanstack/compiler-test-utils/build-harness'
import type { CodeSplitGroupings } from '../src/core/constants'
import type { TargetFramework } from './regression-helpers'

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
      // Whether `Page` is still split is a build-level goal ("page code
      // the route file writes to at the top level loads with its chunk").
      expected: ['data', '<div>PageDisplay</div>'],
    },
  ])(
    'top-level writes to $name stay with the binding they write',
    async ({ setup, loader, component, expected, inits = 0 }) => {
      const state = stateStub()
      const route = await loadRoute(
        `${head}${setup}
export const Route = createFileRoute('/')({
  loader: () => ${loader},
  component: ${component},
})`,
        { stubs: { './state': state } },
      )
      expect([
        route.options.loader(),
        (await route.load('component'))(),
        state.calls,
      ]).toEqual([...expected, inits])
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
  // Splitting only the handler, or keeping the object in the route module,
  // are both valid fixes.
  // Impact: a route with an object-form loader cannot be built once the
  // loader is split.
  test.fails.each([
    { name: 'an arrow handler', loader: `{ handler: () => 'loaded' }` },
    { name: 'a method handler', loader: `{ handler() { return 'loaded' } }` },
    {
      name: 'a spread after the handler',
      loader: `{ handler: () => 'loaded', ...defaults }`,
      declarations: `const defaults = { staleReloadMode: 'blocking' }\n`,
    },
  ])(
    'a split loader in object form with $name loads route data',
    async ({ loader, declarations }) => {
      expect(await loadWithSplitLoader(loader, declarations)).toEqual([
        null,
        'loaded',
      ])
    },
    30_000,
  )

  /** The handler of a loader, in object form or not, split or not. */
  function loaderHandler(loader: any) {
    return typeof loader === 'function' ? loader : loader.handler
  }

  // Bug: same root cause as the object-form pins above. The router reads the
  // keys of a loader object other than `handler` (`staleReloadMode`) from the
  // route options, so they must keep working next to a split handler, and
  // module state the handler, those keys and the split component read must
  // be created once.
  // Impact: the route cannot be built once the loader is split.
  test.fails.each([
    {
      name: 'what the handler and the split component each read',
      code: `import { createStore, createTheme } from './store'
const store = createStore()
const theme = createTheme()
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component']],
  loader: { handler: () => store.get(), staleReloadMode: 'blocking' },
  component: () => <div>{theme.color}</div>,
})`,
      expected: {
        loaded: 'stored',
        staleReloadMode: 'blocking',
        rendered: '<div>red</div>',
        created: { store: 1, theme: 1, config: 0 },
      },
    },
    {
      name: 'what another key of the loader object and the split component read',
      code: `import { createConfig } from './store'
const config = createConfig()
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component']],
  loader: { handler: () => 1, staleReloadMode: config.mode },
  component: () => <div>{config.mode}</div>,
})`,
      expected: {
        loaded: 1,
        staleReloadMode: 'background',
        rendered: '<div>background</div>',
        created: { store: 0, theme: 0, config: 1 },
      },
    },
  ])(
    'a split loader in object form keeps $name working, created once',
    async ({ code, expected }) => {
      const created = { store: 0, theme: 0, config: 0 }
      const route = await loadRoute(`${head}${code}\n`, {
        stubs: {
          './store': {
            createStore: () => {
              created.store++
              return { get: () => 'stored' }
            },
            createTheme: () => {
              created.theme++
              return { color: 'red' }
            },
            createConfig: () => {
              created.config++
              return { mode: 'background' }
            },
          },
        },
      })
      expect({
        loaded: await loaderHandler(route.options.loader)(),
        staleReloadMode: route.options.loader.staleReloadMode,
        rendered: (await route.load('component'))(),
        created,
      }).toEqual(expected)
    },
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

describe('what split chunks hold', () => {
  // Bug: a split chunk keeps every exported `function`, `class` and
  // `export default function` declaration of the route file, with the
  // imports they use, whether its option reads them or not
  // (`compilers.ts`, the virtual compiler keeps exported declarations).
  // Bundlers cannot drop them: the chunk is imported with `import()` and read
  // through a computed key. Source: decision D5.
  // Impact: every split chunk of the route downloads and evaluates the route
  // file's exported helpers and their dependencies again.
  test.fails(
    'a split chunk holds only what its option needs, not the other exports of the route file',
    async () => {
      const route = await loadRoute(
        `${head}import { heavy } from './heavy'
export function helper() { return heavy() }
export class Api { call() { return heavy() } }
export default function Def() { return heavy() }
function Page() { return <div>page</div> }
export const Route = createFileRoute('/')({ component: Page })
`,
        { stubs: { './heavy': { heavy: () => 'heavy' } } },
      )
      expect((await route.load('component'))()).toBe('<div>page</div>')
      const chunks = [...route.graph.importKinds]
        .filter(([, kind]) => kind === 'dynamic')
        .map(([id]) => route.graph.modules.get(id)!)
      expect(chunks).toHaveLength(1)
      expect(
        chunks.map((chunk) => ({
          exports: exportedNames(chunk),
          declares: ['helper', 'Api', 'Def'].filter((name) =>
            declarationOf(name).test(chunk),
          ),
          importsHeavy: importSources(chunk).includes('./heavy'),
        })),
      ).toEqual([{ exports: ['component'], declares: [], importsHeavy: false }])
    },
  )

  // Control for the array destructuring pins below: a component declared by
  // an object destructuring of a literal is split and renders.
  test('a component declared by an object destructuring renders', async () => {
    const route =
      await loadRoute(`${head}const { Page } = { Page: () => <div>page</div> }
export const Route = createFileRoute('/')({ component: Page })
`)
    expect((await route.load('component'))()).toBe('<div>page</div>')
  })

  // Bug: a split option that names a binding declared by an array
  // destructuring cannot be split: the virtual compiler throws
  // "Unexpected splitNode type ☝️: VariableDeclarator".
  // Impact: a route whose component comes from an array destructuring
  // cannot be built once code splitting is on.
  test.fails.each([
    {
      name: 'of a literal array',
      code: `const [Page] = [() => <div>page</div>]
export const Route = createFileRoute('/')({ component: Page })`,
    },
    {
      name: 'of a literal array shared with the loader',
      code: `const [Page, main] = [() => <div>page</div>, 'main']
export const Route = createFileRoute('/')({
  loader: () => main,
  component: Page,
})`,
      loaded: 'main',
    },
    {
      name: 'of a call shared with the errorComponent',
      code: `import { createPair } from './factory'
const [Page, ErrorView] = createPair()
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: ErrorView,
})`,
    },
  ])(
    'a component declared by an array destructuring $name renders',
    async ({ code, loaded }: { code: string; loaded?: string }) => {
      const route = await loadRoute(`${head}${code}\n`, {
        stubs: {
          './factory': {
            createPair: () => [() => '<div>page</div>', () => 'error'],
          },
        },
      })
      expect([
        ...(loaded ? [route.options.loader()] : []),
        (await route.load('component'))(),
      ]).toEqual([...(loaded ? [loaded] : []), '<div>page</div>'])
    },
  )

  // Bug: once the pins above are fixed, these split options must also end
  // up split, or the build must say why (decision D11). A literal array can
  // be split per element, so leaving the component in the entry is our
  // limitation: the goal is a split component. Splitting the result of a
  // call would change when the call runs, so the user has to change the
  // pattern: a warning naming the file and the option is acceptable too.
  // Today the build fails first (same root cause as the pins above).
  // Impact: the component loads with the entry chunk.
  test.fails.each([
    {
      name: 'a literal array shared with the loader',
      code: `const [Page, main] = [() => <div>{'MARK_PAGE'}</div>, 'main']
export const Route = createFileRoute('/')({
  loader: () => main,
  component: Page,
})`,
      reportable: false,
    },
    {
      name: 'a call shared with the errorComponent',
      code: `const createPair = () => [() => <div>{'MARK_PAGE'}</div>, () => <p>error</p>]
const [Page, ErrorView] = createPair()
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: ErrorView,
})`,
      reportable: true,
    },
  ])(
    'a component declared by an array destructuring of $name is split or reported',
    async ({ code, reportable }) => {
      const app = await build({
        bundler: 'vite',
        env: 'client',
        files: routeApp(`${head}${code}\n`, { env: 'client' }),
      })
      const reported = [...app.warnings, ...app.consoleMessages].some(
        (message) =>
          message.includes('routes/index.tsx') &&
          /\b(?:component|Page)\b/.test(message),
      )
      expect({
        lazy: app.where('MARK_PAGE') === 'lazy',
        reported: reportable && reported,
      }).not.toEqual({ lazy: false, reported: false })
    },
    60_000,
  )
})

describe('names the code splitter generates', () => {
  /**
   * Loads a route file that declares `declaration` (or reads `name` as a
   * global) and whose split loader and components return `name`'s value,
   * compiled for HMR; returns what the options return.
   */
  async function readName(name: string, declaration?: string) {
    if (declaration === undefined) {
      vi.stubGlobal(name, 'value')
      onTestFinished(() => {
        vi.unstubAllGlobals()
      })
    }
    const read = declaration?.startsWith('function') ? `${name}()` : name
    const route = await loadRoute(
      `${head}${declaration ?? ''}
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component'], ['errorComponent']],
  loader: () => String(${read}),
  component: () => <p>{String(${read})}</p>,
  errorComponent: () => <p>{String(${read})}</p>,
})
`,
      { hmr: true },
    )
    return [
      await (await route.load('loader'))(),
      (await route.load('component'))(),
      (await route.load('errorComponent'))(),
    ]
  }
  const expected = ['value', '<p>value</p>', '<p>value</p>']

  // Control for the pin below.
  test.each([
    { name: 'TSRComponent', declaration: `const TSRComponent = 'value'` },
    { name: 'window' },
  ])(
    'a route file binding or global named $name keeps its value',
    async ({ name, declaration }) => {
      expect(await readName(name, declaration)).toEqual(expected)
    },
  )

  // Bug: the code splitter declares and imports fixed names in the modules it
  // emits (`SplitComponent`, `SplitLoader`, `$$splitComponentImporter`,
  // `$$splitLoaderImporter`, `lazyRouteComponent`, `lazyFn`) without checking
  // that the route file does not use them. Source: gap S38.
  // Impact: a route file with such a binding cannot be built ("Duplicate
  // declaration") or its options read the generated value instead of the
  // user's.
  test.fails.each([
    { name: 'SplitComponent', declaration: `const SplitComponent = 'value'` },
    { name: 'SplitLoader', declaration: `const SplitLoader = 'value'` },
    {
      name: '$$splitComponentImporter',
      declaration: `const $$splitComponentImporter = 'value'`,
    },
    {
      name: '$$splitLoaderImporter',
      declaration: `const $$splitLoaderImporter = 'value'`,
    },
    {
      name: 'lazyRouteComponent',
      declaration: `function lazyRouteComponent() { return 'value' }`,
    },
    { name: 'lazyFn', declaration: `const lazyFn = 'value'` },
  ])(
    'a route file binding named $name keeps its value',
    async ({ name, declaration }) => {
      expect(await readName(name, declaration)).toEqual(expected)
    },
  )
})

describe('code-split groupings', () => {
  // Bug: the groupings are read from the first `createRoute` or
  // `createFileRoute` call of the file that has `codeSplitGroupings`
  // (`detectCodeSplitGroupingsFromRoute`), so a code-based route's groupings
  // apply to the file route of the same module.
  // Impact: the file route is split differently than configured (here its
  // loader is split although the default groupings keep it).
  test.fails.each(['before', 'after'])(
    'a file route keeps its own groupings next to a code route with groupings declared %s it',
    async (order) => {
      const codeRoute = `export const legacy = createRoute({
  getParentRoute: () => null as any,
  path: '/legacy',
  codeSplitGroupings: [['loader', 'component']],
  component: () => <p>legacy</p>,
})`
      const fileRoute = `export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>file</p>,
})`
      const route = await loadRoute(
        `import { createFileRoute, createRoute } from '@tanstack/react-router'
${order === 'before' ? `${codeRoute}\n${fileRoute}` : `${fileRoute}\n${codeRoute}`}
`,
      )
      expect([route.isLazy('loader'), route.isLazy('component')]).toEqual([
        false,
        true,
      ])
    },
  )

  // Bug: `codeSplitGroupings` must be written inline; a module-level
  // constant holding the groupings is refused ("You must provide an array
  // of arrays for the codeSplitGroupings").
  // Impact: groupings shared between route files through a constant cannot
  // be used.
  test.fails(
    'groupings declared in a module-level constant are honoured',
    async () => {
      const route =
        await loadRoute(`${head}const groupings = [['loader'], ['component']]
export const Route = createFileRoute('/')({
  codeSplitGroupings: groupings,
  loader: () => 'data',
  component: () => <p>page</p>,
})
`)
      const evaluated = [route.evaluated.length]
      expect(await (await route.load('loader'))()).toBe('data')
      evaluated.push(route.evaluated.length)
      expect((await route.load('component'))()).toBe('<p>page</p>')
      evaluated.push(route.evaluated.length)
      // The loader and the component each load their own module.
      expect(evaluated).toEqual([
        evaluated[0],
        evaluated[0]! + 1,
        evaluated[0]! + 2,
      ])
    },
  )
})

describe('module state read by route options written as methods', () => {
  // Bug: shared bindings are computed from route options written as
  // `key: value` only, so a binding that an option written as a method or
  // accessor (kept in the route module) and a split option both read is not
  // shared: the split chunk declares its own copy.
  // Impact: the split component reads another instance of the module state
  // than the route's other options.
  test.fails.each([
    { name: 'a method', option: `loader() {\n    return ++state.count\n  },` },
    {
      name: 'a getter',
      option: `get loader() {\n    return () => ++state.count\n  },`,
    },
  ])(
    'module state $name option shares with a split option is created once',
    async ({ option }) => {
      const route = await loadRoute(`${head}const state = { count: 0 }
export const Route = createFileRoute('/')({
  ${option}
  component: () => <div>{state.count}</div>,
})
`)
      expect([
        route.options.loader(),
        (await route.load('component'))(),
      ]).toEqual([1, '<div>1</div>'])
    },
  )
})

describe('module state next to bindings that read Route', () => {
  // Bug: bindings that depend on `Route` are never shared
  // (`removeBindingsDependingOnRoute`), and a destructuring is never split
  // across modules, so a `Map` declared next to a binding that reads `Route`
  // is created by the route module and again by the chunk that reads it.
  // Source: gap S19.
  // Impact: the loader and the component use two different caches.
  test.fails(
    'a destructuring whose sibling reads Route keeps one cache for the loader and the component',
    async () => {
      const route = await loadRoute(`${head}const getRoute = () => Route
const [cache, routeGetter] = [new Map(), getRoute]
export const Route = createFileRoute('/')({
  loader: () => {
    cache.set('k', 1)
    return cache.size
  },
  component: () => <div>{cache.size}{typeof routeGetter}</div>,
})
`)
      expect([
        route.options.loader(),
        (await route.load('component'))(),
      ]).toEqual([1, '<div>1function</div>'])
    },
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
  test.fails.each([
    {
      name: 'an exported function',
      declaration: `export function Page() {
  return <p>page</p>
}`,
      binding: 'Page',
    },
    {
      name: 'a default-exported function',
      declaration: `export default function Page() {
  return <p>page</p>
}`,
      binding: 'Page',
    },
    {
      name: 'a function exported as default by name',
      declaration: `function Page() {
  return <p>page</p>
}
export default Page`,
      binding: 'Page',
    },
    {
      name: 'an exported destructuring of a call',
      declaration: `const createBits = () => ({
  component: () => <p>page</p>,
  loader: () => ({ message: 'hello' }),
})
export const { component: Page, loader } = createBits()`,
      binding: 'Page',
      options: 'loader, ',
    },
  ])(
    'an exported component ($name) that is the only split candidate is split or reported as not code-split',
    async ({ declaration, binding, options = '' }) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const route = await loadRoute(`${head}${declaration}
export const Route = createFileRoute('/')({ ${options}component: ${binding} })
`)
        const file = route.ids.reference!
        expect((await route.load('component'))()).toBe('<p>page</p>')
        expect({
          split: route.isLazy('component'),
          warned: warn.mock.calls.some(([message]) => {
            const text = String(message)
            return (
              text.includes(file) &&
              new RegExp(String.raw`\b(?:${binding}|component)\b`).test(text)
            )
          }),
        }).not.toEqual({ split: false, warned: false })
      } finally {
        warn.mockRestore()
      }
    },
  )

  // Bug: the entry's `useTitle` and the one the split component calls are
  // two functions: a binding that reads `Route` is never shared
  // (`removeBindingsDependingOnRoute`), so the chunk declares a copy of the
  // exported function. Source: gap S19.
  // Impact: code that relies on the identity of an exported hook or helper
  // (memoisation, registries, `===` checks) sees two of them.
  test.fails(
    'an exported function that reads Route is the one the split component calls',
    async () => {
      const route = await loadRoute(`${head}export function useTitle() {
  return Route.options.title
}
function Page() {
  ;(globalThis as any).__calledUseTitle = useTitle
  return <p>{useTitle()}</p>
}
export const Route = createFileRoute('/')({ title: 'title', component: Page })
`)
      try {
        expect((await route.load('component'))()).toBe('<p>title</p>')
        expect((globalThis as any).__calledUseTitle).toBe(
          route.exports.useTitle,
        )
      } finally {
        delete (globalThis as any).__calledUseTitle
      }
    },
  )
})

/**
 * Where a route's code ends up in a client build, which the bundler decides
 * from what the code splitter emits, with or without side-effect hints. One
 * app per bundler and hint holds a route file per case, each marking its
 * page code with a marker; its entry imports the generated route tree, which
 * imports only `Route` from each route file, like an app.
 */
describe('page code in client builds', () => {
  type Case = {
    name: string
    /** Route file name in `routes/`; its path is `/<file>`. */
    file: string
    /** The route file after the `createFileRoute` import, with `$PATH`. */
    route: string
    marker: string
  }

  const page = (file: string, body: string): Case['route'] =>
    `${head}${body}`.replaceAll('$PATH', `/${file}`)

  const marker = (file: string) => `MARK_${file.replaceAll('-', '_')}_END`

  const routeCase = (name: string, file: string, body: string): Case => ({
    name,
    file,
    route: page(file, body.replaceAll('$MARK', marker(file))),
    marker: marker(file),
  })

  const component = `export const Route = createFileRoute('$PATH')({ component: Page })`

  // Page code that loads with its chunk: code the route file does not
  // export, and exported functions and classes (today the chunk declares its
  // own copy, whose identity and state are pinned in "module state shared
  // with split chunks" and "exported bindings", and the bundler drops the
  // unused export of the route module). A fix must keep them out of the
  // entry chunk.
  const controls: Array<Case> = [
    routeCase(
      'a const only a split component renders',
      'local-const',
      `const Card = () => <b>{'$MARK'}</b>
function Page() {
  return <Card />
}
${component}`,
    ),
    routeCase(
      'an exported function component',
      'exported-function',
      `export function Card() {
  return <b>{'$MARK'}</b>
}
function Page() {
  return <Card />
}
${component}`,
    ),
    routeCase(
      'a function component exported by specifier',
      'exported-specifier',
      `function Card() {
  return <b>{'$MARK'}</b>
}
export { Card }
function Page() {
  return <Card />
}
${component}`,
    ),
    routeCase(
      'a default-exported function component',
      'exported-default',
      `export default function Card() {
  return <b>{'$MARK'}</b>
}
function Page() {
  return <Card />
}
${component}`,
    ),
    routeCase(
      'an exported helper function',
      'exported-helper',
      `export function format(value: number) {
  return '$MARK' + value
}
function Page() {
  return <p>{format(1)}</p>
}
${component}`,
    ),
    routeCase(
      'an exported class',
      'exported-class',
      `export class Store {
  value = '$MARK'
}
function Page() {
  return <p>{new Store().value}</p>
}
${component}`,
    ),
    routeCase(
      'an exported function over module state',
      'exported-state',
      `let count = 0
export function next() {
  count++
  return '$MARK' + count
}
function Page() {
  return <p>{next()}</p>
}
${component}`,
    ),
    // Whether it renders is pinned at the compiler level ("top-level writes
    // to the split component (property assignment) stay with the binding
    // they write"); a fix must keep the component in its chunk.
    routeCase(
      'a component the route file writes a property of',
      'display-name',
      `function Page() {
  return <div>{'$MARK'}{Page.displayName}</div>
}
Page.displayName = 'PageDisplay'
${component}`,
    ),
  ]

  // Bug: page code the route file exports as a variable, and an exported
  // split component, stay in the route module, which the entry chunk loads,
  // with everything they import: a split chunk imports exported variables
  // from the route module instead of owning them, and an exported component
  // is not split (the code splitter warns). Bundlers can only move the code
  // out with the export unused, which the generated route tree (importing
  // `Route` only) allows; whether our compiler or the bundler's
  // tree-shaking does it is free, with or without `"sideEffects": false` or
  // a `/* @__PURE__ */` initialiser.
  // Sources: gaps S14, Z4, H1, H2; #8504's exported-bindings chunks tests.
  // Impact: page code exported for tests or reuse loads with the entry chunk.
  const exported: Array<Case> = [
    routeCase(
      'an exported const component only the split component renders',
      'exported-const',
      `export const Card = () => <b>{'$MARK'}</b>
function Page() {
  return <Card />
}
${component}`,
    ),
    routeCase(
      'an exported const with a pure initialiser',
      'exported-pure',
      `function makeLabel(value: string) {
  return { text: value }
}
export const label = /* @__PURE__ */ makeLabel('$MARK')
function Page() {
  return <p>{label.text}</p>
}
${component}`,
    ),
    routeCase(
      'an exported function used as the component',
      'exported-component',
      `export function Page() {
  return <p>{'$MARK'}</p>
}
${component}`,
    ),
    routeCase(
      'a default-exported function used as the component',
      'exported-default-component',
      `export default function Page() {
  return <p>{'$MARK'}</p>
}
${component}`,
    ),
  ]

  // Goals for split options the code splitter leaves in the route module.
  const unsplit: Array<Case> = [
    // Bug: a route option written as a method (`component() {}`) is not
    // split (only property values are). Source: gap S11, ruling on method
    // shorthand.
    // Impact: the component loads with the entry chunk.
    routeCase(
      'a component written as a method',
      'method-component',
      `export const Route = createFileRoute('$PATH')({
  component() {
    return <p>{'$MARK'}</p>
  },
})`,
    ),
  ]

  // Bug: the root route's options are never split
  // (`computeSharedBindings` and the reference compiler skip
  // `createRootRoute`), so its errorComponent and notFoundComponent, which
  // only render on errors, load with the entry chunk. Its `component`
  // renders on every page and may stay. Source: gap S20, decision D12.
  const rootRoute = `import { createRootRoute, Outlet } from '@tanstack/react-router'
export const Route = createRootRoute({
  component: () => <Outlet />,
  errorComponent: () => <p>{'MARK_root_error_END'}</p>,
  notFoundComponent: () => <p>{'MARK_root_not_found_END'}</p>,
})
`
  const rootMarkers = {
    errorComponent: 'MARK_root_error_END',
    notFoundComponent: 'MARK_root_not_found_END',
  }

  // Bug: route options destructured from a call result
  // (`const { component, loader } = createBits()`) are neither split nor
  // reported: the destructuring moves to a module the route module imports
  // statically, so the component's code loads with the entry, silently.
  // Splitting them would change when the call runs, so the user has to
  // change the pattern: a warning naming the file and the option is the
  // expected outcome (decision D11).
  const destructured = routeCase(
    'route options destructured from a call result',
    'destructured-options',
    `function DefaultComponent() {
  return <div>Default</div>
}
const createBits = () => ({ component: ActualComponent, loader: () => 'data' })
const { component: MyComponent = DefaultComponent, loader } = createBits()
function ActualComponent() {
  return <div>{'$MARK'}</div>
}
export const Route = createFileRoute('$PATH')({ component: MyComponent, loader })`,
  )

  // Bug: a split chunk keeps the route file's exported declarations that
  // its option does not read (decision D5; compiler-level pin in "what
  // split chunks hold"), and bundlers keep them.
  const unreadExport = routeCase(
    'an exported helper the split option does not read',
    'unread-export',
    `export function helper() {
  return '$MARK'
}
function Page() {
  return <p>page</p>
}
${component}`,
  )

  const cases = [
    ...controls,
    ...exported,
    ...unsplit,
    destructured,
    unreadExport,
  ]
  const files = {
    'routes/__root.tsx': rootRoute,
    ...Object.fromEntries(
      cases.map((row) => [`routes/${row.file}.tsx`, row.route]),
    ),
    'entry.ts': `import { routeTree } from './routeTree.gen'
export { routeTree }
`,
  }

  describe.each(clientBundlers)('%s', (bundler) => {
    describe.each([
      { hint: 'without a sideEffects field', sideEffects: undefined },
      { hint: 'with "sideEffects": false', sideEffects: false },
    ])('$hint', ({ sideEffects }) => {
      let built: Promise<BuildResult> | undefined
      const app = () =>
        (built ??= build({
          bundler,
          env: 'client',
          sideEffects,
          files,
          registerCleanup: () => {},
        }))
      afterAll(async () => {
        await (await built)?.dispose()
      })
      const timeout = 120_000

      test.each(controls)(
        '$name loads with its chunk',
        async ({ marker: mark }) => {
          expect((await app()).where(mark)).toBe('lazy')
        },
        timeout,
      )

      test.fails.each([...exported, ...unsplit])(
        '$name loads with its chunk',
        async ({ marker: mark }) => {
          expect((await app()).where(mark)).toBe('lazy')
        },
        timeout,
      )

      test.fails.each(['errorComponent', 'notFoundComponent'] as const)(
        "a root route's %s loads lazily",
        async (option) => {
          expect((await app()).where(rootMarkers[option])).toBe('lazy')
        },
        timeout,
      )

      test.fails(
        `${destructured.name} load with their chunk or are reported`,
        async () => {
          const built = await app()
          const reported = [...built.warnings, ...built.consoleMessages].some(
            (message) =>
              message.includes(`routes/${destructured.file}.tsx`) &&
              /\b(?:component|MyComponent)\b/.test(message),
          )
          expect({
            lazy: built.where(destructured.marker) === 'lazy',
            reported,
          }).not.toEqual({ lazy: false, reported: false })
        },
        timeout,
      )

      test.fails(
        `${unreadExport.name} is not in its chunk`,
        async () => {
          expect((await app()).locate(unreadExport.marker).lazy).toEqual([])
        },
        timeout,
      )
    })
  })
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
  async function compileForClient(
    code: string,
    targetFramework: TargetFramework = 'react',
  ) {
    const route = await loadRoute(code, {
      deleteNodes,
      targetFramework,
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

  const serverOptions = `  ssr: () => db.flag(),
  server: { handlers: { GET: () => db.all() } },
  headers: () => db.headers(),
  component: () => <p>x</p>,`

  // Control for the pins below: options written as `key: value` are removed
  // with their imports, on file routes and root routes, for every framework.
  test.each([
    {
      name: 'a file route',
      code: `${head}import { db } from './db.server'
export const Route = createFileRoute('/')({
${serverOptions}
})`,
    },
    {
      name: 'a Solid file route',
      code: `import { createFileRoute } from '@tanstack/solid-router'
import { db } from './db.server'
export const Route = createFileRoute('/')({
${serverOptions}
})`,
      targetFramework: 'solid' as const,
    },
    {
      name: 'a root route',
      code: `import { createRootRoute } from '@tanstack/react-router'
import { db } from './db.server'
export const Route = createRootRoute({
${serverOptions}
})`,
    },
    {
      name: 'a root route with context',
      code: `import { createRootRouteWithContext } from '@tanstack/react-router'
import { db } from './db.server'
export const Route = createRootRouteWithContext<{ user: string }>()({
${serverOptions}
})`,
    },
  ])(
    'server-only options of $name written as properties are removed with their imports',
    async ({ code, targetFramework }) => {
      expect(await compileForClient(code, targetFramework)).toEqual(stripped)
    },
  )

  // Without `deleteNodes` (a Router app without Start), the options are the
  // route's own and stay.
  test('server-only options stay without deleteNodes', async () => {
    const route = await loadRoute(
      `${head}import { db } from './db.server'
export const Route = createFileRoute('/')({
${serverOptions}
})`,
      { stubs: { './db.server': db } },
    )
    expect(deleteNodes.filter((key) => key in route.options)).toEqual(
      deleteNodes,
    )
    expect(route.options.ssr()).toBe(true)
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
