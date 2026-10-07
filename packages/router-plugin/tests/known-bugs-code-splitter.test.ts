/**
 * Known code-splitter bugs. Each test asserts correct behaviour for a bug on
 * main and is marked .fails; remove .fails when the bug is fixed.
 */
import { parseSync } from 'vite'
import { describe, expect, test, vi } from 'vitest'
import {
  buildAndRun,
  compileRouteModules,
  declarationOf,
  evaluateModule,
  head,
  importSources,
} from './regression-helpers'

type Stubs = Record<string, Record<string, unknown>>

/**
 * The exports of an emitted module, as another emitted module imports them:
 * importing a name the module does not export throws, as in a bundler.
 */
function linkable(specifier: string, exports: Record<string, unknown>) {
  return new Proxy(exports, {
    get(target, name) {
      if (typeof name === 'string' && !(name in target)) {
        throw new Error(`"${name}" is not exported by "${specifier}"`)
      }
      return Reflect.get(target, name)
    },
  })
}

/**
 * Compiles a route file, then evaluates the modules the code splitter emits,
 * linked by import specifier: the shared module, the reference module, then
 * every split chunk the reference module imports, as once all chunks have
 * loaded. `stubs` provides the route's other imports. Returns the modules,
 * the route options and the exports of each chunk by split name.
 */
