/**
 * Known code-splitter bugs. Each test asserts correct behaviour for a bug on
 * main and is marked .fails; remove .fails when the bug is fixed.
 *
 * Every route is loaded the way an app loads it (`./route-app`): the public
 * router plugin in a real Vite dev server, and each check run in a real
 * browser page. The modules the route file imports are files of the app;
 * the page reads what they record. The other known code-splitter bugs are in
 * `known-bugs-code-splitter-{shapes,bindings,server}.test.ts`.
 */

import { parseSync } from 'vite'
import { describe, expect, test } from 'vitest'
import { head, holdsMarker, loadRoute } from '../../route-app'

/**
 * The modules of the app the served module `code` depends on (static
 * imports, re-exports and dynamic imports), as the requests the dev server
 * resolved them to (`/lib.ts`): an independent parse of what the page
 * receives, for SPEC J2.5 checks that a split chunk does not depend on a module of
 * the app that its option does not use (SPEC J2.5).
 */
function dependencies(code: string) {
  const { module } = parseSync('module.js', code, { sourceType: 'module' })
  const requests = [
    ...module.staticImports.map((statement) => statement.moduleRequest.value),
    ...module.staticExports.flatMap((statement) =>
      statement.entries.flatMap((entry) =>
        entry.moduleRequest ? [entry.moduleRequest.value] : [],
      ),
    ),
    ...module.dynamicImports.map((dynamicImport) =>
      code
        .slice(
          dynamicImport.moduleRequest.start,
          dynamicImport.moduleRequest.end,
        )
        .replace(/^['"`]|['"`]$/g, ''),
    ),
  ]
  return requests.map((request) => request.split('?')[0]!)
}

/**
 * `./state`: `init` returns its argument and `register` pushes an item;
 * `calls` counts the calls of both.
 */
const stateFile = `export let calls = 0
export const init = <T>(value: T) => {
  calls++
  return value
}
export const register = (items: Array<string>) => {
  calls++
  items.push('item')
}
`

describe('module state shared with split chunks', () => {
  // Control for loadRoute: a top-level const read by the loader and the split
  // component moves to the shared module and is initialized once.
  test('a const read by the loader and the split component is initialized once', async () => {
    const route = await loadRoute(
      `${head}import { init } from './state'
const value = init(1)
export const Route = createFileRoute('/')({
  loader: () => value,
  component: () => <p>{value}</p>,
  errorComponent: () => <p>error</p>,
})`,
      { files: { 'state.ts': stateFile } },
    )
    // (When the shared initializer runs, with the route module or with the
    // first chunk that needs it, is free: SPEC G3.)
    expect(
      await route.run(`return [
  options.loader(),
  await render('component'),
  await render('errorComponent'),
  (await app('state.ts')).calls,
]`),
    ).toEqual([1, '<p>1</p>', '<p>error</p>', 1])
  })

  // Bug: a binding that an option with a computed key and a split option
  // both read is created twice: the computed-key option is not seen as a
  // reader of the route module.
  // Source: round-3 mutation testing (compilers-A).
  // Impact: module state is created twice (two stores, registrations run
  // twice).
  test('a binding read by a computed-key option and a split option is created once', async () => {
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
      { files: { 'state.ts': stateFile } },
    )
    expect(
      await route.run(
        `return [await render('component'), (await app('state.ts')).calls]`,
      ),
    ).toEqual(['<p>1</p>', 1])
  })

  // Bug: a `var` nested in a statement, an enum or a namespace is not shared.
  // The `var` is missed because module bindings are collected from top-level
  // declarations only (`collectLocalBindingsFromStatement`); same root cause
  // as the nested-block `var` pin in
  // start-plugin-core/tests/known-bugs-hydrate.test.ts.
  // Impact: the route throws a ReferenceError or runs the declaration per module.
  test.each([
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
    // Source: mutation testing of #8504 (a direct read takes another path
    // than a read through a helper).
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
      const route = await loadRoute(
        `${head}import { init } from './state'
${declaration}
export const Route = createFileRoute('/')({
  loader: () => ${read},
  component: () => <p>{${read}}</p>,
})`,
        { files: { 'state.ts': stateFile } },
      )
      expect(
        await route.run(`return [
  options.loader(),
  await render('component'),
  (await app('state.ts')).calls,
]`),
      ).toEqual([1, '<p>1</p>', 1])
    },
  )

  // Bug: a top-level statement that writes a binding stays in the reference
  // module when the binding moves to the shared module or a split chunk.
  // Impact: the write throws (an import is read-only, or the moved binding is
  // not declared there) or runs after the shared declarations that it should
  // precede.
  test.each<{
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
      const route = await loadRoute(
        `${head}${setup}
export const Route = createFileRoute('/')({
  loader: () => ${loader},
  component: ${component},
})`,
        { filename, files: { 'state.ts': stateFile } },
      )
      expect(
        await route.run(`return [
  options.loader(),
  await render('component'),
  (await app('state.ts')).calls,
]`),
      ).toEqual([...expected, inits])
    },
  )

  // Bug: shared bindings are computed from the statically named route options
  // only (`computeSharedBindings` skips computed keys), so a declaration that
  // one split chunk reads and that the reference module keeps as well (for an
  // export, a top-level call, another binding of the declaration, or a route
  // option under a computed key, pinned above) is not shared: the chunk
  // declares its own copy.
  // Impact: module state is duplicated; the component reads another instance.
  test.each([
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
      const route = await loadRoute(
        `${head}import { init, register } from './state'
${declaration}
export const Route = createFileRoute('/')({
${options}  component: () => <p>${render}</p>,
})`,
        { files: { 'state.ts': stateFile } },
      )
      expect(
        await route.run(
          `return [await render('component'), (await app('state.ts')).calls]`,
        ),
      ).toEqual([html, 1])
    },
  )

  // The row below compiles like the rows above (the initializer moves to the
  // chunk, SPEC G3) and passes alone and under COMPILER_TESTS_PINS=run, but
  // in this file's order the page's `app('state.ts')` and the chunk get two
  // instances of `state.ts` (a timestamped URL on one side): a harness
  // sequencing issue to resolve, kept pinned until then.
  test.fails.each([
    {
      name: 'a type alias that reads it',
      // Source: real apps: route files that derive a type with
      // `type FormValues = z.infer<typeof schema>`
      declaration: `const value = init(1)
type Value = typeof value`,
      render: '{value satisfies Value}',
      html: '<p>1</p>',
    },
  ])(
    'module state that the reference module keeps for $name is initialized once',
    async ({ declaration, options = '', render, html }) => {
      const route = await loadRoute(
        `${head}import { init, register } from './state'
${declaration}
export const Route = createFileRoute('/')({
${options}  component: () => <p>${render}</p>,
})`,
        { files: { 'state.ts': stateFile } },
      )
      expect(
        await route.run(
          `return [await render('component'), (await app('state.ts')).calls]`,
        ),
      ).toEqual([html, 1])
    },
  )

  /**
   * Loads a route with a component and an errorComponent next to the
   * top-level `effect`, which calls `track` or `subscribe` (`./effects`,
   * which counts the calls), loads both chunks and asserts that the effect
   * ran once, with the route module.
   */
  async function expectEffectRunsOnce(effect: string) {
    const route = await loadRoute(
      `${head}import { subscribe, track } from './effects'
${effect}
export const Route = createFileRoute('/')({
  component: () => <p>index</p>,
  errorComponent: () => <p>error</p>,
})`,
      {
        files: {
          'effects.ts': `export let calls = 0
export const track = (..._args: Array<unknown>) => calls++
export const subscribe = (listener: () => unknown) => {
  calls++
  return listener
}
`,
        },
      },
    )
    // Both chunks loaded, and the effect ran once, with the route module.
    expect(
      await route.run(`const effects = await app('effects.ts')
const callsBeforeChunks = effects.calls
const rendered = [await render('component'), await render('errorComponent')]
return [rendered, callsBeforeChunks, effects.calls]`),
    ).toEqual([['<p>index</p>', '<p>error</p>'], 1, 1])
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
  // compilers.ts:1278); the call rows: fuzzing, e.g.
  // `const parts = [BarController, BarElement]; Chart.register(...parts)`.
  // Impact: side effects run again for every chunk that loads, even a chunk
  // holding only the errorComponent (duplicated subscriptions, logging,
  // plugin registrations); every chunk depends on and re-exports all of the
  // `export *` module through the opaque namespace of its dynamic import,
  // which defeats tree-shaking of it.
  test.each([
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
    // Types read no value at runtime. Source: review of #8504 (real apps).
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
  test('split chunks do not re-export a module-level export *, which importers of the route file still get', async () => {
    const route = await loadRoute(
      `${head}export * from './lib'
export const Route = createFileRoute('/')({
  component: () => <p>index</p>,
})`,
      {
        files: {
          'lib.ts': `export const x = 1\n`,
          // Another module of the app imports a name the route file
          // re-exports (SPEC G9, J2.4: through a real importer)
          'importer.ts': `import { x } from './route'\nexport const v = x\n`,
        },
      },
    )
    const { reExported, rendered } = await route.run<{
      reExported: number
      rendered: string
    }>(`return {
  reExported: (await app('importer.ts')).v,
  rendered: await render('component'),
}`)
    expect({
      reExported,
      rendered,
      // What loading the component requests depends on `./lib` (SPEC J2.5: an
      // unrelated module of the app, by the request it resolves to)
      componentRequestsLib: (await route.loadedBy('component')).some((code) =>
        dependencies(code).includes('/lib.ts'),
      ),
    }).toEqual({
      reExported: 1,
      rendered: '<p>index</p>',
      componentRequestsLib: false,
    })
  })

  // Bug: an ambient `declare const` is handled as a module binding. Read by
  // the loader and the split component, it is shared: the shared module
  // exports a name that TypeScript erases, and the reference module and the
  // chunk import it. (Used as the split option itself: pinned in "route
  // options read from the environment".)
  // Impact: the build fails with a missing export, e.g. for a constant
  // injected with Vite's `define`.
  test('an ambient declare const read by the loader and the split component stays a global', async () => {
    const route = await loadRoute(`${head}declare const APP_VERSION: string
export const Route = createFileRoute('/')({
  loader: () => APP_VERSION,
  component: () => <p>{APP_VERSION}</p>,
})`)
    expect(
      await route.run(`return [options.loader(), await render('component')]`, {
        before: `globalThis.APP_VERSION = '1.0'`,
      }),
    ).toEqual(['1.0', '<p>1.0</p>'])
  })
})

/** `./init`: `init` returns its argument and records it in `calls`. */
const initFile = `export const calls: Array<unknown> = []
export const init = (value: unknown) => {
  calls.push(value)
  return value
}
`

describe('top-level code nothing reads at runtime', () => {
  // Bug: the route module drops a declaration that only an exported type
  // alias reads: it loses that reader when the code splitter removes the
  // alias with the other exports, and the initializer then never runs.
  // Source: #8504 (code-splitter-dead-code.test.ts), where it passes.
  // Impact: what the initializer does when the route module loads
  // (registrations, analytics, polyfills) silently stops once code splitting
  // is on.
  test.each([
    {
      name: 'a declaration only an exported type alias reads',
      setup: `const analytics = init('analytics')
export type Analytics = typeof analytics`,
      registered: ['analytics'],
    },
  ])(
    'the initializers of $name run when the route module loads',
    async ({ setup, registered }) => {
      const route = await loadRoute(
        `${head}import { init } from './init'
${setup}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>component</p>,
})
`,
        { files: { 'init.ts': initFile } },
      )
      expect(
        await route.run(
          `return [(await app('init.ts')).calls, await render('component')]`,
        ),
      ).toEqual([registered, '<p>component</p>'])
    },
  )

  // Bug: same as the type alias row above, in a route module compiled by the
  // route HMR plugin (automatic code splitting off), which runs the same
  // reference compiler. Source: review of #8504.
  // Impact: as above, in development without automatic code splitting.
  test('the initializer of a declaration only an exported type alias reads runs when a route module compiled for HMR loads', async () => {
    const route = await loadRoute(
      `${head}import { init } from './init'
const analytics = init('analytics')
export type Analytics = typeof analytics
export const Route = createFileRoute('/')({
  component: () => <p>component</p>,
})
`,
      {
        // The composed plugin's route HMR plugin compiles it in dev
        pluginOptions: { autoCodeSplitting: false },
        files: { 'init.ts': initFile },
      },
    )
    expect(await route.run(`return (await app('init.ts')).calls`)).toEqual([
      'analytics',
    ])
  })
})

describe('page code left in the route module', () => {
  /**
   * Whether `./heavy` loads with the route module (requested by it or by a
   * module it imports statically), and what the split component renders: a
   * fix must render the same and leave `./heavy` to the chunk.
   */
  async function splitComponent(code: string) {
    const route = await loadRoute(code, {
      files: { 'heavy.ts': `export const heavy = () => 'heavy'\n` },
    })
    return {
      heavyLoadsEagerly: (await route.requested()).includes('/heavy.ts'),
      rendered: await route.run(`return render('component')`),
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
  // "identifier"; real apps: Jp-K/DmCompanionAi
  // frontend_old/src/routes/_layout/chat.tsx; #8504
  // (code-splitter-dead-code.test.ts), where they pass.
  // Impact: the page's code and dependencies load with the entry chunk.
  test.each([
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
  // module is our limitation, not a pattern the user can change (SPEC
  // J2.8). Only the handler can move; the router reads the other keys
  // (`staleReloadMode`) from the route options. Today the compiler throws
  // first (same root cause as above). A compiler that builds these routes
  // but keeps a method handler, or a handler next to a spread, in the route
  // module on purpose still has this bug.
  // Impact: the loader's code loads with the entry chunk, or the route
  // cannot be built.
  test.each([
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
      // What loads with the route module loads with the entry: the
      // handler's code (its user marker, decoded) is not in it, but in what
      // loading the loader loads.
      expect({
        eagerHandler: (await route.eagerModules()).some((code) =>
          holdsMarker(code, 'MARK_handler'),
        ),
        lazyHandler:
          (await route.isLazy('loader')) &&
          (await route.loadedBy('loader')).some((code) =>
            holdsMarker(code, 'MARK_handler'),
          ),
        loaded: await route.run(`return options.loader.handler()`),
      }).toEqual({
        eagerHandler: false,
        lazyHandler: true,
        loaded: 'MARK_handler',
      })
    },
  )

  // Bug: same root cause as the object-form pins above. The router reads the
  // keys of a loader object other than `handler` (`staleReloadMode`) from the
  // route options, so they must keep working next to a split handler, and
  // module state the handler, those keys and the split component read must
  // be created once.
  // Impact: the route cannot be built once the loader is split.
  test.each([
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
      const route = await loadRoute(`${head}${code}\n`, {
        files: {
          'api.ts': `export const fetchPosts = () => 'posts'\n`,
          'store.ts': `export const created = { store: 0, theme: 0, config: 0 }
export const createStore = () => {
  created.store++
  return { get: () => 'stored' }
}
export const createTheme = () => {
  created.theme++
  return { color: 'red' }
}
export const createConfig = () => {
  created.config++
  return { mode: 'background' }
}
`,
        },
      })
      const observed = await route.run<Record<string, unknown>>(`
// The handler of a loader, in object form or not, split or not
const loader = options.loader
const handler = typeof loader === 'function' ? loader : loader.handler
return {
  loaded: await handler(),
  staleReloadMode: options.loader.staleReloadMode,
  rendered: await render('component'),
  created: (await app('store.ts')).created,
}`)
      expect({
        ...observed,
        ...('apiLoadsEagerly' in expected && {
          apiLoadsEagerly: (await route.requested()).includes('/api.ts'),
        }),
      }).toEqual(expected)
    },
  )
})
