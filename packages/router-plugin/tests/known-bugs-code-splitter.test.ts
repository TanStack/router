/**
 * Known code-splitter bugs. Each test asserts correct behaviour for a bug on
 * main and is marked .fails; remove .fails when the bug is fixed.
 */

import { parseSync } from 'vite'
import { describe, expect, onTestFinished, test, vi } from 'vitest'
import {
  captureConsole,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { routerDevServer } from './dev-server'
import {
  compileRouteModules,
  declaredNames,
  evaluateModule,
  expectValidModules,
  head,
  importRequests,
  importSources,
  importedNames,
  loadRoute,
  parseModule,
  renderComponent,
  routeSpecifier,
  transformWithRouteHmrPlugin,
} from './regression-helpers'
import type { TargetFramework } from './regression-helpers'

/**
 * Whether a `console.warn` spy saw a warning naming the route file `file`
 * and the route option `option` (default `component`) the compiler leaves
 * unsplit: the user is told which option of which file is not code-split
 * (J2.8; naming the binding too is fine, the wording is free).
 */
function reportsNotSplit(
  warn: { mock: { calls: Array<Array<unknown>> } },
  file: string,
  option = 'component',
) {
  return (
    findDiagnostics(
      warn.mock.calls.map((args) => args.map(String).join(' ')),
      { file, names: [option] },
    ).length > 0
  )
}

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
    // (When the shared initializer runs, with the route module or with the
    // first chunk that needs it, is free: SPEC G3.)
    expect([
      route.options.loader(),
      await route.render('component'),
      await route.render('errorComponent'),
      state.calls,
    ]).toEqual([1, '<p>1</p>', '<p>error</p>', 1])
  })

  // Bug: a binding that an option with a computed key and a split option
  // both read is created twice: the computed-key option is not seen as a
  // reader of the route module.
  // Source: round-3 mutation testing (compilers-A).
  // Impact: module state is created twice (two stores, registrations run
  // twice).
  test.fails(
    'a binding read by a computed-key option and a split option is created once',
    async () => {
      const state = stateStub()
      const route = await loadRoute(
        `${head}import { init } from './state'
const store = init({ count: 1 })
const key = 'staticData'
export const Route = createFileRoute('/')({
  [key]: { read: () => store },
  loader: () => 'data',
  component: () => <p>{store.count}</p>,
})
`,
        { stubs: { './state': state } },
      )
      expect([await route.render('component'), state.calls]).toEqual([
        '<p>1</p>',
        1,
      ])
    },
  )

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
      name: 'an enum',
      declaration: `enum Value { One = init(1) }
const read = () => Value.One`,
    },
    {
      name: 'a namespace',
      declaration: `namespace Value { export const one = init(1) }
const read = () => Value.one`,
    },
    // Source: the #8504 confidence campaign (mutation testing MHR2/MHR3: a
    // direct read takes another path than a read through a helper).
    {
      name: 'an enum, read directly',
      declaration: `enum Value { One = init(1) }`,
      read: 'Value.One',
    },
    {
      name: 'a namespace, read directly',
      declaration: `namespace Value { export const one = init(1) }`,
      read: 'Value.one',
    },
    {
      // Source: #8504 (a namespace merged across two declarations). The
      // second block reads `Value.one`: TypeScript transforms (Oxc, Babel)
      // do not resolve a bare `one` across merged blocks.
      name: 'a namespace declared in two blocks',
      declaration: `namespace Value { export const one = init(1) }
namespace Value { export const two = Value.one }`,
      read: 'Value.two',
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
        await route.render('component'),
        state.calls,
      ]).toEqual([1, '<p>1</p>', 1])
    },
  )

  // Bug: a top-level statement that writes a binding stays in the reference
  // module when the binding moves to the shared module or a split chunk.
  // Impact: the write throws (an import is read-only, or the moved binding is
  // not declared there) or runs after the shared declarations that it should
  // precede.
  test.fails.each<{
    name: string
    filename?: string
    setup: string
    loader: string
    component: string
    expected: Array<unknown>
    inits?: number
  }>([
    {
      name: 'a function (reassignment)',
      // Source: React Compiler fixture module-scoped-bindings.js
      // JavaScript: TypeScript refuses an assignment to a function (TS2630).
      filename: 'route.jsx',
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
    {
      // Source: React Router route-chunks-test.ts "reassignment with
      // nullish coalescing" and "destructured reassignment"
      name: 'lets only the split component reads (reassignments)',
      setup: `let plain = 'initial'
plain = 'assigned'
let compound = 1
compound += 1
let logical = ''
logical ||= 'logical'
let handler: (() => string) | undefined
handler ??= () => 'handler'
let swapped = () => 'original'
;[swapped] = [() => 'swapped']`,
      loader: `'data'`,
      component:
        "() => <p>{[plain, compound, logical, handler!(), swapped()].join(' ')}</p>",
      expected: ['data', '<p>assigned 2 logical handler swapped</p>'],
    },
    {
      // Source: Turbopack tree-shaker analyzer/assign-before-decl-var
      name: 'a var assigned before its declaration',
      setup: `value = 'assigned'
var value: string`,
      loader: `'data'`,
      component: '() => <p>{value}</p>',
      expected: ['data', '<p>assigned</p>'],
    },
    {
      // Source: Turbopack tree-shaker analyzer/assign-before-decl-fn
      // JavaScript: TypeScript refuses an assignment to a function (TS2630).
      name: 'a function declaration assigned before its declaration',
      filename: 'route.jsx',
      setup: `value = () => 'reassigned'
function value() {
  return 'declared'
}`,
      loader: `'data'`,
      component: '() => <p>{value()}</p>',
      expected: ['data', '<p>reassigned</p>'],
    },
  ])(
    'top-level writes to $name stay with the binding they write',
    async ({ filename, setup, loader, component, expected, inits = 0 }) => {
      const state = stateStub()
      const route = await loadRoute(
        `${head}${setup}
export const Route = createFileRoute('/')({
  loader: () => ${loader},
  component: ${component},
})`,
        { filename, stubs: { './state': state } },
      )
      expect([
        route.options.loader(),
        await route.render('component'),
        state.calls,
      ]).toEqual([...expected, inits])
    },
  )

  // Bug: shared bindings are computed from the statically named route options
  // only (`computeSharedBindings` skips computed keys), so a declaration that
  // one split chunk reads and that the reference module keeps as well (for an
  // export, a top-level call, another binding of the declaration, or a route
  // option under a computed key, pinned above) is not shared: the chunk
  // declares its own copy.
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
    // Rows from #8504, where they pass (except the private call result row
    // below). A type that reads a value is no read at runtime (TypeScript
    // erases it), but the reference module keeps the declaration for it.
    {
      name: 'a type alias that reads it',
      // Source: corpus-diff, route files that derive a type with
      // `type FormValues = z.infer<typeof schema>`
      declaration: `const value = init(1)
type Value = typeof value`,
      render: '{value satisfies Value}',
      html: '<p>1</p>',
    },
    {
      // A second initialization in the chunk is another instance than the
      // one other modules import. Importing `cache` from the route module is
      // not enough: a chunk that declares the private `initial` again runs
      // `init` twice. Source: #8504 (code-splitter-imports-exports.test.ts,
      // which checks `cache` only).
      name: 'an export built from a private call result the chunk reads too',
      declaration: `const initial = init([['a', 1]])
export const cache = new Map(initial)`,
      render: "{cache.size === initial.length ? 'fresh' : 'changed'}",
      html: '<p>fresh</p>',
    },
    {
      name: 'an export alias',
      // Source: Next.js
      // ssg/getStaticProps/should-support-export-named-as-default-with-other-specifiers
      declaration: `const store = init({ count: 1 })
export { store as appStore }`,
      render: '{store.count}',
      html: '<p>1</p>',
    },
    {
      name: 'a default export',
      declaration: `const store = init({ count: 1 })
export default store`,
      render: '{store.count}',
      html: '<p>1</p>',
    },
    {
      // The shared-binding analysis does not count a JSX member tag
      // (`<ui.Box />`) as a read, so only the loader reads `ui` for it and
      // the chunk declares its own copy.
      name: 'the loader, when the component renders it as a JSX member tag',
      // Source: Next.js ssg/getStaticProps/should-not-remove-import-used-in-render
      declaration: `const ui = init({ Box: () => <b>box</b> })`,
      options: `  loader: () => typeof ui.Box,\n`,
      render: '<ui.Box />',
      html: '<p><b>box</b></p>',
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
      expect([await route.render('component'), state.calls]).toEqual([html, 1])
    },
  )

  /**
   * Loads a route with a component and an errorComponent next to the
   * top-level `effect`, which calls `track` or `subscribe` (`./effects`),
   * loads both chunks and asserts that the effect ran once, with the route
   * module.
   */
  async function expectEffectRunsOnce(effect: string) {
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
    const rendered = [
      await route.render('component'),
      await route.render('errorComponent'),
    ]
    // Both chunks loaded, and the effect ran once, with the route module.
    expect([rendered, callsBeforeChunks, calls]).toEqual([
      ['<p>index</p>', '<p>error</p>'],
      1,
      1,
    ])
  }

  // Bug: split chunks keep the top-level statements that nothing references,
  // except expression statements that read only imports: dead-code
  // elimination only removes what the split made unreferenced, and
  // `stripUnreferencedTopLevelExpressionStatements` only strips expression
  // statements that name no module-level binding. So an `if` block, a
  // declaration whose binding is never read, an `export * from`, or a call
  // that reads a module-level binding (`register(...parts)`) is copied into
  // every split chunk.
  // A reference cycle that nothing else reads keeps its own references, so a
  // fix that drops only declarations nothing references still copies it.
  // Source: router-utils/src/compiler-helpers.ts:884-901 (called from
  // compilers.ts:1278); the call rows: fuzzing (oracle mode, N2), e.g.
  // `const parts = [BarController, BarElement]; Chart.register(...parts)`.
  // Impact: side effects run again for every chunk that loads, even a chunk
  // holding only the errorComponent (duplicated subscriptions, logging,
  // plugin registrations); every chunk depends on and re-exports all of the
  // `export *` module through the opaque namespace of its dynamic import,
  // which defeats tree-shaking of it.
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
    // Types read no value at runtime. Source: the #8504 confidence campaign
    // (corpus-diff K-08 and K-21a).
    {
      name: 'an unused subscription only a type alias reads',
      effect: `const unsubscribe = subscribe(() => {})
type Unsubscribe = typeof unsubscribe`,
    },
    {
      name: 'an unused subscription only a module augmentation reads',
      effect: `const unsubscribe = subscribe(() => {})
declare module './effects' {
  interface Registry {
    unsubscribe: typeof unsubscribe
  }
}`,
    },
    {
      name: 'an unused subscription only a props type reads',
      effect: `const unsubscribe = subscribe(() => {})
export function Card(props: { stop: typeof unsubscribe }) {
  return null
}`,
    },
    {
      name: 'an unused reassigned let',
      effect: `let label = track()
label = 'reassigned'`,
    },
    {
      name: 'a call spreading a module-level array',
      effect: `const names = ['a', 'b']
track(...names)`,
    },
    {
      name: 'a call reading a module-level function',
      effect: `function widget() {}
track(widget)`,
    },
  ])(
    'an unreferenced top-level side effect ($name) runs once, with the route module',
    async ({ effect }) => {
      await expectEffectRunsOnce(effect)
    },
  )

  // Control for the pin above (same harness): a top-level call that reads
  // only imports and literals is stripped from the chunks.
  test.each([
    { name: 'a call reading an import', effect: 'track(subscribe)' },
    { name: 'a call with literal arguments', effect: `track('a', 'b')` },
  ])(
    'an unreferenced top-level side effect ($name) runs once, with the route module',
    async ({ effect }) => {
      await expectEffectRunsOnce(effect)
    },
  )

  // Bug: same root cause as above: every split chunk keeps the route file's
  // `export * from './lib'`.
  // Impact: every split chunk depends on and re-exports all of `./lib`.
  test.fails(
    'split chunks do not re-export a module-level export *, which importers of the route file still get',
    async () => {
      const route = await loadRoute(
        `${head}export * from './lib'
export const Route = createFileRoute('/')({
  component: () => <p>index</p>,
})`,
        { stubs: { './lib': { x: 1 } } },
      )
      // Another module of the app imports a name the route file re-exports
      // (ruling P1: through a real importer)
      const importer = await route.importFromRoute(
        `import { x } from '${routeSpecifier}'
export const v = x`,
      )
      /** Sources a module imports or re-exports from. */
      const requested = (code: string) =>
        importRequests(code)
          .filter(({ dynamic }) => !dynamic)
          .map(({ specifier }) => specifier)
      expect({
        reExported: importer.v,
        rendered: await route.render('component'),
        componentRequestsLib: (await route.loadedBy('component'))
          .flatMap(requested)
          .includes('./lib'),
      }).toEqual({
        reExported: 1,
        rendered: '<p>index</p>',
        componentRequestsLib: false,
      })
    },
  )

  // Bug: an ambient `declare const` is handled as a module binding. Read by
  // the loader and the split component, it is shared: the shared module
  // exports a name that TypeScript erases, and the reference module and the
  // chunk import it. (Used as the split option itself: pinned in "route
  // options read from the environment".)
  // Impact: the build fails with a missing export, e.g. for a constant
  // injected with Vite's `define`.
  test.fails(
    'an ambient declare const read by the loader and the split component stays a global',
    async () => {
      vi.stubGlobal('APP_VERSION', '1.0')
      try {
        const loaded = await loadRoute(`${head}declare const APP_VERSION: string
export const Route = createFileRoute('/')({
  loader: () => APP_VERSION,
  component: () => <p>{APP_VERSION}</p>,
})`)
        expect([
          loaded.options.loader(),
          await loaded.render('component'),
        ]).toEqual(['1.0', '<p>1.0</p>'])
      } finally {
        vi.unstubAllGlobals()
      }
    },
  )
})

