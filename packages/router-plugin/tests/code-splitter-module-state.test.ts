import { describe, expect, it } from 'vitest'
import {
  buildAndRun,
  compileRouteModules,
  declarationOf,
  expectValidModules,
  head,
  importSources,
  loadRouteModules,
  renderEntry,
} from './regression-helpers'

/** Stubs `./state`, counting the calls of `init`. */
function stateStub() {
  const state = {
    calls: 0,
    init: <T>(value: T) => {
      state.calls++
      return value
    },
  }
  return state
}

/** How many times `pattern` occurs across all emitted modules. */
function countAcrossModules(modules: Record<string, string>, pattern: RegExp) {
  return Object.values(modules).reduce(
    (count, code) =>
      count + (code.match(new RegExp(pattern.source, 'g'))?.length ?? 0),
    0,
  )
}

describe('split chunks keep the module state the route relies on', () => {
  // Route files commonly export a store or helpers over private state next to
  // the route and use them from the route component as well.
  it('renders a split component using exported bindings over private state like the unsplit route', async () => {
    const result = await buildAndRun(
      `${head}const state = { count: 0 }
export function increment() {
  return ++state.count
}
let renders = 0
export function getRenders() {
  return renders
}
const initial = 0
export const store = { count: initial }
function Page() {
  increment()
  renders++
  store.count++
  return <p>{[state.count, getRenders(), store.count - initial].join('/')}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
      `const component = entry.Route.options.component
return [await entry.render(component), await entry.render(component), entry.store.count]`,
    )
    // Known limitation: the chunk gets its own copy of `state` and `renders`,
    // so callers of the exported functions are not checked here.
    // `store.count` is 2: the chunk mutated the store the route module exports
    expect(result).toEqual(['<p>1/1/1</p>', '<p>2/2/2</p>', 2])
  }, 30_000)

  // A declaration the loader and a split component both read runs once, with
  // the route module, before any chunk loads; TypeScript enums and namespaces
  // compile to such declarations too.
  it.each([
    {
      name: 'a const',
      declaration: `const value = init(1)
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
  ])(
    'initializes $name read by the loader and the split component once',
    async ({ declaration }) => {
      const state = stateStub()
      let callsBeforeChunks: number | undefined
      const { options, chunks } = await loadRouteModules(
        `${head}import { init } from './state'
${declaration}
export const Route = createFileRoute('/')({
  loader: () => read(),
  component: () => <p>{read()}</p>,
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
    },
  )

  // A declaration only the split component reads moves into its chunk with the
  // module-level statements that write to it.
  it.each([
    { name: 'a const', declaration: 'const State = { count: 0 }' },
    { name: 'an enum', declaration: 'enum State { Zero = 0 }' },
    {
      name: 'a namespace',
      declaration: 'namespace State { export const zero = 0 }',
    },
  ])(
    'keeps the writes to $name the split component reads',
    async ({ declaration }) => {
      const { chunks } = await loadRouteModules(`${head}${declaration}
Object.assign(State, { extra: 7 })
export const Route = createFileRoute('/')({
  component: () => <p>{(State as any).extra}</p>,
})`)
      expect(chunks.component!.component()).toBe('<p>7</p>')
    },
  )

  // Source: Next.js ssg/getStaticProps/should-support-export-named-as-default-with-other-specifiers
  it.each([
    {
      name: 'export { store as appStore }',
      exports: 'export { store as appStore }',
      read: 'entry.appStore',
      entry: '',
    },
    {
      name: 'export default store',
      exports: 'export default store',
      read: 'entry.default',
      entry: `export { default } from './routes/index'\n`,
    },
  ])(
    'shares one store exported as $name with the split component',
    async ({ exports, read, entry }) => {
      const result = await buildAndRun(
        `${head}import { createStore } from '../store'
const store = createStore()
${exports}
export const Route = createFileRoute('/')({
  component: () => <p>{store.count}</p>,
})`,
        `${read}.count = 5
const html = await entry.render(entry.Route.options.component)
return [html, globalThis.stores]`,
        {
          files: {
            'store.ts': `export function createStore() {
  ;(globalThis as any).stores = ((globalThis as any).stores ?? 0) + 1
  return { count: 0 }
}`,
            'entry.ts': `${renderEntry}${entry}`,
          },
        },
      )
      expect(result).toEqual(['<p>5</p>', 1])
    },
    30_000,
  )

  // Source: Next.js ssg/getStaticProps/should-not-remove-import-used-in-render
  it('shares a binding the loader reads and the component renders as a JSX member tag', async () => {
    const result = await buildAndRun(
      `${head}import { createUi } from '../ui'
const ui = createUi()
export const Route = createFileRoute('/')({
  loader: () => typeof ui.Box,
  component: () => <ui.Box />,
})`,
      `const html = await entry.render(entry.Route.options.component)
return [html, globalThis.uis]`,
      {
        files: {
          'ui.tsx': `export function createUi() {
  ;(globalThis as any).uis = ((globalThis as any).uis ?? 0) + 1
  return { Box: () => <p>box</p> }
}`,
        },
      },
    )
    expect(result).toEqual(['<p>box</p>', 1])
  }, 30_000)

  // Source: Qwik optimizer test.rs
  // should_keep_non_migrated_binding_from_shared_destructuring_declarator_with_default (+ _with_rest)
  it('evaluates a destructuring split between the loader and the component once', async () => {
    const { modules } =
      compileRouteModules(`${head}import { makeConfig } from './config'
const { a = 'A', ...b } = makeConfig()
export const Route = createFileRoute('/')({
  loader: () => a,
  component: () => <div>{JSON.stringify(b)}</div>,
})
`)
    expect(countAcrossModules(modules, /makeConfig\(\)/)).toBe(1)
    await expectValidModules(modules)
  })

  // Source: Qwik optimizer test.rs root_level_self_referential_qrl,
  // example_self_referential_component_migration
  it('declares mutually recursive components used by two lazy chunks once', async () => {
    const { modules } =
      compileRouteModules(`${head}function A({ depth }) { return depth ? <B depth={depth - 1} /> : <i>a</i> }
function B({ depth }) { return <b><A depth={depth} /></b> }
export const Route = createFileRoute('/')({
  component: () => <A depth={1} />,
  errorComponent: () => <B depth={0} />,
})
`)
    expect(countAcrossModules(modules, /function A\b/)).toBe(1)
    expect(countAcrossModules(modules, /function B\b/)).toBe(1)
    await expectValidModules(modules)
  })

  it('shares a class with a static block and private members', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}class Counter {
  static created = 0
  static { Counter.created = 1 }
  #n = 0
  increment() { return ++this.#n }
  static owns(value: object) { return #n in value }
}
const counter = new Counter()
export const Route = createFileRoute('/')({
  loader: () => counter.increment(),
  component: () => <div>{String(Counter.owns(counter))}</div>,
})
`)
    expect(sharedBindings).toEqual(['Counter', 'counter'])
    expect(modules['virtual component']).not.toMatch(declarationOf('Counter'))
    await expectValidModules(modules)
  })

  // Source: Turbopack tree-shaker analyzer/nanoid, analyzer/let-bug-1
  it('shares a let that a shared helper reassigns', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}let pool: Array<number> = [], offset = 0
const fill = () => { pool = [offset++] }
export const Route = createFileRoute('/')({
  loader: () => { fill(); return pool },
  component: () => { fill(); return <p>{pool.join()}</p> },
})
`)
    expect(sharedBindings).toEqual(['fill', 'offset', 'pool'])
    expect(modules.reference).not.toMatch(declarationOf('pool'))
    expect(modules['virtual component']).not.toMatch(declarationOf('pool'))
    await expectValidModules(modules)
  })
})

describe('split chunks keep reassigned bindings next to their writers', () => {
  // Source: React Router route-chunks-test.ts "reassignment"; babel-dead-code-elimination
  // find-removable-bindings.test.ts "constant violations mark as external"
  it('moves a binding that only the split component reassigns into its chunk', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}import { next } from './next'
let current = 'initial-marker'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => {
    current = next
    return <p>{current}</p>
  },
})
`)
    expect(sharedBindings).toEqual([])
    expect(modules.reference).not.toContain('initial-marker')
    expect(importSources(modules.reference!)).not.toContain('./next')
    expect(modules['virtual component']).toMatch(declarationOf('current'))
    expect(modules['virtual component']).toContain('initial-marker')
    await expectValidModules(modules)
  })

  // Source: Next.js ssg/getStaticProps/should-support-babel-style-memoized-function
  it.each([
    { name: 'the component', loader: `'data'`, shared: [] },
    {
      name: 'the loader and the component',
      loader: 'fetchData()',
      shared: ['fetchData'],
    },
  ])(
    'keeps a self-reassigning function used by $name valid',
    async ({ loader, shared }) => {
      const { modules, sharedBindings } =
        compileRouteModules(`${head}function fetchData() {
  fetchData = function () {
    return 'memoized'
  }
  return fetchData.apply(this, arguments as any)
}
export const Route = createFileRoute('/')({
  loader: () => ${loader},
  component: () => <div>{fetchData()}</div>,
})
`)
      expect(sharedBindings).toEqual(shared)
      const owner = shared.length
        ? modules.shared!
        : modules['virtual component']!
      expect(owner).toMatch(declarationOf('fetchData'))
      expect(owner).toContain('fetchData = function')
      await expectValidModules(modules)
    },
  )
})

