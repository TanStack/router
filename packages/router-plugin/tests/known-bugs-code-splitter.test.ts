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
 * loaded. `stubs` provides the route's other imports; `beforeChunksLoad` runs
 * once the route module has loaded. Returns the modules, the route options
 * and the exports of each chunk by split name.
 */
async function loadRouteModules(
  code: string,
  stubs: Stubs = {},
  beforeChunksLoad?: () => void,
) {
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
  beforeChunksLoad?.()
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
    let callsBeforeChunks: number | undefined
    const { options, chunks } = await loadRouteModules(
      `${head}import { init } from './state'
const value = init(1)
export const Route = createFileRoute('/')({
  loader: () => value,
  component: () => <p>{value}</p>,
  errorComponent: () => <p>error</p>,
})`,
      { './state': state },
      () => {
        callsBeforeChunks = state.calls
      },
    )
    expect([
      options.loader(),
      chunks.component!.component(),
      chunks.errorComponent!.errorComponent(),
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
      const { modules, options, chunks } = await loadRouteModules(
        `${head}${setup}
export const Route = createFileRoute('/')({
  loader: () => ${loader},
  component: ${component},
})`,
        { './state': state },
      )
      expect([
        options.loader(),
        chunks.component!.component(),
        state.calls,
      ]).toEqual([...expected, inits])
      if (split) {
        // The component is still split out of the route module.
        expect(modules.reference).not.toMatch(declarationOf(split))
      }
    },
  )

  // Bug: shared bindings are computed from the route options only
  // (`computeSharedBindings`), so a declaration that one split chunk reads
  // and that the reference module keeps as well (for an export, a top-level
  // call, or another binding of the declaration) is not shared: the chunk
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

  // Bug: split chunks keep the top-level statements that nothing references
  // unless they are expression statements: dead-code elimination only removes
  // what the split made unreferenced, and
  // `stripUnreferencedTopLevelExpressionStatements` only strips expression
  // statements, so an `if` block, a declaration whose binding is never read
  // or an `export * from` is copied into every split chunk.
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
  ])(
    'an unreferenced top-level side effect ($name) runs once, with the route module',
    async ({ effect }) => {
      let calls = 0
      let callsBeforeChunks: number | undefined
      const { chunks } = await loadRouteModules(
        `${head}import { subscribe, track } from './effects'
${effect}
export const Route = createFileRoute('/')({
  component: () => <p>index</p>,
  errorComponent: () => <p>error</p>,
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
        () => {
          callsBeforeChunks = calls
        },
      )
      // Both chunks loaded, and the effect ran once, with the route module.
      expect([
        Object.keys(chunks).sort().join(),
        callsBeforeChunks,
        calls,
      ]).toEqual(['component,errorComponent', 1, 1])
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
        const { options, chunks } = await loadRouteModules(route)
        expect([
          ...(options.loader ? [options.loader()] : []),
          chunks.component!.component!(),
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
   * The component the route renders: the route option itself, or the export
   * of the chunk the option was split into.
   */
  async function routeComponent(code: string, stubs: Stubs = {}) {
    const { modules, options, chunks } = await loadRouteModules(code, stubs)
    return /\?tsr-split=component\b/.test(modules.reference!)
      ? chunks.component?.component
      : options.component
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
      const { chunks } = await loadRouteModules(
        `${pragma}${head}export const Route = createFileRoute('/')({
  component: () => <div>page</div>,
  errorComponent: () => jsx('b', null, 'error'),
})`,
        { '@emotion/react': emotion },
      )
      expect(chunks.component!.component()).toBe(
        '<emotion:div>page</emotion:div>',
      )
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
})