describe('top-level code nothing reads at runtime', () => {
  // Bug: the route module drops a declaration that only an exported type
  // alias reads: it loses that reader when the code splitter removes the
  // alias with the other exports, and the initializer then never runs.
  // Source: #8504 (code-splitter-dead-code.test.ts), where it passes.
  // Impact: what the initializer does when the route module loads
  // (registrations, analytics, polyfills) silently stops once code splitting
  // is on.
  test.fails.each([
    {
      name: 'a declaration only an exported type alias reads',
      setup: `const analytics = init('analytics')
export type Analytics = typeof analytics`,
      registered: ['analytics'],
    },
  ])(
    'the initializers of $name run when the route module loads',
    async ({ setup, registered }) => {
      const calls: Array<unknown> = []
      const route = await loadRoute(
        `${head}import { init } from './init'
${setup}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>component</p>,
})
`,
        {
          stubs: {
            './init': {
              init: (value: unknown) => {
                calls.push(value)
                return value
              },
            },
          },
        },
      )
      expect([calls, await route.render('component')]).toEqual([
        registered,
        '<p>component</p>',
      ])
    },
  )

  // Bug: same as the type alias row above, in a route module compiled by the
  // route HMR plugin (automatic code splitting off), which runs the same
  // reference compiler. Source: the #8504 confidence campaign (F-06).
  // Impact: as above, in development without automatic code splitting.
  test.fails(
    'the initializer of a declaration only an exported type alias reads runs when a route module compiled for HMR loads',
    async () => {
      const calls: Array<unknown> = []
      await evaluateModule(
        await transformWithRouteHmrPlugin(`${head}import { init } from './init'
const analytics = init('analytics')
export type Analytics = typeof analytics
export const Route = createFileRoute('/')({
  component: () => <p>component</p>,
})
`),
        {
          './init': {
            init: (value: unknown) => {
              calls.push(value)
              return value
            },
          },
        },
      )
      expect(calls).toEqual(['analytics'])
    },
  )
})

describe('page code left in the route module', () => {
  /**
   * Whether `./heavy` loads with the route module (imported by it or by a
   * module it imports statically), and what the split component renders: a
   * fix must render the same and leave `./heavy` to the chunk.
   */
  async function splitComponent(code: string) {
    const route = await loadRoute(code, {
      stubs: { './heavy': { heavy: () => 'heavy' } },
    })
    return {
      heavyLoadsEagerly: route.eager.includes('./heavy'),
      rendered: await route.render('component'),
    }
  }

  // Bug: page code that only the split component needs stays in the route
  // module, with what it imports, when something there looks like a read of
  // it: a type of the same name (TypeScript keeps types and values in
  // separate namespaces), an overload signature or a second `var`
  // declaration (dead-code elimination keeps them), or an unused function
  // that renders it (one that renders the split component itself works:
  // control in code-splitter-dead-code.test.ts).
  // Sources: tanstack.com src/routes/index.tsx (`type PrincipleProof` next to
  // `function PrincipleProof`); babel-dead-code-elimination
  // dead-code-elimination.test.ts "function" > "declaration" and "variable" >
  // "identifier"; corpus-diff, Jp-K/DmCompanionAi
  // frontend_old/src/routes/_layout/chat.tsx; #8504
  // (code-splitter-dead-code.test.ts), where they pass.
  // Impact: the page's code and dependencies load with the entry chunk.
  test.fails.each([
    {
      name: 'a type of the same name',
      code: `type Panel = 'a' | 'b'
export type Settings = { panel: Panel }
function Panel() {
  return <div>{heavy()}</div>
}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <Panel />,
})`,
      rendered: '<div>heavy</div>',
    },
    {
      name: 'overload signatures',
      code: `function load(id: string): string
function load(id: number): string
function load(id: any) { return heavy() + id }
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{load(1)}</p>,
})`,
      rendered: '<p>heavy1</p>',
    },
    {
      name: 'a redeclared var',
      code: `var load = 'first'
var load = heavy()
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{load}</p>,
})`,
      rendered: '<p>heavy</p>',
    },
    {
      name: 'an unused function that renders a component of the split component',
      code: `export const Route = createFileRoute('/')({
  component: Page,
})
function Card() {
  return <p>{heavy()}</p>
}
function Page() {
  return <Card />
}
const Unused = () => <Card />`,
      rendered: '<p>heavy</p>',
    },
    {
      name: 'an unused function that renders what an inline split component renders',
      code: `export const Route = createFileRoute('/')({
  component: () => <Page />,
})
function Page() {
  return <p>{heavy()}</p>
}
function Unused() {
  return <Page />
}`,
      rendered: '<p>heavy</p>',
    },
  ])(
    'a split component and its imports leave the route module next to $name',
    async ({ code, rendered }) => {
      expect(
        await splitComponent(`${head}import { heavy } from './heavy'
${code}
`),
      ).toEqual({ heavyLoadsEagerly: false, rendered })
    },
  )
})

describe('split route options', () => {
  // Bug: once the object form compiles (pins above), its handler must also
  // end up split: a loader configured to be split that stays in the route
  // module is our limitation, not a pattern the user can change (decision
  // D11). Only the handler can move; the router reads the other keys
  // (`staleReloadMode`) from the route options. Today the compiler throws
  // first (same root cause as above). A compiler that builds these routes
  // but keeps a method handler, or a handler next to a spread, in the route
  // module on purpose still has this bug.
  // Impact: the loader's code loads with the entry chunk, or the route
  // cannot be built.
  test.fails.each([
    { name: 'an arrow handler', loader: `{ handler: () => 'MARK_handler' }` },
    {
      name: 'a method handler',
      loader: `{ handler() { return 'MARK_handler' } }`,
    },
    {
      name: 'a spread after the handler',
      loader: `{ handler: () => 'MARK_handler', ...defaults }`,
    },
  ])(
    'the handler of a split loader in object form with $name loads lazily',
    async ({ loader }) => {
      const route =
        await loadRoute(`${head}const defaults = { staleReloadMode: 'blocking' as const }
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component']],
  loader: ${loader},
  component: () => <p>index</p>,
})
`)
      // What loads with the route module loads with the entry.
      expect({
        eagerHandler: route.eagerModules.some((code) =>
          code.includes('MARK_handler'),
        ),
        loaded: await route.options.loader.handler(),
      }).toEqual({ eagerHandler: false, loaded: 'MARK_handler' })
    },
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
    {
      // Only the handler moves: its import leaves the route module, and the
      // state it shares with `staleReloadMode` is created once.
      // Source: #8504 (code-splitter-route-options.test.ts), where it passes.
      name: 'an import only the handler reads, next to state the handler and another key read',
      code: `import { fetchPosts } from './api'
import { createConfig } from './store'
const config = createConfig()
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component']],
  loader: {
    handler: () => [config.mode, fetchPosts()],
    staleReloadMode: config.mode,
  },
  component: () => <p>index</p>,
})`,
      expected: {
        loaded: ['background', 'posts'],
        staleReloadMode: 'background',
        rendered: '<p>index</p>',
        created: { store: 0, theme: 0, config: 1 },
        apiLoadsEagerly: false,
      },
    },
  ])(
    'a split loader in object form keeps $name working, created once',
    async ({ code, expected }) => {
      const created = { store: 0, theme: 0, config: 0 }
      const route = await loadRoute(`${head}${code}\n`, {
        stubs: {
          './api': { fetchPosts: () => 'posts' },
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
        rendered: await route.render('component'),
        created,
        ...('apiLoadsEagerly' in expected && {
          apiLoadsEagerly: route.eager.includes('./api'),
        }),
      }).toEqual(expected)
    },
  )
})