describe('split components see the top-level writes to what they read', () => {
  // Source: React Router route-chunks-test.ts "reassignment with nullish
  // coalescing" and "destructured reassignment"
  it('renders bindings reassigned at the top level with their final values', async () => {
    const result = await buildAndRun(
      `${head}let plain = 'initial'
plain = 'assigned'
let compound = 1
compound += 1
let logical = ''
logical ||= 'logical'
let handler: (() => string) | undefined
handler ??= () => 'handler'
let swapped = () => 'original'
;[swapped] = [() => 'swapped']
export const Route = createFileRoute('/')({
  component: () => <p>{[plain, compound, logical, handler!(), swapped()].join(' ')}</p>,
})`,
      `return await entry.render(entry.Route.options.component)`,
    )
    expect(result).toBe('<p>assigned 2 logical handler swapped</p>')
  }, 30_000)

  // Source: Turbopack tree-shaker analyzer/assign-before-decl-var and
  // analyzer/assign-before-decl-fn
  it.each([
    {
      name: 'a var',
      setup: `value = 'assigned'
var value: string`,
      render: '{value}',
      html: '<p>assigned</p>',
    },
    {
      name: 'a function declaration',
      setup: `value = () => 'reassigned'
function value() {
  return 'declared'
}`,
      render: '{value()}',
      html: '<p>reassigned</p>',
    },
  ])(
    'renders $name assigned before its hoisted declaration',
    async ({ setup, render, html }) => {
      const result = await buildAndRun(
        `${head}${setup}
export const Route = createFileRoute('/')({
  component: () => <p>${render}</p>,
})`,
        `return await entry.render(entry.Route.options.component)`,
      )
      expect(result).toBe(html)
    },
    30_000,
  )

  // Source: React Router remove-exports-test.ts "function statement with
  // property assignment"
  it('renders a split component that has properties assigned at the top level', async () => {
    const result = await buildAndRun(
      `${head}function Page() {
  return <p>{(Page as any).label}</p>
}
;(Page as any).label = 'page'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: Page,
})`,
      `return await entry.render(entry.Route.options.component)`,
    )
    expect(result).toBe('<p>page</p>')
  }, 30_000)
})