async function loadRouteModules(code: string, stubs: Stubs = {}) {
  const { modules } = compileRouteModules(code)
  const linked: Stubs = {
    ...stubs,
    '@tanstack/react-router': {
      createFileRoute: () => (options: unknown) => ({ options }),
      lazyRouteComponent: () => () => null,
    },
  }
  for (const [name, specifier] of [
    ['shared', 'route.tsx?tsr-shared=1'],
    ['reference', 'route.tsx'],
  ] as const) {
    if (modules[name]) {
      linked[specifier] = linkable(
        specifier,
        await evaluateModule(modules[name], linked),
      )
    }
  }
  const chunks: Record<string, Record<string, any>> = {}
  for (const [, split] of modules.reference!.matchAll(
    /\?tsr-split=([\w-]+)/g,
  )) {
    chunks[split!] ??= await evaluateModule(
      modules[`virtual ${split}`]!,
      linked,
    )
  }
  const { Route } = linked['route.tsx'] as { Route: { options: any } }
  return { modules, options: Route.options, chunks }
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
  // Control for loadRouteModules: a top-level const read by the loader and
  // the split component moves to the shared module and is initialized once.
  test('a const read by the loader and the split component is initialized once', async () => {
    const state = stateStub()
    const { options, chunks } = await loadRouteModules(
      `${head}import { init } from './state'
const value = init(1)
export const Route = createFileRoute('/')({
  loader: () => value,
  component: () => <p>{value}</p>,
})`,
      { './state': state },
    )
    expect([
      options.loader(),
      chunks.component!.component(),
      state.calls,
    ]).toEqual([1, '<p>1</p>', 1])
  })

  // Bug: a `var` nested in a statement, an enum or a namespace is not shared.
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
      const { options, chunks } = await loadRouteModules(
        `${head}import { init } from './state'
${declaration}
export const Route = createFileRoute('/')({
  loader: () => ${read},
  component: () => <p>{${read}}</p>,
})`,
        { './state': state },
      )
      expect([
        options.loader(),
        chunks.component!.component(),
        state.calls,
      ]).toEqual([1, '<p>1</p>', 1])
    },
  )

  // Bug: a `let` the loader reassigns is shared, so the route module assigns
  // to a read-only import ("Cannot assign to import").
  // Impact: the route cannot be built as soon as code splitting is on.
  // Needs a real build: imports are live bindings, and the in-process harness
  // snapshots them, so even a correct fix would read a stale value there.
  test.fails(
    'a let the loader reassigns stays writable and the split component reads its value',
    async () => {
      const result = await buildAndRun(
        `${head}let count = 0
export const Route = createFileRoute('/')({
  loader: () => { count++; return count },
  component: () => <p>{count}</p>,
})`,
        `const loaded = [await entry.Route.options.loader({}), await entry.Route.options.loader({})]
return [...loaded, await entry.render(entry.Route.options.component)]`,
      )
      expect(result).toEqual([1, 2, '<p>2</p>'])
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
      setup: `const plugins: Array<string> = []
plugins.push('auth')
const store = { plugins: [...plugins] }
plugins.push('late')`,
      loader: 'store.plugins',
      component: '() => <p>{store.plugins.join()}</p>',
      expected: [['auth'], '<p>auth</p>'],
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
    async ({ setup, loader, component, expected, split }) => {
      const { modules, options, chunks } =
        await loadRouteModules(`${head}${setup}
export const Route = createFileRoute('/')({
  loader: () => ${loader},
  component: ${component},
})`)
      expect([options.loader(), chunks.component!.component()]).toEqual(
        expected,
      )
      if (split) {
        // The component is still split out of the route module.
        expect(modules.reference).not.toMatch(declarationOf(split))
      }
    },
  )

  // Bug: a declaration the reference module also keeps is copied into chunks.
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
      declaration: `const theme = init('dark')
export function ThemeProvider() {
  return theme
}`,
      render: '{theme}',
      html: '<p>dark</p>',
    },
    {
      name: 'an exported function over private state',
      declaration: `const state = init({ count: 0 })
export function increment() {
  return ++state.count
}`,
      render: '{increment()}',
      html: '<p>1</p>',
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
  ])(
    'module state that the reference module keeps for $name is initialized once',
    async ({ declaration, render, html }) => {
      const state = stateStub()
      const { chunks } = await loadRouteModules(
        `${head}import { init, register } from './state'
${declaration}
export const Route = createFileRoute('/')({
  component: () => <p>${render}</p>,
})`,
        { './state': state },
      )
      expect([chunks.component!.component(), state.calls]).toEqual([html, 1])
    },
  )

  // Bug: top-level side effects that nothing references (an `if` block, or a
  // declaration whose binding is unused) are copied into every split chunk.
  // Impact: they run again for every chunk that loads, even for a chunk
  // holding only the errorComponent (duplicated subscriptions, logging).
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
  ])(
    'an unreferenced top-level side effect ($name) runs once',
    async ({ effect }) => {
      let calls = 0
      await loadRouteModules(
        `${head}import { subscribe, track } from './effects'
${effect}
export const Route = createFileRoute('/')({
  component: () => <p>index</p>,
})`,
        {
          './effects': {
            track: () => calls++,
            subscribe: (listener: () => void) => {
              calls++
              return listener
            },
          },
        },
      )
      expect(calls).toBe(1)
    },
  )

  // Bug: an ambient `declare const` read by the loader and the split
  // component is shared: the shared module exports a name that TypeScript
  // erases, and the reference module and the chunk import it.
  // Impact: the build fails with a missing export, e.g. for a constant
  // injected with Vite's `define`.
  test.fails(
    'an ambient declare const read by the loader and the split component stays a global',
    async () => {
      vi.stubGlobal('APP_VERSION', '1.0')
      try {
        const { options, chunks } =
          await loadRouteModules(`${head}declare const APP_VERSION: string
export const Route = createFileRoute('/')({
  loader: () => APP_VERSION,
  component: () => <p>{APP_VERSION}</p>,
})`)
        expect([options.loader(), chunks.component!.component()]).toEqual([
          '1.0',
          '<p>1.0</p>',
        ])
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

  function loadWithSplitLoader(loader: string) {
    return buildAndRun(
      `${head}export const Route = createFileRoute('/')({
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

  // Bug: a module-level `export * from` is copied into every split chunk.
  // Impact: every chunk depends on and re-exports that module.
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
})