describe('route options written in other shapes', () => {
  // Bug: a route whose options object or factory call is wrapped in a
  // TypeScript cast is not split at all, and a component wrapped in
  // `satisfies` cannot be split: the virtual compiler throws
  // "Unexpected splitNode type ☝️: TSSatisfiesExpression". These are our
  // limitations, so the goal is a split
  // component (decision D11).
  // Sources: corpus-diff, openalgon-alt/agri-prep-path
  // src/routes/admin/access.tsx (`createFileRoute('/admin/access')({ … } as
  // any)`); differential fuzzing (casts around the route factory call);
  // React Router route-chunks-test.ts "chunkable" detection of export
  // values; #8504 (code-splitter-route-options.test.ts), where they pass.
  // Impact: the component loads with the entry chunk, or the route cannot
  // be built once code splitting is on.
  test.fails.each([
    {
      name: 'the options object wrapped in `as any`',
      route: `createFileRoute('/')({ ssr: false, component: Page } as any)`,
    },
    {
      name: 'the options object wrapped in `satisfies object`',
      route: `createFileRoute('/')({ ssr: false, component: Page } satisfies object)`,
    },
    {
      name: 'the route factory call wrapped in `as any`',
      route: `(createFileRoute('/') as any)({ ssr: false, component: Page })`,
    },
    {
      name: 'the component wrapped in a satisfies expression',
      route: `createFileRoute('/')({ component: Page satisfies (() => unknown) })`,
    },
  ])('a component is split with $name', async ({ route }) => {
    const loaded = await loadRoute(`${head}export const Route = ${route}
function Page() {
  return <p>page</p>
}
`)
    expect(await loaded.isLazy('component')).toBe(true)
    expect(await loaded.render('component')).toBe('<p>page</p>')
  })

  // Controls for the pins above and in "route factories written in other
  // shapes": these routes keep working (split or not), so the pins fail only
  // because the component is not split.
  test.each([
    `createFileRoute('/')({ ssr: false, component: Page } as any)`,
    `(createFileRoute('/') as any)({ ssr: false, component: Page })`,
    `createFileRoute('/')(makeOptions())`,
  ])('a route written as %s renders its component', async (route) => {
    const loaded = await loadRoute(`${head}function Page() {
  return <p>page</p>
}
const makeOptions = () => ({ component: Page })
export const Route = ${route}
`)
    await expectValidModules(loaded.modules)
    expect(await loaded.render('component')).toBe('<p>page</p>')
  })

  // Bug: the virtual compiler accepts only a fixed list of expression types
  // for the value of a split option; any other expression the route module
  // splits makes the build throw "Unexpected splitNode type ☝️:
  // MemberExpression" (LogicalExpression, TaggedTemplateExpression,
  // ClassExpression). These are our limitations, so the goal is a split
  // option (decision D11).
  // Source: round-3 mutation testing (compilers-B, bug B).
  // Impact: a route whose component is a namespace member (`Pages.Home`), a
  // fallback (`A ?? B`), a styled-components tagged template or a class
  // cannot be built once code splitting is on.
  test.fails.each<{
    name: string
    option?: string
    value: string
    declarations?: string
    filename?: string
    expected: unknown
  }>([
    {
      name: 'a member of a namespace import',
      value: 'Pages.Home',
      expected: 'home',
    },
    {
      name: 'a member of a local object (loader)',
      option: 'loader',
      value: 'api.load',
      expected: 'data',
    },
    {
      name: 'a logical fallback',
      declarations: `const overrides: { Home?: () => string } = {}\n`,
      value: 'overrides.Home || Fallback',
      expected: 'fallback',
    },
    {
      name: 'a nullish fallback',
      declarations: `const overrides: { Home?: () => string } = {}\n`,
      value: 'overrides.Home ?? Fallback',
      expected: 'fallback',
    },
    {
      name: 'a tagged template',
      value: 'styled`home`',
      expected: 'styled home',
    },
    {
      // JavaScript: the route types of React accept function components
      // only (TS2322 for a class).
      name: 'a class expression',
      filename: 'route.jsx',
      declarations: `import { Component } from 'react'\n`,
      value: `class extends Component {
    render() {
      return <p>class</p>
    }
  }`,
      expected: '<p>class</p>',
    },
  ])(
    'an option written as $name is split and works',
    async ({
      option = 'component',
      value,
      declarations = '',
      filename,
      expected,
    }) => {
      const route = await loadRoute(
        `${head}import * as Pages from './pages'
import { styled } from './styled'
${declarations}const Fallback = () => 'fallback'
const api = { load: () => 'data' }
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component']],
  loader: ${option === 'loader' ? value : `() => 'data'`},
  component: ${option === 'component' ? value : `() => <p>page</p>`},
})
`,
        {
          filename,
          stubs: {
            './pages': { Home: () => 'home' },
            './styled': {
              styled: (strings: TemplateStringsArray) => () =>
                `styled ${strings[0]}`,
            },
          },
        },
      )
      expect(await route.isLazy(option)).toBe(true)
      expect(
        option === 'loader'
          ? await (
              await route.load('loader')
            )()
          : await route.render(option),
      ).toBe(expected)
    },
  )

  // Bug: a component option written as a call cannot be split when its
  // printed code does not parse on its own with Babel's default options: the
  // virtual compiler prints the call and parses it again as a script
  // statement, without JSX ("Support for the experimental syntax 'jsx' isn't
  // currently enabled") and without TypeScript ("Unexpected token"). A type
  // argument (`memo<Props>(Page)`) even parses, as comparisons, and the
  // option silently becomes `false`.
  // Source: compilers.ts:1081-1082 (`babel.parse(outputSplitNodeCode)`).
  // Sources: differential fuzzing; dev servers of the e2e apps, where the
  // `?tsr-split=component` module failed with HTTP 500; #8504
  // (code-splitter-jsx.test.ts), where the JSX rows pass; fuzzing (oracle
  // mode, V3) for the TypeScript rows.
  // Impact: the route cannot be built once code splitting is on, or renders
  // a value that is not its component.
  test.fails.each<{
    name: string
    component: string
    rendered?: string
    imports?: string
    targetFramework?: TargetFramework
  }>([
    {
      name: 'memo of an inline arrow',
      component: `memo(() => <p>page</p>)`,
    },
    {
      name: 'memo of an inline named function',
      component: `memo(function Page() {\n  return <p>page</p>\n})`,
    },
    {
      name: 'a call with a JSX argument',
      imports: `${head}import { withFallback } from './hoc'\nimport { Page } from './page'`,
      component: `withFallback(Page, <p>loading</p>)`,
      rendered: 'page',
    },
    {
      name: 'a Vue defineComponent with a render function',
      targetFramework: 'vue',
      imports: `import { createFileRoute } from '@tanstack/vue-router'
import { defineComponent } from 'vue'`,
      component: `defineComponent({\n  setup: () => () => <p>page</p>,\n})`,
    },
    {
      name: 'a call of a typed arrow function',
      component: `memo((): string => 'page')`,
      rendered: 'page',
    },
    {
      name: 'a call with a type assertion',
      imports: `${head}import { memo } from 'react'\nimport { Page } from './page'`,
      component: `memo(Page as any)`,
      rendered: 'page',
    },
    {
      name: 'a call with a type argument',
      imports: `${head}import { memo } from 'react'\nimport { Page } from './page'`,
      component: `memo<typeof Page>(Page)`,
      rendered: 'page',
    },
  ])(
    'a component written as $name is split and renders',
    async ({
      imports = `${head}import { memo } from 'react'`,
      component,
      rendered = '<p>page</p>',
      targetFramework,
    }) => {
      const route = await loadRoute(
        `${imports}
export const Route = createFileRoute('/')({ component: ${component} })
`,
        {
          targetFramework,
          stubs: {
            './hoc': { withFallback: (component: unknown) => component },
            './page': { Page: () => 'page' },
          },
        },
      )
      expect(await route.isLazy('component')).toBe(true)
      expect(await route.render('component')).toBe(rendered)
    },
  )
})

describe('route factories written in other shapes', () => {
  // Bug: the code splitter only recognises `createFileRoute` under its own
  // name, so a route whose factory is imported under an alias is not split,
  // and nothing says so. Our limitation, so the goal is a split component
  // (decision D11). Source: the #8504 confidence campaign (K-21b, DX-02).
  // Impact: the route's components load with the entry chunk, silently.
  test.fails(
    'a component is split when createFileRoute is imported under an alias',
    async () => {
      const route =
        await loadRoute(`import { createFileRoute as fileRoute } from '@tanstack/react-router'
export const Route = fileRoute('/')({ component: Page })
function Page() {
  return <p>page</p>
}
`)
      expect(await route.isLazy('component')).toBe(true)
      expect(await route.render('component')).toBe('<p>page</p>')
    },
  )

  // Bug: the code splitter only compiles files whose code matches
  // `createFileRoute(`, so a route whose factory call has a type argument
  // (`createFileRoute<'/'>('/')`) is left as is, and nothing says so. Our
  // limitation, so the goal is a split component (decision D11).
  // Source: round-3 mutation testing (splitter-hosts X1).
  // Impact: the route's components load with the entry chunk, silently.
  test.fails(
    'a component is split when createFileRoute has a type argument',
    async () => {
      const route = await loadRoute(`${head}function Page() {
  return <p>page</p>
}
export const Route = createFileRoute<'/'>('/')({ component: Page })
`)
      expect(await route.isLazy('component')).toBe(true)
      expect(await route.render('component')).toBe('<p>page</p>')
    },
  )

  // Bug: route options returned by a call (`createFileRoute('/')(
  // makeOptions())`) are neither split nor reported. The user can write the
  // options inline, so a warning naming the file is an acceptable outcome
  // (decision D11). Source: the #8504 confidence campaign (DX-02, RF-8).
  // Impact: the route's components load with the entry chunk, silently.
  test.fails(
    'route options returned by a call are split or reported',
    async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const route = await loadRoute(`${head}function Page() {
  return <p>page</p>
}
const makeOptions = () => ({ component: Page })
export const Route = createFileRoute('/')(makeOptions())
`)
        expect(await route.render('component')).toBe('<p>page</p>')
        expect({
          split: await route.isLazy('component'),
          warned: reportsNotSplit(warn, route.ids.reference!),
        }).not.toEqual({ split: false, warned: false })
      } finally {
        warn.mockRestore()
      }
    },
  )

  // Bug: a route file that creates two file routes compiles both routes'
  // split options into the same chunk names, so one route renders the
  // other's component, silently. Supporting it, or refusing it with an error
  // or a warning naming the file, are both valid fixes.
  // Source: the #8504 confidence campaign (corpus-diff K-01; the #8630 pin
  // was dropped without a ruling).
  // Impact: a route renders another route's component.
  test.fails(
    'each of two file routes of one module renders its own component, or the module is reported',
    async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        let route
        try {
          route =
            await loadRoute(`${head}export const Legacy = createFileRoute('/old')({
  component: () => <p>legacy</p>,
})
export const Route = createFileRoute('/')({
  component: () => <p>index</p>,
})
`)
        } catch (error) {
          // A refusal names the file (its wording is free)
          expectDiagnostic(error, { file: 'route.tsx' })
          return
        }
        if (
          findDiagnostics(
            warn.mock.calls.map((args) => args.map(String).join(' ')),
            { file: route.ids.reference! },
          ).length > 0
        ) {
          return
        }
        /** Renders a route option, loading it first when it is lazy. */
        const render = async (component: any) => {
          await component.preload?.()
          return renderComponent(component)
        }
        expect([
          await render(route.exports.Legacy.options.component),
          await route.render('component'),
        ]).toEqual(['<p>legacy</p>', '<p>index</p>'])
      } finally {
        warn.mockRestore()
      }
    },
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
      expect(await route.render('component')).toBe('<div>page</div>')
      // What loading the component evaluates
      const loaded = await route.loadedBy('component')
      expect({
        declares: ['helper', 'Api', 'Def'].filter((name) =>
          loaded.some((code) => declaredNames(code).has(name)),
        ),
        importsHeavy: loaded.flatMap(importSources).includes('./heavy'),
      }).toEqual({ declares: [], importsHeavy: false })
    },
  )

  // Bug: same root cause as above, for re-exports and a default-exported
  // class: every split chunk re-exports them or declares the class again.
  // Source: Next.js ssg/getStaticProps/should-remove-extra-named-export-speicifers,
  // should-support-full-re-export and should-support-class-exports; #8504
  // (code-splitter-imports-exports.test.ts), where it passes.
  // Impact: every split chunk loads the re-exported modules and the class.
  test.fails(
    'split chunks do not re-export or declare the re-exports and default class of the route file',
    async () => {
      // The class carries a marker its code keeps under any name a
      // compiler gives the class (SPEC J2.5 D5: identified independently
      // of generated names).
      const marker = 'default-class-marker-7f3a'
      const route = await loadRoute(
        `${head}export { getPaths, a as getProps } from './lib'
export { foo, bar as baz } from './lib'
export { helper } from './default-lib'
export default class Test {
  render() {
    return '${marker}'
  }
}
export const Route = createFileRoute('/')({
  component: () => <div>home</div>,
  errorComponent: () => <div>error</div>,
})
`,
        {
          stubs: {
            './lib': { getPaths: 1, a: 2, foo: 3, bar: 4 },
            './default-lib': { helper: 5 },
          },
        },
      )
      expect([
        await route.render('component'),
        await route.render('errorComponent'),
      ]).toEqual(['<div>home</div>', '<div>error</div>'])
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
      // Every module loading a split option evaluates: what the lazy
      // options reach beyond what loads with the route module.
      const loaded = [
        ...(await route.loadedBy('component')),
        ...(await route.loadedBy('errorComponent')),
      ]
      expect(
        loaded.map((code) => ({
          requests: requested(code).filter((source) =>
            ['./lib', './default-lib'].includes(source),
          ),
          holdsClass: code.includes(marker),
        })),
      ).toEqual(loaded.map(() => ({ requests: [], holdsClass: false })))
    },
  )

  // Bug: the route module keeps importing the classic JSX factory its pragma
  // names (and the chunk the fragment factory) after the JSX that compiles
  // to it moved to a split chunk (D5 family). Source: #8504
  // (code-splitter-pragmas.test.ts; mutation testing P-03), where it passes.
  // Impact: the entry chunk loads the JSX library for nothing.
  // The factories are the real ones (`@emotion/react`'s `jsx`, React's
  // `createElement` and `Fragment`), rendered by the real React: the split
  // component renders as the untouched file renders it.
  test.fails.each([
    {
      name: '@jsx',
      header: `/** @jsxRuntime classic */
/** @jsx jsx */
import { jsx } from '@emotion/react'`,
      library: '@emotion/react',
      element: `<p css={{ color: 'red' }}>page</p>`,
    },
    {
      name: '@jsx written with two spaces',
      header: `/** @jsxRuntime classic */
/** @jsx  jsx */
import { jsx } from '@emotion/react'`,
      library: '@emotion/react',
      element: `<p css={{ color: 'red' }}>page</p>`,
    },
    {
      name: '@jsxFrag, in a chunk without fragments',
      header: `/** @jsxRuntime classic */
/** @jsx createElement */
/** @jsxFrag Fragment */
import { createElement, Fragment } from 'react'`,
      library: 'react',
      element: '<p>page</p>',
      // The loader renders a fragment, so the file uses `Fragment`.
      loader: '<>{1}</>',
    },
  ])(
    'a module without JSX does not import the classic factory ($name)',
    async ({ header, library, element, loader }) => {
      const code = `${header}
${head}export const Route = createFileRoute('/')({
  loader: () => ${loader ?? "'data'"},
  component: () => ${element},
})
`
      const untouched = (await evaluateModule(code)).Route as unknown as {
        options: { component: unknown }
      }
      const expected = await renderComponent(untouched.options.component)
      const route = await loadRoute(code)
      // Without JSX left, the route module needs nothing of the library (nor
      // does what loads with it); no module loading the component imports
      // the fragment factory (whatever local name it gets there).
      expect({
        rendered: await route.render('component'),
        ...(loader === undefined
          ? { libraryLoadsEagerly: route.eager.includes(library) }
          : {
              importsFragment: (await route.loadedBy('component')).some(
                (module) => importedNames(module, library).includes('Fragment'),
              ),
            }),
      }).toEqual({
        rendered: expected,
        ...(loader === undefined
          ? { libraryLoadsEagerly: false }
          : { importsFragment: false }),
      })
    },
  )

  // Control for the array destructuring pins below: a component declared by
  // an object destructuring of a literal is split and renders.
  test('a component declared by an object destructuring renders', async () => {
    const route =
      await loadRoute(`${head}const { Page } = { Page: () => <div>page</div> }
export const Route = createFileRoute('/')({ component: Page })
`)
    expect(await route.render('component')).toBe('<div>page</div>')
  })

  // Bug: a split option that names a binding declared by an array
  // destructuring cannot be split: the virtual compiler throws
  // "Unexpected splitNode type ☝️: VariableDeclarator".
  // Impact: a route whose component comes from an array destructuring
  // cannot be built once code splitting is on.
  test.fails(
    'a component declared by an array destructuring of a call shared with the errorComponent renders',
    async () => {
      const route = await loadRoute(
        `${head}import { createPair } from './factory'
const [Page, ErrorView] = createPair()
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: ErrorView,
})
`,
        {
          stubs: {
            './factory': {
              createPair: () => [() => 'page', () => 'error'],
            },
          },
        },
      )
      expect(await route.render('component')).toBe('page')
    },
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
      await route.options.loader(),
      await route.render('component'),
      await route.render('errorComponent'),
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

  // Bug: the code splitter declares fixed names in the modules it emits
  // (`SplitComponent`, `SplitLoader`) without checking that the route file
  // does not use them. Source: gap S38.
  // Impact: a route file with such a binding cannot be built ("Duplicate
  // declaration") or its options read the generated value instead of the
  // user's.
  test.fails.each([
    { name: 'SplitComponent', declaration: `const SplitComponent = 'value'` },
    { name: 'SplitLoader', declaration: `const SplitLoader = 'value'` },
  ])(
    'a route file binding named $name keeps its value',
    async ({ name, declaration }) => {
      expect(await readName(name, declaration)).toEqual(expected)
    },
  )

  // The code splitter imports `lazyRouteComponent` and `lazyFn` from the
  // router package; a route file that imports them itself, for an option
  // the code splitter leaves alone, keeps working next to split options.
  test.each([
    {
      name: 'lazyRouteComponent',
      option: `pendingComponent: lazyRouteComponent(() => import('./spinner'))`,
      read: async (route: Awaited<ReturnType<typeof loadRoute>>) =>
        await route.render('pendingComponent'),
      expected: 'spinner',
    },
    {
      name: 'lazyFn',
      option: `loader: lazyFn(() => import('./load-data'), 'loadData')`,
      read: (route: Awaited<ReturnType<typeof loadRoute>>) =>
        route.options.loader(),
      expected: 'data',
    },
  ])(
    'a route file that imports $name from the router package keeps working next to split options',
    async ({ name, option, read, expected }) => {
      const route = await loadRoute(
        `import { createFileRoute, ${name} } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  ${option},
  component: () => <p>page</p>,
  errorComponent: () => <p>error</p>,
})
`,
        {
          stubs: {
            './spinner': { default: () => 'spinner' },
            './load-data': { loadData: () => 'data' },
          },
        },
      )
      await expectValidModules(route.modules)
      expect([
        await route.isLazy('component'),
        await read(route),
        await route.render('component'),
        await route.render('errorComponent'),
      ]).toEqual([true, expected, '<p>page</p>', '<p>error</p>'])
    },
  )
})

describe('code-split groupings', () => {
  // Bug: `codeSplitGroupings` must be written inline; a module-level
  // constant holding the groupings is refused ("You must provide an array
  // of arrays for the codeSplitGroupings").
  // Impact: groupings shared between route files through a constant cannot
  // be used.
  test.fails(
    'groupings declared in a module-level constant are honoured',
    async () => {
      const route =
        await loadRoute(`${head}const groupings: Array<Array<'loader' | 'component'>> = [
  ['loader'],
  ['component'],
]
export const Route = createFileRoute('/')({
  codeSplitGroupings: groupings,
  loader: () => 'data',
  component: () => <p>page</p>,
})
`)
      expect(await route.options.loader()).toBe('data')
      expect(await route.render('component')).toBe('<p>page</p>')
      // The loader and the component each load on their own.
      expect(await route.groups()).toEqual([['component'], ['loader']])
    },
  )
})

describe('module state read by route options written as methods', () => {
  // Bug: shared bindings are computed from route options written as
  // `key: value` only, so a binding that an option written as a method
  // (kept in the route module) and a split option both read is not shared:
  // the split chunk declares its own copy.
  // Impact: the split component reads another instance of the module state
  // than the route's other options.
  test.fails(
    'module state a method option shares with a split option is created once',
    async () => {
      const route = await loadRoute(`${head}const state = { count: 0 }
export const Route = createFileRoute('/')({
  loader() {
    return ++state.count
  },
  component: () => <div>{state.count}</div>,
})
`)
      expect([route.options.loader(), await route.render('component')]).toEqual(
        [1, '<div>1</div>'],
      )
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
      let created = 0
      const route = await loadRoute(
        `${head}import { createRouteHelpers } from './helpers'
const { cache, useTitle } = createRouteHelpers(() => Route)
export const Route = createFileRoute('/')({
  staticData: { title: 'title' },
  loader: () => {
    cache.set('k', 1)
    return cache.size
  },
  component: () => <div>{cache.size}{useTitle()}</div>,
})
`,
        {
          stubs: {
            './helpers': {
              createRouteHelpers: (getRoute: () => any) => {
                created++
                return {
                  cache: new Map(),
                  useTitle: () => getRoute().options.staticData.title,
                }
              },
            },
          },
        },
      )
      expect([
        route.options.loader(),
        await route.render('component'),
        created,
      ]).toEqual([1, '<div>1title</div>', 1])
    },
  )
})

describe('route options read from the environment', () => {
  /** What the route's component renders, loaded first when it is lazy. */
  async function renderRouteComponent(
    code: string,
    stubs: Record<string, Record<string, unknown>> = {},
  ) {
    return (await loadRoute(code, { stubs })).render('component')
  }

  // Control for the pins below (same harness).
  test('a split component imported by the route file renders', async () => {
    expect(
      await renderRouteComponent(
        `import { Page } from './page'
${head}export const Route = createFileRoute('/')({ component: Page })
`,
        { './page': { Page: () => 'page' } },
      ),
    ).toBe('page')
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
      declaration: 'declare const TsrGlobalPage: () => string\n',
    },
  ])('a component read from $name renders', async ({ declaration }) => {
    vi.stubGlobal('TsrGlobalPage', () => 'global page')
    try {
      expect(
        await renderRouteComponent(`${head}${declaration}export const Route = createFileRoute('/')({
  component: TsrGlobalPage,
})
`),
      ).toBe('global page')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('classic JSX pragmas', () => {
  const pragma = `/** @jsxRuntime classic */
/** @jsx jsx */
import { jsx } from '@emotion/react'
`

  /**
   * Whether Emotion styled the markup: rendered on the server, Emotion
   * inlines a style element in front of the element it styles; JSX
   * compiled with another runtime leaves a `css` prop as a plain attribute.
   */
  const emotionStyled = (html: string) => /<style\b/.test(html)

  /**
   * The route file's component as the untouched file renders it: the
   * project's real JSX transform (Vite's) and the real `@emotion/react`
   * and React.
   */
  async function renderUntouched(code: string) {
    const { Route } = (await evaluateModule(code)) as unknown as {
      Route: { options: { component: unknown } }
    }
    return renderComponent(Route.options.component)
  }

  // Control for the JSX pragma pins below (same rendering): the untouched
  // file's JSX compiles to the real Emotion factory its pragma names.
  test.each([pragma, pragma.replace('@jsx jsx', '@jsx  jsx')])(
    'the untouched file renders JSX through the factory of a classic JSX pragma (%s)',
    async (header) => {
      expect(
        emotionStyled(
          await renderUntouched(`${header}${head}export const Route = createFileRoute('/')({
  component: () => <div css={{ color: 'red' }}>page</div>,
})`),
        ),
      ).toBe(true)
    },
  )

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
      const code = `${pragma}${head}export const Route = createFileRoute('/')({
  component: () => <div css={{ color: 'red' }}>page</div>,
  errorComponent: () => jsx('b', null, 'error'),
})`
      const route = await loadRoute(code)
      expect(await route.render('component')).toBe(await renderUntouched(code))
    },
  )

  // Bug: same root cause as above, for a chunk with only fragments (the
  // @jsxFrag factory too) and a pragma written with two spaces. Source: #8504
  // (code-splitter-pragmas.test.ts; mutation testing of the dead code
  // removal), where they pass.
  // Impact: the split component throws "jsx is not defined".
  test.fails.each([
    {
      name: 'the fragments of a chunk, with @jsxFrag',
      code: `/** @jsxRuntime classic */
/** @jsx jsx */
/** @jsxFrag Fragment */
${head}import { jsx } from '@emotion/react'
import { Fragment } from 'react'
export const Route = createFileRoute('/')({
  component: () => <><b css={{ color: 'red' }}>page</b></>,
  errorComponent: () => jsx(Fragment, null, 'error'),
})`,
    },
    {
      // Source: #8504 (mutation testing P-03).
      name: 'a pragma written with two spaces',
      code: `/** @jsxRuntime classic */
/** @jsx  jsx */
${head}import { jsx } from '@emotion/react'
export const Route = createFileRoute('/')({
  component: () => <div css={{ color: 'red' }}>page</div>,
  errorComponent: () => jsx('b', null, 'error'),
})`,
    },
  ])('a split component renders through $name', async ({ code }) => {
    const route = await loadRoute(code)
    expect(await route.render('component')).toBe(await renderUntouched(code))
  })

  /**
   * The application's own classic JSX factory (module `./jsx`), rendering
   * intrinsic elements as the text `tag(children)`.
   */
  const textJsx = (type: string, _props: unknown, ...children: Array<string>) =>
    `${type}(${children.join('')})`

  // Bug: the shared-binding analysis does not count the JSX of a split option
  // as a read of the classic JSX factory it compiles to, so a factory that
  // the route module creates and the loader reads is not shared with the
  // split component: the chunk drops it (same root cause as the pin above),
  // and keeping it in the chunk without sharing it creates it again there.
  // Impact: the split component throws "jsx is not defined", or the route
  // module and the chunk each create their own factory.
  // Source of the `@jsx` only row: the #8504 probe (R-13; a project whose
  // tsconfig selects the classic runtime).
  test.fails.each([
    {
      name: '@jsxRuntime classic and @jsx',
      header: '/** @jsxRuntime classic */\n/** @jsx jsx */',
      project: undefined,
    },
    {
      // A project whose default JSX runtime is classic (what `@jsx` alone
      // requires: the automatic transform ignores a lone `@jsx`).
      name: '@jsx only, in a classic-runtime project',
      header: '/** @jsx jsx */',
      project: { runtime: 'classic' as const },
    },
  ])(
    'a factory the route module creates and the loader reads is created once for the split component ($name)',
    async ({ header, project }) => {
      let creations = 0
      const route = await loadRoute(
        `${header}
${head}import { createJsx } from './jsx'
const jsx = createJsx()
export const Route = createFileRoute('/')({
  loader: () => jsx('span', null),
  component: () => <div>page</div>,
})`,
        {
          jsx: project,
          stubs: {
            './jsx': {
              createJsx: () => {
                creations++
                return textJsx
              },
            },
          },
        },
      )
      await expectValidModules(route.modules, { jsx: project })
      expect([
        route.options.loader(),
        await route.render('component'),
        creations,
      ]).toEqual(['span()', 'div(page)', 1])
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
      // Source: #8504 (lost case L4).
      name: 'a function exported as default by specifier',
      declaration: `function Page() {
  return <p>page</p>
}
export { Page as default }`,
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
        expect(await route.render('component')).toBe('<p>page</p>')
        expect({
          split: await route.isLazy('component'),
          warned: reportsNotSplit(warn, file),
        }).not.toEqual({ split: false, warned: false })
      } finally {
        warn.mockRestore()
      }
    },
  )

  // In a dev server, the user is told once per file, in the terminal, which
  // option of which file stays unsplit (J2.8, J2.19): here an exported
  // component that another route of the app imports eagerly (a permitted
  // fallback). Serving the route module, its split modules and the other
  // route adds no second report.
  // Bug: the warning names the file and the exported binding (`Page`), not
  // the route option (same bug as code-splitter-imports-exports.test.ts
  // "are reported once, naming the file and the option, when not
  // code-split").
  // Source: FIX-PLAN §G.3 (F22/F40 dev row); V1 split F40.
  // Impact: the developer has to work out which option the named export is.
  test.fails(
    'a dev server reports an exported component it leaves unsplit once per file, naming the file and the option',
    async () => {
      let root = ''
      const { diagnostics } = await captureConsole(async () => {
        const server = await routerDevServer({
          files: {
            'routes/index.tsx': `${head}export function Page() {
  return <p>page</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
            'routes/about.tsx': `${head}import { Page } from './index'
export const Route = createFileRoute('/about')({ component: () => <Page /> })
`,
          },
        })
        root = server.root
        const served = await server.load('/routes/index.tsx')
        for (const [url, code] of Object.entries(served)) {
          for (const { specifier, dynamic } of importRequests(code, url)) {
            if (dynamic && specifier.startsWith('/routes/')) {
              await server.transform(specifier)
            }
          }
        }
        await server.transform('/routes/index.tsx')
        await server.load('/routes/about.tsx')
        await server.idle()
      })
      expectDiagnostic(diagnostics, {
        severity: 'warning',
        file: 'routes/index.tsx',
        root,
        names: ['component'],
        times: 1,
      })
    },
  )

  // Bug: the entry's `useTitle` and the one the split component calls are
  // two functions: a binding that reads `Route` is never shared
  // (`removeBindingsDependingOnRoute`), so the chunk declares a copy of the
  // exported function. Importers of the route module and the route must
  // share one instance (user ruling 2026-10-17, P1): a copy in the chunk is
  // this bug even when the function holds no state. Source: gap S19.
  // Impact: code that relies on the identity of an exported hook or helper
  // (memoisation, registries, `===` checks) sees two of them.
  // (The title lives in `staticData`, typed by the documented
  // `StaticDataRouteOption` augmentation; V1 split F28.)
  test.fails(
    'an exported function that reads Route is the one the split component calls',
    async () => {
      const seen: Array<unknown> = []
      const route = await loadRoute(
        `${head}import { see } from './see'
declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    title?: string
  }
}
export function useTitle() {
  return Route.options.staticData!.title
}
function Page() {
  see(useTitle)
  return <p>{useTitle()}</p>
}
export const Route = createFileRoute('/')({
  staticData: { title: 'title' },
  component: Page,
})
`,
        { stubs: { './see': { see: (value: unknown) => seen.push(value) } } },
      )
      // Another module of the app imports the hook.
      const { useTitle } = await route.importBindings(['useTitle'])
      expect({
        rendered: await route.render('component'),
        imported: useTitle(),
        sameInstance: seen.length === 1 && seen[0] === useTitle,
      }).toEqual({
        rendered: '<p>title</p>',
        imported: 'title',
        sameInstance: true,
      })
    },
  )

  // Bug: a split component that reads a `Route` declared with `const` and
  // exported later (`export { Route }`) gets a chunk that creates the route
  // again instead of importing it from the route module.
  // Source: corpus-diff, route files that end with `export { Route }`
  // (rahulroy0322/RacketHub, mchar7/nohiki-monorepo); #8504
  // (code-splitter-route-options.test.ts), where it passes.
  // Impact: the split component reads a second route object, which the
  // router does not know.
  test.fails(
    'a split component reads the route the route module exports through export { Route }',
    async () => {
      const route = await loadRoute(
        `${head}const Route = createFileRoute('/')({
  component: Page,
})
function Page() {
  return <p>{Route.id}</p>
}
export { Route }
`,
      )
      // The router mounted the exported route (which sets its id): a second
      // route object has none.
      expect(await route.renderRoute()).toBe('<p>/</p>')
    },
  )

  // Bug: a route whose component is a default-exported function (which
  // stays in the route module) that another split option renders cannot be
  // compiled: the code splitter throws "Duplicate declaration \"Bar\"".
  // Source: React Compiler gating/gating-test-export-default-function.js;
  // #8504 (code-splitter-imports-exports.test.ts), where it passes.
  // Impact: the route cannot be built once code splitting is on.
  test.fails(
    'a split option renders the default-exported component other modules import',
    async () => {
      const seen: Array<unknown> = []
      const route = await loadRoute(
        `${head}import type { ReactNode } from 'react'
import { see } from './see'
export default function Bar(props: { children?: ReactNode }) {
  return <div>{props.children}</div>
}
function NoForget(props: { noForget?: string }) {
  see(Bar)
  return <Bar>{props.noForget}</Bar>
}
export const Route = createFileRoute('/')({ component: Bar, errorComponent: NoForget })
`,
        { stubs: { './see': { see: (value: unknown) => seen.push(value) } } },
      )
      expect(await route.render('errorComponent', { noForget: 'x' })).toBe(
        '<div>x</div>',
      )
      // The component other modules import.
      const { default: imported } = await route.importBindings(['default'])
      expect(seen).toEqual([imported])
    },
  )

  // Bug: the code splitter deletes the exported declaration of an option's
  // component from every chunk, so a split component that renders the
  // exported component of another option, which reads `Route`, renders an
  // undeclared binding ("NotFound is not defined").
  // Source: round-3 mutation testing (compilers-B, bug A).
  // Impact: the route crashes when its component renders.
  test.fails.each([
    {
      name: 'export function',
      declaration: `export function NotFound() {
  return <i>{Route.options.staticData.label}</i>
}`,
    },
    {
      name: 'export const',
      declaration: `export const NotFound = () => <i>{Route.options.staticData.label}</i>`,
    },
  ])(
    'a split component renders the exported component of another option that reads Route ($name)',
    async ({ declaration }) => {
      const route = await loadRoute(`${head}${declaration}
export const Route = createFileRoute('/')({
  component: () => <p><NotFound /></p>,
  staticData: { label: 'nf' },
  notFoundComponent: NotFound,
})
`)
      expect(await route.render('component')).toBe('<p><i>nf</i></p>')
    },
  )

  // Bug: a default-exported function declaration that the loader and a split
  // component both call cannot be compiled: Babel throws "Duplicate
  // declaration" for it.
  // Source: round-3 mutation testing (router-utils).
  // Impact: the route cannot be built once code splitting is on.
  test.fails(
    'a default-exported function the loader and the split component call works on one state',
    async () => {
      let inits = 0
      const route = await loadRoute(
        `${head}import { init } from './state'
const store = init({ n: 0 })
export default function bump() {
  return ++store.n
}
export const Route = createFileRoute('/')({
  loader: () => bump(),
  component: () => <p>{bump()}</p>,
})
`,
        {
          stubs: {
            './state': {
              init: (value: unknown) => {
                inits++
                return value
              },
            },
          },
        },
      )
      const { default: bump } = await route.importBindings(['default'])
      expect([
        route.options.loader(),
        await route.render('component'),
        bump(),
        inits,
      ]).toEqual([1, '<p>2</p>', 3, 1])
    },
  )

  // Bug: a split loader that the route file also exports through an export
  // list (`export { load }`) loses its declaration in the route module:
  // "Export 'load' is not defined".
  // Source: round-3 mutation testing (compilers-A).
  // Impact: the route cannot be built once code splitting is on.
  test.fails(
    'a split loader exported through an export list keeps working',
    async () => {
      const route = await loadRoute(`${head}function load() {
  return 'data'
}
export { load }
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component']],
  loader: load,
  component: () => <p>page</p>,
})
`)
      const { load } = await route.importBindings(['load'])
      expect([await route.options.loader(), load()]).toEqual(['data', 'data'])
    },
  )

  /**
   * Loads a route whose errorComponent option is the exported
   * `PostErrorComponent`, written as `value`, next to another module of the
   * app that imports `PostErrorComponent` from the route file (ruling P1:
   * through a real importer). `withAuth` (`./with-auth`) is an identity
   * stub. The component records the instance it runs as (`./see`). Returns
   * what the route's errorComponent renders, whether it ran as the
   * importer's instance, and whether the option is split or the user is told
   * it is not (a warning naming the route file and the option or the
   * component).
   */
  async function exportedErrorComponent(value: string) {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const seen: Array<unknown> = []
    try {
      const route = await loadRoute(
        `${head}import { withAuth } from './with-auth'
import { see } from './see'
import { memo } from 'react'
export const Route = createFileRoute('/posts/$postId')({
  errorComponent: ${value},
  component: () => <p>post</p>,
})
export function PostErrorComponent() {
  see(PostErrorComponent)
  return <p>error</p>
}
`,
        {
          stubs: {
            './with-auth': { withAuth: (component: unknown) => component },
            './see': { see: (value: unknown) => seen.push(value) },
          },
        },
      )
      const importer = await route.importFromRoute(
        `import { PostErrorComponent } from '${routeSpecifier}'
export const imported = PostErrorComponent`,
      )
      const rendered = await route.render('errorComponent')
      const file = route.ids.reference!
      return {
        rendered,
        sameInstance: seen.length === 1 && seen[0] === importer.imported,
        splitOrReported:
          (await route.isLazy('errorComponent')) ||
          reportsNotSplit(warn, file, 'errorComponent'),
      }
    } finally {
      warn.mockRestore()
    }
  }

  // Control for the pin below (same harness): the bare identifier.
  test('an exported errorComponent named by the option is the instance its importers get', async () => {
    expect(await exportedErrorComponent('PostErrorComponent')).toMatchObject({
      rendered: '<p>error</p>',
      sameInstance: true,
    })
  })

  // Bug: when it leaves the exported component unsplit, the compiler's
  // warning names the file and the export (`PostErrorComponent`), never the
  // route option (J2.8: file and option). Same bug as
  // code-splitter-imports-exports.test.ts "are reported once, naming the
  // file and the option, when not code-split".
  // Source: V1 split F40.
  // Impact: the developer has to work out which option the named export is.
  test.fails(
    'an exported errorComponent named by the option is split, or reported naming the file and the option',
    async () => {
      expect(
        (await exportedErrorComponent('PostErrorComponent')).splitOrReported,
      ).toBe(true)
    },
  )

  // Bug: an exported component named by a split option is only recognised
  // as an export when the option is a bare identifier. Written in another
  // shape (`as any`, `as typeof X`, an HOC call such as `withAuth(X)` or
  // `memo(X)`), the option is split and its chunk declares its own copy of
  // the exported component, so the route renders another instance than the
  // one other modules import (and no "not code-split" warning is shown).
  // Either outcome of the bare identifier (one instance, split or unsplit
  // with a warning) is fine (ruling P1, decision D11).
  // Reach: the repository's examples (react and solid
  // basic-virtual-file-based posts-detail.tsx) and e2e apps (react, solid
  // and vue basic-file-based-code-splitting, virtual and rspack-virtual
  // routes, solid-start virtual-routes) write `errorComponent:
  // PostErrorComponent as any`; no other module imports it there, so they
  // show no symptom.
  // Source: compilers.ts:945-960 (the export check only handles a bare
  // Identifier), :572-591, the copy via :1170-1242; fuzzing (oracle mode,
  // round 2, F1).
  // Impact: code that relies on the identity of the component (`===`
  // checks, registries, memoised props) sees two of them, and the component
  // code ships twice (see the build pin below).
  test.fails.each([
    'PostErrorComponent as any',
    'PostErrorComponent as typeof PostErrorComponent',
    'withAuth(PostErrorComponent)',
    'memo(PostErrorComponent)',
  ])(
    'an exported errorComponent written as `%s` is the instance its importers get',
    async (value) => {
      expect(await exportedErrorComponent(value)).toEqual({
        rendered: '<p>error</p>',
        sameInstance: true,
        splitOrReported: true,
      })
    },
  )
})

describe('TypeScript-only syntax', () => {
  // Bug: the code splitter rejects an ES decorator after `export` (`export
  // @dec class`, valid since TypeScript 5.0): "Decorators must be placed
  // before the export keyword".
  // Source: round-3 mutation testing (router-utils P6).
  // Impact: a route file with such a class cannot be built once code
  // splitting is on.
  test.fails('a decorator after `export` compiles', async () => {
    const { modules } =
      await compileRouteModules(`${head}import { injectable } from 'tsyringe'
export @injectable() class Store {}
export const Route = createFileRoute('/')({ component: () => <div /> })
`)
    await expectValidModules(modules)
  })

  // Bug: the code splitter cannot parse a constructor parameter decorator
  // (TypeScript `experimentalDecorators`, as dependency injection libraries
  // use them) and fails the build. Source: the #8504 confidence campaign
  // (F-22), where #8504 compiles it.
  // Impact: a route file with such a class cannot be built once code
  // splitting is on.
  test.fails(
    'a class with a parameter decorator that the split component uses compiles into parseable modules',
    async () => {
      const { modules } =
        await compileRouteModules(`${head}import { Inject } from './di'
class Service {
  constructor(@Inject() readonly dep: unknown) {}
}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{String(new Service(1).dep)}</p>,
})
`)
      expect(Object.keys(modules).length).toBeGreaterThan(1)
      for (const code of Object.values(modules)) {
        parseModule(code)
      }
    },
  )

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
      const { modules } = await compileRouteModules(`${head}${importDeclaration}
export { Settings }
export const Route = createFileRoute('/')({
  component: () => <p>index</p>,
})`)
      await expectValidModules(modules)
    },
  )

  // Bug: a value import that only types read (TypeScript erases it) is
  // copied into every split chunk when the types that read it stay in the
  // route module. Source: #8504 (code-splitter-imports-exports.test.ts,
  // mutation testing of the dead code removal), where it passes.
  // Impact: split chunks load modules none of their code reads, e.g.
  // server-only code typed in the loader.
  test.fails.each([
    {
      name: 'the return type of the loader',
      code: `import { Framework } from './projects'
export const Route = createFileRoute('/')({
  loader: (): Framework => 'react',
  component: () => <p>index</p>,
})`,
      source: './projects',
    },
    {
      name: 'a parameter type of a helper the loader calls',
      code: `import { Database } from './server/db'
const load = (db: Database) => db.query()
export const Route = createFileRoute('/')({
  loader: ({ context }) => load(context.db),
  component: () => <p>page</p>,
})`,
      source: './server/db',
    },
  ])(
    'split chunks do not import what only $name reads',
    async ({ code, source }) => {
      const { graph } = await compileRouteModules(`${head}${code}\n`)
      const chunks = [...graph.importKinds]
        .filter(([, kind]) => kind === 'dynamic')
        .map(([id]) => graph.modules.get(id)!)
      expect(chunks.length).toBeGreaterThan(0)
      expect(
        chunks.filter((chunk) => importSources(chunk).includes(source)),
      ).toEqual([])
    },
  )

  // Bug: the split chunk declares a namespace the split component reads
  // without its body. Source: #8504 (code-splitter-imports-exports.test.ts),
  // where it passes.
  // Impact: the split component throws ("Labels is not defined").
  test.fails(
    'a namespace the split component reads keeps its body',
    async () => {
      const route =
        await loadRoute(`${head}namespace Labels { export const quiet = 'quiet' }
export const Route = createFileRoute('/')({
  component: () => <p>{Labels.quiet}</p>,
})
`)
      expect(await route.render('component')).toBe('<p>quiet</p>')
    },
  )

  // Bug: the split chunk prints a type assertion used as an update target
  // without its parentheses (`count as number++`), which does not parse.
  // Sources: @vitejs/plugin-rsc transform tests, typescript-eslint
  // type-assertion/increment/as-increment.js; #8504
  // (code-splitter-imports-exports.test.ts), where it passes.
  // Impact: the split component's chunk fails to compile.
  test.fails(
    'an asserted update operand keeps its parentheses in a split component',
    async () => {
      const route = await loadRoute(`${head}let count = 0
function Page() {
  ;(count as number)++
  return count
}
export const Route = createFileRoute('/')({ component: Page })
`)
      expect(await route.render('component')).toBe('1')
    },
  )

  // Bug: the split chunk prints a type assertion that is the test of a
  // conditional whose branch starts with a unary minus without its
  // parentheses (`a as any ? -x : y`), which does not parse (`any ? -x`
  // reads as the start of a conditional type). The root cause is upstream:
  // @babel/generator 7.29.8 drops the parentheses (parse+generate of
  // `f = ((a) as any) ? -x : y` gives `f = a as any ? -x : y;`; no
  // workaround here; router-utils/src/ast.ts:72 `generateFromAst` prints
  // with it). The Start compiler has the same bug (pin in
  // start-plugin-core/tests/start-compiler-preserves-user-code.test.ts).
  // Source: fuzzing (oracle mode, round 2).
  // Impact: the split component's chunk fails to compile, so the build
  // fails.
  test.fails(
    'an asserted conditional test keeps its parentheses in a split component',
    async () => {
      const code = `${head}function pick(flag: unknown, x: number, y: number) {
  return ((flag) as any) ? -x : y
}
function Page() {
  return <p>{pick(true, 1, 2)}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`
      await expectValidModules((await compileRouteModules(code)).modules)
      expect(await (await loadRoute(code)).render('component')).toBe(
        '<p>-1</p>',
      )
    },
  )

  /**
   * Compiles a route whose split component returns `expression`, checks that
   * every emitted module is valid and returns what the component renders.
   */
  async function renderReturned(expression: string) {
    const code = `${head}function Page() {
  return ${expression}
}
export const Route = createFileRoute('/')({ component: Page })
`
    await expectValidModules((await compileRouteModules(code)).modules)
    return (await loadRoute(code)).render('component')
  }

  test('parenthesized JSX keeps working in a split component', async () => {
    expect(await renderReturned('(<p>page</p>)')).toBe('<p>page</p>')
  })

  /** A route whose `beforeLoad` and split loader both call `helper`. */
  const sharedHelperRoute = (helper: string) => `${head}${helper}
export { helper as helperAlias }
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['component'], ['loader']],
  component: () => null,
  beforeLoad: () => helper('before'),
  loader: () => helper(42),
})`

  async function callSharedHelper(helper: string, verbatimModuleSyntax = true) {
    const route = await loadRoute(sharedHelperRoute(helper), {
      verbatimModuleSyntax,
    })
    // As another module of the app imports them.
    const imported = await route.importBindings(['helper', 'helperAlias'])
    return [
      typeof imported.helper === 'function' &&
        imported.helperAlias === imported.helper,
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

  const overloadedHelper = `export function helper(value: string): string
export function helper(value: number): number
export function helper(value: string | number) { return value }`

  // Control for the pin below: TypeScript erasure with
  // `verbatimModuleSyntax` keeps the import of the shared function.
  test('an overloaded function the route module and a split loader share keeps working, with verbatimModuleSyntax', async () => {
    expect(await callSharedHelper(overloadedHelper)).toEqual([
      true,
      'before',
      42,
    ])
  })

  // Bug: the overload signatures of a function that the route module and a
  // split chunk share stay in both modules, next to the import of the shared
  // function, and the TypeScript transform then takes them for the binding's
  // declaration and drops the import (dead-code elimination never removes
  // overload signatures). Source: #8505.
  // Impact: in a project without `verbatimModuleSyntax`, the route module
  // fails to load ("Export 'helper' is not defined").
  test.fails(
    'an overloaded function the route module and a split loader share keeps working',
    async () => {
      expect(await callSharedHelper(overloadedHelper, false)).toEqual([
        true,
        'before',
        42,
      ])
    },
  )
})

describe('code that reads a split binding', () => {
  /**
   * Loads a route whose component is `Page`, declared next to `exports`, in
   * a production compile, and returns what the route renders, what the
   * component `read` gets from the route module's export `name` (as another
   * module of the app imports it) renders, and
   * whether `Page` is split or the user is told it is not (a warning naming
   * the route file and `Page` or `component`).
   */
  async function renderPage(
    exports: string,
    name: string,
    read: (imported: any) => unknown = (imported) => imported,
  ) {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
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
      const rendered = await route.render('component')
      const bindings = await route.importBindings([name])
      return {
        rendered: [rendered, await renderComponent(read(bindings[name]))],
        splitOrReported:
          (await route.isLazy('component')) ||
          reportsNotSplit(warn, route.ids.reference!),
      }
    } finally {
      warn.mockRestore()
    }
  }

  // Control for the pin below (same harness, an export that does not read
  // `Page`).
  test('a split component renders next to another export', async () => {
    expect(
      await renderPage(`export const Label = wrap(() => 'label')`, 'Label'),
    ).toEqual({ rendered: ['<p>page</p>', 'label'], splitOrReported: true })
  })

  // Bug: when a route option names a binding that the code splitter moves
  // into a chunk, the splitter deletes the binding's declaration from the
  // route module (`removeIdentifierLiteral`), even when other code there
  // still reads it. Only `export function`/`export const` declarations are
  // checked, so export lists, aliases and exports that use the binding lose
  // it. Source: #8505 (`export { component as View }`), gap O7.
  // A fix may also leave `Page` unsplit, but must then tell the user, in
  // production builds too (decision D11): unsplit and silent is still this
  // bug.
  // Impact: the route module throws when it loads ("Page is not defined",
  // "Export 'Page' is not defined"), so the route never renders.
  test.fails.each([
    {
      name: 'an exported object',
      exports: 'export const meta = { fn: Page }',
      imported: 'meta',
      read: (meta: { fn: unknown }) => meta.fn,
    },
    {
      name: 'an exported function',
      exports: 'export function Preview() { return <Page /> }',
      imported: 'Preview',
    },
    {
      name: 'a default export',
      exports: 'export default wrap(Page)',
      imported: 'default',
    },
    {
      name: 'an export list',
      exports: 'export { Page }',
      imported: 'Page',
    },
    {
      name: 'an export alias',
      exports: 'export { Page as View }',
      imported: 'View',
    },
    {
      // Source: #8504 (lost case L4).
      name: 'a default export by specifier',
      exports: 'export { Page as default }',
      imported: 'default',
    },
  ])(
    'a split component that $name reads renders from both',
    async ({ exports, imported, read }) => {
      expect(await renderPage(exports, imported, read)).toEqual({
        rendered: ['<p>page</p>', '<p>page</p>'],
        splitOrReported: true,
      })
    },
  )

  // Bug: same root cause as above, for a function that module-level code
  // keeps reachable: it renders the split component, whose declaration the
  // route module lost. The registry is created, filled and subscribed to
  // once, also after the chunk loads (a chunk that runs that code again
  // makes a second registry). Source: #8504 (code-splitter-dead-code.test.ts).
  // Impact: the route module throws when it loads ("Page is not defined").
  test.fails.each([
    {
      name: 'module-level code registers',
      setup: `registry.set('preview', Preview)`,
      subscribes: 0,
    },
    {
      name: 'an unused subscription calls back',
      setup: `const unsubscribe = subscribe((name) => registry.set(name, Preview))`,
      subscribes: 1,
    },
  ])(
    'a split component renders through a function $name',
    async ({ setup, subscribes }) => {
      const runs = { registries: 0, sets: 0, subscribes: 0 }
      const route = await loadRoute(
        `${head}import { createRegistry, subscribe } from './subscribe'
const registry = createRegistry()
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
          stubs: {
            './subscribe': {
              createRegistry: () => {
                runs.registries++
                const map = new Map<string, unknown>()
                return {
                  get: (name: string) => map.get(name),
                  set: (name: string, value: unknown) => {
                    runs.sets++
                    map.set(name, value)
                  },
                }
              },
              subscribe: (callback: (name: string) => void) => {
                runs.subscribes++
                callback('preview')
              },
            },
          },
        },
      )
      // The loader returns the element `Preview` renders
      const element = route.options.loader()
      const loaded = await renderComponent(() => element)
      const rendered = await route.render('component')
      expect([loaded, rendered, runs]).toEqual([
        '<p>page</p>',
        '<p>page</p>',
        { registries: 1, sets: 1, subscribes },
      ])
    },
  )

  // Bug: same root cause as above, for an unsplit option that names the
  // split component. Source: corpus-diff, bex-co/bex
  // src/routes/databases.$databaseId.tsx (`component: Page,
  // pendingComponent: Page`); #8504 (code-splitter-route-options.test.ts),
  // where it passes.
  // Impact: the route module throws when it loads ("Page is not defined").
  test.fails(
    'a component read by a split and an unsplit option renders from both',
    async () => {
      const route =
        await loadRoute(`${head}export const Route = createFileRoute('/')({
  component: Page,
  pendingComponent: Page,
})
function Page() {
  return <p>{typeof Route}</p>
}
`)
      expect([
        await route.render('pendingComponent'),
        await route.render('component'),
      ]).toEqual(['<p>object</p>', '<p>object</p>'])
    },
  )

  // Bug: same root cause as above, for an unsplit option that reads the
  // split component (which reads `Route`, so it moves to its chunk) with
  // `typeof`. Reading an undeclared name with `typeof` does not throw, so
  // the route module loads and the option silently sees `'undefined'`.
  // Source: fuzzing (oracle mode, round 2: `beforeLoad` and `loaderDeps`
  // readers of components of the repository's e2e routes).
  // Impact: code that checks the component (`typeof Page === 'function'`)
  // takes the wrong branch on every navigation, with no error.
  test.fails(
    'an unsplit option that reads the split component with typeof sees a function',
    async () => {
      const route =
        await loadRoute(`${head}export const Route = createFileRoute('/')({
  component: Page,
  beforeLoad: () => typeof Page,
})
function Page() {
  return <p>{typeof Route}</p>
}
`)
      expect([
        route.options.beforeLoad(),
        await route.render('component'),
      ]).toEqual(['function', '<p>object</p>'])
    },
  )

  // Bug: same root cause as above, for a top-level call that reads the split
  // component. The call runs once, also after the chunk loads (a chunk that
  // calls `register` again registers a second component). Source: #8504
  // (differential fuzzing).
  // Impact: the route module throws when it loads ("Page is not defined").
  test.fails(
    'a split component that a top-level call reads renders from both',
    async () => {
      const registered: Array<unknown> = []
      const route = await loadRoute(
        `${head}import { register } from './registry'
function Page() {
  return <div>page</div>
}
export const Route = createFileRoute('/')({ component: Page })
register(Page)
`,
        {
          stubs: {
            './registry': {
              register: (component: unknown) => {
                registered.push(component)
              },
            },
          },
        },
      )
      const rendered = await route.render('component')
      expect([
        await Promise.all(
          registered.map((component) => renderComponent(component)),
        ),
        rendered,
      ]).toEqual([['<div>page</div>'], '<div>page</div>'])
    },
  )

  // Control for the imported-component pins below (same harness): the split
  // component is declared in the route file.
  test('a split component declared in the route file renders, and head() reads it', async () => {
    const route = await loadRoute(`${head}function PostsPage() {
  return <p>posts</p>
}
PostsPage.title = 'Posts'
export const Route = createFileRoute('/posts')({
  component: PostsPage,
  head: () => ({ meta: [{ title: PostsPage.title }] }),
})
`)
    expect([route.options.head(), await route.render('component')]).toEqual([
      { meta: [{ title: 'Posts' }] },
      '<p>posts</p>',
    ])
  })

  // Bug: when a split option names an imported binding, the code splitter
  // deletes its import specifier from the route module
  // (`removeIdentifierLiteral` removes the binding without checking for other
  // reads), then the emptied import, even when other code there still reads
  // it: an unsplit option, an exported function or anything else. Sibling of
  // the pins above, which cover bindings declared in the route file.
  // Source: compilers.ts:571-593 (`removeIdentifierLiteral`), :1555-1593
  // (the binding is removed), :768-777 (the emptied import is dropped);
  // fuzzing (oracle mode, N1).
  // Impact: the route throws "PostsPage is not defined" where the other code
  // runs (head() on every navigation, an importer's render).
  test.fails(
    'an imported split component that head() reads renders, and head() reads it',
    async () => {
      const route = await loadRoute(
        `${head}import { PostsPage } from './posts-page'
export const Route = createFileRoute('/posts')({
  component: PostsPage,
  head: () => ({ meta: [{ title: PostsPage.title }] }),
})
`,
        {
          stubs: {
            './posts-page': {
              PostsPage: Object.assign(() => 'posts', {
                title: 'Posts',
              }),
            },
          },
        },
      )
      expect([route.options.head(), await route.render('component')]).toEqual([
        { meta: [{ title: 'Posts' }] },
        'posts',
      ])
    },
  )

  // Bug: same root cause as above, for an exported component that renders
  // the imported split one, used by another module of the app (ruling P1:
  // through a real importer, not the export list). Adapted from the
  // repository's
  // examples/solid/start-supabase-basic/src/routes/_authed/posts.$postId.tsx
  // (written for React here: Solid cannot run in process; the code splitter
  // handles the import the same way for every framework).
  // Impact: rendering `PostErrorComponent` throws "ErrorComponent is not
  // defined".
  test.fails(
    'an imported split errorComponent that an exported component renders works for an importer',
    async () => {
      const route = await loadRoute(
        `import { ErrorComponent, createFileRoute } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
export const Route = createFileRoute('/posts/$postId')({
  loader: ({ params: { postId } }) => postId,
  errorComponent: ErrorComponent,
  component: PostComponent,
})
export function PostErrorComponent({ error }: ErrorComponentProps) {
  return <ErrorComponent error={error} />
}
function PostComponent() {
  return <h4>post</h4>
}
`,
      )
      const importer = await route.importFromRoute(
        `export { PostErrorComponent } from '${routeSpecifier}'`,
      )
      const error = new Error('boom')
      const routeError = await route.render('errorComponent', { error })
      expect(routeError).toContain('boom')
      expect([
        await renderComponent(importer.PostErrorComponent, { error }),
        await route.render('component'),
      ]).toEqual([routeError, '<h4>post</h4>'])
    },
  )

  // Bug: same root cause as above, for a pendingComponent that custom
  // groupings split and an unsplit errorComponent renders.
  // Impact: rendering the errorComponent throws "Spinner is not defined".
  test.fails(
    'an imported pendingComponent split by custom groupings renders, and an unsplit option renders it',
    async () => {
      const route = await loadRoute(
        `${head}import { Spinner } from './spinner'
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['component'], ['pendingComponent']],
  pendingComponent: Spinner,
  errorComponent: () => <div><Spinner /></div>,
  component: () => <p>page</p>,
})
`,
        { stubs: { './spinner': { Spinner: () => 'spin' } } },
      )
      expect([
        await route.render('errorComponent'),
        await route.render('pendingComponent'),
      ]).toEqual(['<div>spin</div>', 'spin'])
    },
  )
})

describe('class components', () => {
  const classPage = `class Page extends Component {
  render() {
    return <p>page</p>
  }
}`

  // Control for the class pin below (same harness, a function component).
  test('a function component declared in the route file renders', async () => {
    const route = await loadRoute(`${head}function Page() {
  return 'page'
}
export const Route = createFileRoute('/')({ component: Page })
`)
    expect(await route.render('component')).toBe('page')
  })

  // Bug: a route option that names a class cannot be split: the virtual
  // compiler throws "Unexpected splitNode type ☝️: ClassDeclaration".
  // A class only the route option reads must be split like a function
  // component (our limitation otherwise, decision D11). A fix may leave an
  // exported class unsplit, but must then tell the user, in production
  // builds too.
  // JavaScript route files: the route types of React accept function
  // components only (TS2322 for a class).
  // Source: #8505 (`export class component {}`).
  // Impact: a route whose component is a class component cannot be built
  // once code splitting is on.
  test.fails.each([
    { declaration: classPage, exported: false },
    { declaration: `export ${classPage}`, exported: true },
  ])(
    'a class component declared in the route file renders (exported: $exported)',
    async ({ declaration, exported }) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const route = await loadRoute(
          `${head}import { Component } from 'react'
${declaration}
export const Route = createFileRoute('/')({ component: Page })
`,
          { filename: 'route.jsx' },
        )
        expect({
          rendered: await route.render('component'),
          split: exported
            ? (await route.isLazy('component')) ||
              reportsNotSplit(warn, route.ids.reference!)
            : await route.isLazy('component'),
        }).toEqual({ rendered: '<p>page</p>', split: true })
      } finally {
        warn.mockRestore()
      }
    },
  )

  // Bug: same root cause as above. Once split, the class's static fields
  // and what they import belong to its chunk.
  // Source: Next.js ssg/getStaticProps/should-support-class-exports; #8504
  // (code-splitter-dead-code.test.ts), where it passes.
  test.fails(
    'a class component and the imports of its static fields leave the route module',
    async () => {
      const route = await loadRoute(
        `${head}import { Component } from 'react'
import { format } from './format'
class Page extends Component {
  static title = format('home')
  render() {
    return <p>{Page.title}</p>
  }
}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: Page,
})
`,
        {
          filename: 'route.jsx',
          stubs: {
            './format': { format: (value: string) => `[${value}]` },
          },
        },
      )
      expect([
        route.eager.includes('./format'),
        await route.render('component'),
      ]).toEqual([false, '<p>[home]</p>'])
    },
  )
})

describe('side-effect imports', () => {
  /** Stubs of `./setup` and `./Page` that record when each module runs. */
  function recordingStubs(log: Array<string>) {
    const Page = () => 'page'
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
    expect(await route.render('component')).toBe('page')
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
      expect(await route.render('component')).toBe('page')
    },
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
   * emitted module imports `./secret-db`, which server-only options the
   * route still has, and what it renders.
   */
  async function compileForClient(code: string) {
    const route = await loadRoute(code, {
      deleteNodes,
      stubs: {
        './secret-db': db,
        './opts': { makeOpts: (options: unknown) => options },
      },
    })
    return {
      serverImports: Object.values(route.modules).filter((module) =>
        importSources(module).includes('./secret-db'),
      ).length,
      serverOptions: deleteNodes.filter((key) => key in route.options),
      rendered: await route.render('component'),
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
      code: `${head}import { db } from './secret-db'
export const Route = createFileRoute('/')({
${serverOptions}
})`,
    },
    {
      name: 'a root route',
      code: `import { createRootRoute } from '@tanstack/react-router'
import { db } from './secret-db'
export const Route = createRootRoute({
${serverOptions}
})`,
    },
    {
      name: 'a root route with context',
      code: `import { createRootRouteWithContext } from '@tanstack/react-router'
import { db } from './secret-db'
export const Route = createRootRouteWithContext<{ user: string }>()({
${serverOptions}
})`,
    },
  ])(
    'server-only options of $name written as properties are removed with their imports',
    async ({ code }) => {
      expect(await compileForClient(code)).toEqual(stripped)
    },
  )

  // The Solid router cannot run in process (it ships client-only APIs to
  // Node): what the client compile of a Solid route still holds is checked
  // here, the built Solid app runs in integration/build-frameworks.test.ts.
  // Every emitted module is valid (no name the route file binds, such as
  // `db`, is left without its binding), none imports `./secret-db`, and no
  // object literal of any emitted module (the route's options among them)
  // still has an `ssr`, `server` or `headers` property.
  test('server-only options of a Solid file route written as properties are removed with their imports', async () => {
    const { modules } = await compileRouteModules(
      `import { createFileRoute } from '@tanstack/solid-router'
import { db } from './secret-db'
export const Route = createFileRoute('/')({
${serverOptions}
})`,
      { deleteNodes, targetFramework: 'solid' },
    )
    await expectValidModules(modules)
    /** Keys of the object literals of a module that name a deleted option. */
    const deletedKeys = (code: string) => {
      const keys: Array<string> = []
      const visit = (node: unknown): void => {
        if (Array.isArray(node)) {
          node.forEach(visit)
          return
        }
        if (!node || typeof node !== 'object') {
          return
        }
        const value = node as Record<string, any>
        if (value.type === 'Property' && !value.computed) {
          const key =
            value.key?.type === 'Identifier' ? value.key.name : value.key?.value
          if (deleteNodes.includes(key)) {
            keys.push(key)
          }
        }
        for (const child of Object.values(value)) {
          if (child && typeof child === 'object') {
            visit(child)
          }
        }
      }
      visit(parseModule(code))
      return keys
    }
    expect(
      Object.values(modules).map((module) => ({
        importsSecret: importSources(module).includes('./secret-db'),
        deletedKeys: deletedKeys(module),
      })),
    ).toEqual(
      Object.values(modules).map(() => ({
        importsSecret: false,
        deletedKeys: [],
      })),
    )
  })

  // Without `deleteNodes` (a Router app without Start), the options are the
  // route's own and stay.
  test('server-only options stay without deleteNodes', async () => {
    const route = await loadRoute(
      `${head}import { db } from './secret-db'
export const Route = createFileRoute('/')({
${serverOptions}
})`,
      { stubs: { './secret-db': db } },
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
        await compileForClient(`${head}import { db } from './secret-db'
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
          `${head}import { db } from './secret-db'\n${code}`,
        )
      } catch (error) {
        // A refusal names the route file and the server-only option
        expect(String(error)).toMatch(/route\.tsx/)
        expect(String(error)).toMatch(/\bserver\b/)
        return
      }
      expect(result).toEqual(stripped)
    },
  )

  // Bug: a route whose options object is wrapped in a TypeScript cast or a
  // `satisfies` (statically visible options, valid TypeScript) keeps its
  // server-only options and their imports on the client. Unlike opaque
  // options above, these must be removed: the options are written in the
  // file, so refusing the route is not an option.
  // Source: the #8504 confidence campaign (suspects SU-4/8; 4 corpus files
  // in 3 repositories cast their options, `as never` or `as any`, when the
  // handlers' types do not fit); V1 split F35.
  // Impact: Start's client bundle ships server handlers and their
  // server-only imports (build-level canary in
  // integration/known-bugs-code-splitter-client-output.test.ts).
  test.fails.each(['as never', 'as any', 'satisfies object'])(
    'a server-only option of options wrapped in `%s` is removed with its imports',
    async (cast) => {
      expect(
        await compileForClient(`${head}import { db } from './secret-db'
export const Route = createFileRoute('/')({
  server: { handlers: { GET: () => db.all() } },
  component: () => <p>x</p>,
} ${cast})`),
      ).toEqual(stripped)
    },
  )
})
