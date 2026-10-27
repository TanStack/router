/**
 * Split chunks keep the module state the route relies on (SPEC G3, J2.4,
 * J2.12, G9): every value is created once, every reader gets that instance,
 * and what the rest of the app imports from the route file is what the
 * options read. Routes load in a real browser page from a real dev server
 * (`./route-app`); the modules a route file imports are files of the app,
 * which record what ran, and the page reads them.
 */
import { describe, expect, it } from 'vitest'
import {
  expectValidModules,
  head,
  holdsMarker,
  loadRoute,
} from '../../route-app'

/**
 * An app module `init.ts` (or another name) whose `init` counts its calls
 * (`calls`) and returns its argument.
 */
const countingInit = `export let calls = 0
export const init = <T,>(value: T): T => {
  calls++
  return value
}
`

/** An app module whose `see` records what it is given (`seen`). */
const recordingSee = `export const seen: Array<unknown> = []
export const see = (value: unknown) => {
  seen.push(value)
  return value
}
`

describe('split chunks keep the module state the route relies on', () => {
  // Source: Qwik optimizer test.rs
  // should_keep_non_migrated_binding_from_shared_destructuring_declarator_with_default (+ _with_rest)
  it('evaluates a destructuring split between the loader and the component once', async () => {
    const route = await loadRoute(
      `${head}import { makeConfig } from './config'
const { a = 'A', ...b } = makeConfig()
export const Route = createFileRoute('/')({
  loader: () => a,
  component: () => <div>{JSON.stringify(b)}</div>,
})
`,
      {
        files: {
          'config.ts': `export let calls = 0
export const makeConfig = () => {
  calls++
  return { x: 1 }
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
  (await app('config.ts')).calls,
]`),
    ).toEqual(['A', '<div>{"x":1}</div>', 1])
  })

  // Source: Qwik optimizer test.rs root_level_self_referential_qrl,
  // example_self_referential_component_migration
  it('declares mutually recursive components used by two lazy chunks once', async () => {
    const route = await loadRoute(
      `${head}import { see } from './see'
function A({ depth }: { depth: number }) {
  see(A)
  return depth ? <B depth={depth - 1} /> : <i>a</i>
}
function B({ depth }: { depth: number }) {
  see(B)
  return <b><A depth={depth} /></b>
}
export const Route = createFileRoute('/')({
  component: () => <A depth={1} />,
  errorComponent: () => <B depth={0} />,
})
`,
      { files: { 'see.ts': recordingSee } },
    )
    await expectValidModules(route)
    expect(
      await route.run(`return [
  await render('component'),
  await render('errorComponent'),
  // Both chunks render the same A and the same B
  new Set((await app('see.ts')).seen).size,
]`),
    ).toEqual(['<b><i>a</i></b>', '<b><i>a</i></b>', 2])
  })

  it('keeps one class with a static block and private members', async () => {
    const route = await loadRoute(`${head}class Counter {
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
    await expectValidModules(route)
    // `#n in counter` only holds for the class that created `counter`.
    expect(
      await route.run(`return [options.loader(), await render('component')]`),
    ).toEqual([1, '<div>true</div>'])
  })

  // Source: Turbopack tree-shaker analyzer/nanoid, analyzer/let-bug-1
  it('keeps one let that a helper the loader and the component call reassigns', async () => {
    const route =
      await loadRoute(`${head}let pool: Array<number> = [], offset = 0
const fill = () => { pool = [offset++] }
export const Route = createFileRoute('/')({
  loader: () => { fill(); return pool },
  component: () => { fill(); return <p>{pool.join()}</p> },
})
`)
    await expectValidModules(route)
    expect(
      await route.run(`return [options.loader(), await render('component')]`),
    ).toEqual([[0], '<p>1</p>'])
  })

  // TypeScript erases type positions, so a declaration the split component
  // only reads in a type is created once, by the route module. (Next to a
  // type alias that reads it: pinned in known-bugs-code-splitter.test.ts.)
  // Source: #8504 (real apps: forms that cast `as z.infer<typeof schema>`
  // in the split component).
  it('creates a declaration the split component only reads in a type once', async () => {
    const route = await loadRoute(
      `${head}import { init } from './state'
const value = init(1)
export const Route = createFileRoute('/')({
  component: () => <p>{typeof ({} as typeof value)}</p>,
})`,
      { files: { 'state.ts': countingInit } },
    )
    await expectValidModules(route)
    expect(
      await route.run(
        `return [await render('component'), (await app('state.ts')).calls]`,
      ),
    ).toEqual(['<p>object</p>', 1])
  })
})

// Exported destructurings whose bindings split options read: each
// initializer runs once, and the route module exports the objects the
// options read. Shapes of the deleted code-splitter snapshot fixtures
// destructured-export-multiple, destructured-export-nested and
// shared-destructured-export.
it('keeps one instance of exported destructured bindings the loader and the component read', async () => {
  const route = await loadRoute(
    `${head}import { init, init2, see } from './state'
export const {
  api: { base },
  ...rest
} = init({ api: { base: { url: '/api' } }, extra: { flag: true } })
export const [x, y] = init2([{ id: 'x' }, { id: 'y' }])
export const Route = createFileRoute('/')({
  loader: () => rest,
  component: () => <p>{see({ base, x }) + base.url + x.id}</p>,
})
`,
    {
      files: {
        'state.ts': `export const calls = { init: 0, init2: 0 }
export const seen: Record<string, unknown> = {}
export const init = <T,>(value: T): T => {
  calls.init++
  return value
}
export const init2 = <T,>(value: T): T => {
  calls.init2++
  return value
}
export const see = (values: Record<string, unknown>) => {
  Object.assign(seen, values)
  return ''
}
`,
        // What the rest of the app imports from the route file
        'importer.ts': `export { rest, base, x, y } from './route'\n`,
      },
    },
  )
  await expectValidModules(route)
  expect(
    await route.run(`const loaded = await (await load('loader'))()
const html = await render('component')
const state = await app('state.ts')
const imported = await app('importer.ts')
return {
  loaded,
  html,
  calls: state.calls,
  // What the rest of the app imports from the route file is what the
  // options read.
  rest: imported.rest === loaded,
  base: imported.base === state.seen.base,
  x: imported.x === state.seen.x,
  y: imported.y,
}`),
  ).toEqual({
    loaded: { extra: { flag: true } },
    html: '<p>/apix</p>',
    calls: { init: 1, init2: 1 },
    rest: true,
    base: true,
    x: true,
    y: { id: 'y' },
  })
})

// Initializers whose side effects hide in their syntax, read by the loader
// and the split component: each runs once and both options read the one
// value (when it runs is free). Source: #8504
// (shared-bindings-helpers.test.ts).
describe('a shared initializer with side effects', () => {
  it.each([
    {
      name: 'a template literal (toString)',
      declaration: 'const value = { label: `${prefix}` }',
    },
    {
      name: 'a unary minus (valueOf)',
      declaration: 'const value = { label: -prefix }',
    },
    {
      name: 'a constructor of an import',
      declaration: `import { Map } from 'immutable'
const value = new Map()`,
    },
    {
      name: 'a static field calling an import',
      declaration: `class Store {
  static instance = register()
}
const value = Store`,
    },
    // Creating the element does not call the component (no effect); the
    // loader and the component still read one element.
    {
      name: 'JSX of a component that calls an import',
      declaration: `function Tracked() {
  register()
  return 'tracked'
}
const value = { element: <Tracked /> }`,
      effects: 0,
    },
    {
      name: 'a pure-annotated call (control)',
      declaration: 'const value = /* @__PURE__ */ register()',
    },
  ])('$name runs once', async ({ declaration, effects: expected = 1 }) => {
    const route = await loadRoute(
      `${head}import { prefix, register, see } from './state'
${declaration}
export const Route = createFileRoute('/')({
  loader: () => see(value),
  component: () => <p>{String(see(value))}</p>,
})
`,
      {
        files: {
          'state.ts': `export let effects = 0
export const seen: Array<unknown> = []
export const register = () => {
  effects++
  return { id: effects }
}
export const prefix = {
  toString: () => String(register().id),
  valueOf: () => register().id,
}
export const see = (value: unknown) => {
  seen.push(value)
  return 1
}
`,
          'node_modules/immutable/package.json': JSON.stringify({
            name: 'immutable',
            type: 'module',
            exports: './index.js',
          }),
          'node_modules/immutable/index.js': `import { register } from '../../state.ts'
export class Map {
  id = register().id
}
`,
        },
      },
    )
    await expectValidModules(route)
    expect(
      await route.run(`options.loader()
const html = await render('component')
const state = await app('state.ts')
return {
  html,
  effects: state.effects,
  seen: state.seen.length,
  same: state.seen[0] === state.seen[1],
}`),
    ).toEqual({ html: '<p>1</p>', effects: expected, seen: 2, same: true })
  })
})

describe('split chunks keep reassigned bindings next to their writers', () => {
  // Source: React Router route-chunks-test.ts "reassignment"; babel-dead-code-elimination
  // find-removable-bindings.test.ts "constant violations mark as external"
  it('keeps a binding that only the split component reassigns writable, and its imports out of the route module', async () => {
    const route = await loadRoute(
      `${head}import { next } from './next'
let current = 'initial'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => {
    const previous = current
    current = next
    return <p>{previous}-{current}</p>
  },
})
`,
      { files: { 'next.ts': `export const next = 'next'\n` } },
    )
    // Nothing the route module loads requests what only the component reads.
    expect(await route.requested()).not.toContain('/next.ts')
    await expectValidModules(route)
    expect(
      await route.run(`return [
  options.loader(),
  await render('component'),
  await render('component'),
]`),
    ).toEqual(['data', '<p>initial-next</p>', '<p>next-next</p>'])
  })

  // A lazily initialised getter that replaces itself after the first call.
  // Source: Next.js ssg/getStaticProps/should-support-babel-style-memoized-function
  it.each([
    { name: 'the component', loader: `'data'`, loaded: 'data' },
    {
      name: 'the loader and the component',
      loader: 'see(getConfig()).title',
      loaded: 'config',
    },
  ])(
    'keeps a self-reassigning function used by $name working, with one result',
    async ({ loader, loaded }) => {
      const route = await loadRoute(
        `${head}import { createConfig, see } from './config'
let getConfig = () => {
  const config = createConfig()
  getConfig = () => config
  return config
}
export const Route = createFileRoute('/')({
  loader: () => ${loader},
  component: () => <div>{see(getConfig()).title}</div>,
})
`,
        {
          files: {
            'config.ts': `export let created = 0
export const seen = new Set<unknown>()
export const createConfig = () => {
  created++
  return { title: 'config' }
}
export const see = <T,>(value: T): T => {
  seen.add(value)
  return value
}
`,
          },
        },
      )
      await expectValidModules(route)
      expect(
        await route.run(`const results = [
  options.loader(),
  await render('component'),
  options.loader(),
  await render('component'),
]
const config = await app('config.ts')
return [...results, config.created, config.seen.size]`),
      ).toEqual([
        loaded,
        '<div>config</div>',
        loaded,
        '<div>config</div>',
        1,
        1,
      ])
    },
  )

  // A const only the split component reads works with the module-level
  // statements that write to it. Enums and namespaces do not: pinned in
  // known-bugs-code-splitter.test.ts ("top-level writes to ... stay with the
  // binding they write"). Source: #8504.
  it('keeps the writes to a const the split component reads', async () => {
    const route = await loadRoute(`${head}const State = { count: 0 }
Object.assign(State, { extra: 7 })
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{(State as any).extra}</p>,
})
`)
    await expectValidModules(route)
    expect(
      await route.run(`return [options.loader(), await render('component')]`),
    ).toEqual(['data', '<p>7</p>'])
  })
})

// A binding the loader (route module) and the split component both read
// (directly or through what they call) is created once, and both get it.
describe('a binding the loader and the split component share', () => {
  // `useQuery({ ... })` in a split component: only `createFileRoute(...)`
  // gives the route options.
  it('is created once when the component calls a hook with an options object', async () => {
    const route = await loadRoute(
      `${head}import { useThing } from './thing'
const state = { count: 0 }
export const Route = createFileRoute('/')({
  loader: () => ++state.count,
  component: () => {
    const value = useThing({ label: 'x' })
    return <p>{state.count}{value.label}</p>
  },
})
`,
      {
        files: {
          'thing.ts': `export const useThing = <T,>(options: T): T => options\n`,
        },
      },
    )
    expect(
      await route.run(`return [options.loader(), await render('component')]`),
    ).toEqual([1, '<p>1x</p>'])
  })

  it('keeps exported classes next to it importable, with one identity', async () => {
    const route = await loadRoute(
      `${head}import { see } from './see'
export class AppError extends Error {}
export class Cache {
  value = 'cached'
}
class Local {
  value = 'local'
}
export const Route = createFileRoute('/')({
  loader: () => ({ AppError, cached: new Cache().value, local: new Local().value }),
  component: () => {
    see(AppError)
    return <p>component</p>
  },
})
`,
      {
        files: {
          'see.ts': recordingSee,
          'importer.ts': `export { AppError, Cache } from './route'\n`,
        },
      },
    )
    await expectValidModules(route)
    expect(
      await route.run(`const imported = await app('importer.ts')
const loaded = options.loader()
const html = await render('component')
const { seen } = await app('see.ts')
return {
  html,
  sameInLoader: loaded.AppError === imported.AppError,
  sameInComponent: seen.length === 1 && seen[0] === imported.AppError,
  cached: loaded.cached,
  local: loaded.local,
  cache: new imported.Cache().value,
}`),
    ).toEqual({
      html: '<p>component</p>',
      sameInLoader: true,
      sameInComponent: true,
      cached: 'cached',
      local: 'local',
      cache: 'cached',
    })
  })

  /**
   * Loads a route whose loader passes `loader` and whose split component
   * passes `component` (expressions over `declarations`) to `see`, and
   * checks that both ran with what the route file declares: `init` (called
   * once by `declarations`) ran once, and the loader and the component got
   * the same value when they read the same expression.
   */
  async function expectSharedOnce({
    declarations,
    loader = 'value',
    component = 'value',
  }: {
    declarations: string
    loader?: string
    component?: string
  }) {
    const route = await loadRoute(
      `${head}import { init, see, UI } from './state'
${declarations}
export const Route = createFileRoute('/')({
  loader: () => see(${loader}),
  component: () => <p>{String(see(${component}))}</p>,
})
`,
      {
        files: {
          'state.ts': `export let inits = 0
export const seen: Array<any> = []
export const init = <T,>(value: T): T => {
  inits++
  return value
}
export const see = (value: any) => {
  seen.push(value)
  return typeof value?.read === 'function' ? value.read().name : 'ok'
}
export const UI = { Title: () => 'title' }
`,
        },
      },
    )
    await expectValidModules(route)
    const observed = await route.run<{
      loaded: string
      html: string
      seen: number
      same: boolean
      inits: number
    }>(`const loaded = options.loader()
const html = await render('component')
const state = await app('state.ts')
return {
  loaded,
  html,
  seen: state.seen.length,
  same: state.seen[0] === state.seen[1],
  inits: state.inits,
}`)
    expect(observed.html).toBe(`<p>${observed.loaded}</p>`)
    expect(observed.seen).toBe(2)
    if (loader === component) {
      expect(observed.same).toBe(true)
    }
    expect(observed.inits).toBe(1)
  }

  it.each([
    {
      name: 'a class that reads another binding',
      declarations: `const config = init({ name: 'config' })
class Store { settings = config }
const value = new Store()`,
    },
    {
      name: 'an array destructuring',
      declarations: `const [a, b] = init([{ id: 'a' }, { id: 'b' }])`,
      loader: 'a',
      component: 'b',
    },
    {
      name: 'an array destructuring with a rest element',
      declarations: `const [first, ...rest] = init([1, 2, 3])`,
      loader: 'first',
      component: 'rest',
    },
    // Each call creates a new element: both read the tag it renders.
    {
      name: 'an object read as a JSX member tag',
      declarations: `const Parts = init({ Title: () => 'title' })
const Header = () => <Parts.Title />`,
      loader: 'Header().type',
      component: 'Header().type',
    },
    {
      name: 'a helper with a block-scoped local of the same name in one branch',
      declarations: `const config = init({ name: 'config' })
function read() {
  if (Math.random() > 2) { const config = { name: 'local' }; return config }
  return config
}
const value = { read }`,
    },
    {
      name: 'an object with a var of the same name in a sibling method',
      declarations: `const config = init({ name: 'config' })
const value = {
  local() { var config = 'local'; return config },
  read() { return config },
}`,
    },
    // The private method is the only code reading `config` (found by
    // mutation testing: a compiler ignoring private method bodies).
    {
      name: 'a private method, the only reader of the binding',
      declarations: `const config = init({ name: 'config' })
class Vault {
  #read() {
    return config
  }
  read() {
    return this.#read()
  }
}`,
      loader: 'new Vault().read()',
      component: 'new Vault().read()',
    },
  ])('reaches the split component through $name', expectSharedOnce)

  // Each row declares a module-level `title` (or component) that reads
  // `Route`, and a local of the same name inside the shared value: the local
  // is not a read of the module-level binding.
  it.each([
    ['an arrow function parameter', `init({ format: (title) => title })`],
    [
      'a function expression parameter',
      `init({ format: function (title) { return title } })`,
    ],
    ['an object method parameter', `init({ format(title) { return title } })`],
    [
      'a class method parameter',
      `init(new (class { format(title) { return title } })())`,
    ],
    [
      'a private method parameter',
      `init(new (class { #format(title) { return title } run() { return this.#format(1) } })())`,
    ],
    ['a destructured parameter', `init({ format: ({ title }) => title })`],
    ['a rest parameter', `init({ f: (...title) => title })`],
    [
      'a catch parameter',
      `init({ run: () => { try { return 1 } catch (title) { return title } } })`,
    ],
    ['a local const', `init({ run: () => { const title = 1; return title } })`],
    [
      'a const in a nested block',
      `init({ run: () => { if (Math.random() < 2) { const title = 1; return title } return 0 } })`,
    ],
    [
      'a var in a nested block',
      `init({ run: () => { if (Math.random() < 2) { var title = 1 } return title } })`,
    ],
    [
      'a function declared after its use',
      `init({ run: () => { return title(); function title() { return 1 } } })`,
    ],
    [
      'a const read by a closure before its declaration',
      `init({ run: () => { const get = () => title; const title = 1; return get() } })`,
    ],
    [
      'a class declared after its use',
      `init({ run: () => { const make = () => new title(); class title {} return make() } })`,
    ],
    [
      'a for-of binding',
      `init({ run: () => { for (const title of [1]) { return title } } })`,
    ],
    [
      'the name of a class expression',
      `init(class title { static self = () => title })`,
    ],
    [
      'a class declared in a function',
      `init({ run: () => { class title {} return new title() } })`,
    ],
    [
      'the name of a function expression',
      `init({ run: function title() { return title } })`,
    ],
    [
      'a function declared in a function',
      `init({ run: () => { function title() { return 1 } return title() } })`,
    ],
    [
      'a local type alias',
      `init({ run: () => { type title = number; const x: title = 1; return x } })`,
    ],
    [
      'a local enum',
      `init({ run: () => { enum title { A } return title.A } })`,
    ],
  ])(
    'is not tied to a module-level helper reading Route by %s of the same name',
    (_, value) =>
      expectSharedOnce({
        declarations: `const title = () => Route.id
const value = ${value}`,
      }),
  )

  it.each([
    [
      'a destructured prop rendered as JSX',
      `const Icon = () => <i>{Route.id}</i>
const value = init({ render: ({ Icon }) => <Icon /> })`,
    ],
    [
      'the property of a JSX member tag',
      `const Title = () => <i>{Route.id}</i>
const value = init({ render: () => <UI.Title /> })`,
    ],
    [
      'a JSX attribute name',
      `const Title = () => Route.id
const value = init({ render: () => <div Title="x" /> })`,
    ],
  ])(
    'is not tied to a module-level component reading Route by %s of the same name',
    (_, declarations) => expectSharedOnce({ declarations }),
  )
})

// The route module keeps what the rest of the app imports from the route
// file working when a split component comes from the same declaration.
describe('a split component declared next to other bindings', () => {
  it.each([
    { name: 'plain', pattern: '{ Panel, usePanel }' },
    {
      name: 'with defaults',
      pattern: '{ Panel = Fallback, usePanel = useFallback }',
    },
  ])(
    'keeps the sibling of a destructuring working ($name)',
    async ({ pattern }) => {
      const route = await loadRoute(
        `${head}import { createPanel } from './panel'
const Fallback = () => <p>fallback</p>
const useFallback = () => 'fallback'
const ${pattern} = createPanel()
export function usePanelState() {
  return usePanel()
}
export const Route = createFileRoute('/')({ component: Panel })
`,
        {
          files: {
            'panel.ts': `export const createPanel = () => ({
  Panel: () => 'panel',
  usePanel: () => 'state',
})
`,
            'importer.ts': `export { usePanelState } from './route'\n`,
          },
        },
      )
      await expectValidModules(route)
      expect(
        await route.run(`const { usePanelState } = await app('importer.ts')
return [usePanelState(), await render('component')]`),
      ).toEqual(['state', 'panel'])
    },
  )

  it('reads an exported object destructuring created once', async () => {
    const route = await loadRoute(
      `${head}import { getConfig } from './config'
export const { title } = getConfig()
export const Route = createFileRoute('/')({
  component: () => <p>{title}</p>,
})
`,
      {
        files: {
          'config.ts': `export let calls = 0
export const getConfig = () => {
  calls++
  return { title: 't' }
}
`,
          'importer.ts': `export { title } from './route'\n`,
        },
      },
    )
    await expectValidModules(route)
    expect(
      await route.run(`const html = await render('component')
const { title } = await app('importer.ts')
return [html, title, (await app('config.ts')).calls]`),
    ).toEqual(['<p>t</p>', 't', 1])
  })
})

// In a JavaScript route file, imports are not elided by a type-aware
// transform: state that split options share is still created once, every
// option reads the same instance, and what only one split option imports
// does not load with the route module.
describe('state only split options read, in a .jsx route file', () => {
  const stateRoute = (
    options: string,
  ) => `${head}import { init, see } from './init'
const store = init({ label: 'shared' })
export const Route = createFileRoute('/')({
${options}
})
`

  it('is created once, and every option reads that instance', async () => {
    const route = await loadRoute(
      stateRoute(`  component: () => <p>{see(store)}</p>,
  errorComponent: () => <p>{see(store)}</p>,`),
      {
        filename: 'route.jsx',
        files: {
          'init.js': `export let inits = 0
export const seen = []
export const init = (value) => {
  inits++
  return { ...value }
}
export const see = (store) => {
  seen.push(store)
  return store.label
}
`,
        },
      },
    )
    // When the store is created is free (initialiser timing is not pinned,
    // nor whether its module loads with the route module): it is created
    // once and both options read that one instance.
    expect(
      await route.run(`const html = [await render('component'), await render('errorComponent')]
const state = await app('init.js')
return [...html, state.inits, new Set(state.seen).size]`),
    ).toEqual(['<p>shared</p>', '<p>shared</p>', 1, 1])
  })

  it('is not created by loading a split option that does not read it', async () => {
    const route = await loadRoute(
      stateRoute(`  component: () => <p>{see(store)}</p>,
  errorComponent: () => <p>{see(store)}</p>,
  notFoundComponent: () => <p>nf</p>,`),
      {
        filename: 'route.jsx',
        files: {
          'init.js': `export let inits = 0
export const init = (value) => {
  inits++
  return value
}
export const see = (store) => store.label
`,
        },
      },
    )
    // Whether the route module creates it is free; loading the
    // notFoundComponent chunk does not (it holds only what it needs, SPEC J2.5).
    expect(
      await route.run(`// Until the page requests the module, nothing has created the store
const inits = async () =>
  (await requested()).includes('/init.js') ? (await app('init.js')).inits : 0
const atLoad = await inits()
const notFound = await render('notFoundComponent')
const afterNotFound = await inits()
const component = await render('component')
return { notFound, unchanged: afterNotFound === atLoad, component, inits: await inits() }`),
    ).toEqual({
      notFound: '<p>nf</p>',
      unchanged: true,
      component: '<p>shared</p>',
      inits: 1,
    })
  })

  it('does not load what only the split component imports with the state the loader shares', async () => {
    const route = await loadRoute(
      `${head}import { createStore } from './store'
import { Chart } from './chart'
const store = createStore()
export const Route = createFileRoute('/')({
  loader: () => store.get(),
  component: () => <Chart data={store.get()} />,
})
`,
      {
        filename: 'route.jsx',
        files: {
          'store.js': `export const createStore = () => ({ get: () => 'v' })\n`,
          'chart.js': `export const Chart = ({ data }) => data\n`,
        },
      },
    )
    // Nothing the route module loads requests `./chart`.
    expect(await route.requested()).not.toContain('/chart.js')
    expect(
      await route.run(`return [options.loader(), await render('component')]`),
    ).toEqual(['v', 'v'])
  })
})

// A split component wrapped in a call (`memo(Page)`, an HOC) of a `const`
// component: the call runs when the chunk loads, after `Page` is
// initialized (SPEC G3: ordering dependencies kept; J2.6: the chunk loads
// and renders). A `function Page() {}` declaration is hoisted and would hide
// a wrapper evaluated above it (found by mutation testing).
describe('a split component wrapped in a call of a const component', () => {
  it.each([
    {
      name: "React's memo",
      code: `${head}import { memo } from 'react'
const Page = () => <h1>Posts</h1>
export const Route = createFileRoute('/')({ component: memo(Page) })
`,
    },
    {
      name: 'an application HOC',
      code: `${head}import { withAuth } from './auth'
const Page = () => <h1>Posts</h1>
export const Route = createFileRoute('/')({ component: withAuth(Page) })
`,
    },
  ])('renders when the chunk loads ($name)', async ({ code }) => {
    const route = await loadRoute(code, {
      files: {
        'auth.ts': `export const withAuth = <T,>(component: T): T => component\n`,
      },
    })
    expect(await route.run(`return render('component')`)).toBe('<h1>Posts</h1>')
  })
})

// Effectful declarations only the split component reads move with it, each
// one, as on main (DESIGN R29/R31: no effect that stays in the route module
// follows them once the later ones moved too; G3 allows the lazy
// initialisation). Their effects still run in source order: an effect that
// stays in the route module, or moves to another chunk, keeps the ones
// before it in the route module. Found by the real-app differential corpus:
// a route file with `const A = import.meta.env.X || ''` and `const B = …`
// kept every one but the last in the route module (exported there, imported
// back by the chunk), so the eager bundle grew.
describe('effectful declarations only the split component reads', () => {
  /**
   * `state.ts`: `register(name)` records `name` in `ran` and returns it;
   * `recordFirst`, `recordSecond`, … are the same function under the names
   * the cases below import, one per declaration (an import the route
   * module or another chunk also reads keeps its readers in the route
   * module by itself, R29 (c)).
   */
  const files = {
    'state.ts': `export const ran: Array<string> = []
export const register = (name: string) => {
  ran.push(name)
  return name
}
export {
  register as recordFirst,
  register as recordSecond,
  register as recordThird,
  register as recordMiddle,
  register as recordShared,
}
`,
  }
  const recorders = `import { recordFirst, recordSecond, recordThird, recordMiddle, recordShared } from './state'\n`
  /** `const <name> = record<Name>('MARK_<name>')`. */
  const record = (name: string) =>
    `const ${name} = record${name[0]!.toUpperCase()}${name.slice(1)}('MARK_${name}')`

  /**
   * Loads `body` (after the route's imports), then returns what ran once
   * the route module loaded and once `options` rendered, in that order,
   * the HTML they rendered, and which of `lazy` the eager modules hold.
   */
  async function observe(
    body: string,
    options: Array<string>,
    lazy: Array<string>,
  ) {
    const route = await loadRoute(
      `${head}import { register } from './state'\n${recorders}${body}`,
      { files },
    )
    await expectValidModules(route)
    const eager = await route.eagerModules()
    return {
      ...(await route.run<
        Record<string, unknown>
      >(`const state = await app('state.ts')
const loaded = [...state.ran]
const html = []
for (const option of ${JSON.stringify(options)}) {
  html.push(await render(option))
}
return { loaded, rendered: [...state.ran], html }`)),
      eagerHolds: lazy.filter((name) =>
        eager.some((code) => holdsMarker(code, `MARK_${name}`)),
      ),
    }
  }

  it.each([1, 2, 3])(
    '%i of them load with the component, not with the route module, in source order',
    async (count) => {
      const names = ['first', 'second', 'third'].slice(0, count)
      const marks = names.map((name) => `MARK_${name}`)
      expect(
        await observe(
          `export const Route = createFileRoute('/')({ component: Page })
${names.map((name) => `const ${name} = register('MARK_${name}')`).join('\n')}
function Page() {
  return <p>{${names.join(' + ')}}</p>
}
`,
          ['component'],
          names,
        ),
      ).toEqual({
        loaded: [],
        rendered: marks,
        html: [`<p>${marks.join('')}</p>`],
        eagerHolds: [],
      })
    },
  )

  it('keeps the ones before an effect that stays in the route module', async () => {
    expect(
      await observe(
        `export const Route = createFileRoute('/')({ component: Page })
${record('first')}
recordMiddle('MARK_middle')
${record('second')}
${record('third')}
function Page() {
  return <p>{first + second + third}</p>
}
`,
        ['component'],
        ['second', 'third'],
      ),
    ).toEqual({
      loaded: ['MARK_first', 'MARK_middle'],
      rendered: ['MARK_first', 'MARK_middle', 'MARK_second', 'MARK_third'],
      html: ['<p>MARK_firstMARK_secondMARK_third</p>'],
      eagerHolds: [],
    })
  })

  it('keeps one the route module also reads, once, and the ones before it', async () => {
    expect(
      await observe(
        `${record('first')}
${record('shared')}
${record('third')}
export const Route = createFileRoute('/')({
  component: Page,
  staticData: { label: shared },
})
function Page() {
  return <p>{first + shared + third}</p>
}
`,
        ['component'],
        ['third'],
      ),
    ).toEqual({
      loaded: ['MARK_first', 'MARK_shared'],
      rendered: ['MARK_first', 'MARK_shared', 'MARK_third'],
      html: ['<p>MARK_firstMARK_sharedMARK_third</p>'],
      eagerHolds: [],
    })
  })

  it('keeps one before an effect that moves to another chunk', async () => {
    // the error component's chunk loads first: `second` still runs after
    // `first`
    expect(
      await observe(
        `export const Route = createFileRoute('/')({
  component: () => <p>{first}</p>,
  errorComponent: () => <p>{second}</p>,
})
${record('first')}
${record('second')}
`,
        ['errorComponent', 'component'],
        ['second'],
      ),
    ).toEqual({
      loaded: ['MARK_first'],
      rendered: ['MARK_first', 'MARK_second'],
      html: ['<p>MARK_second</p>', '<p>MARK_first</p>'],
      eagerHolds: [],
    })
  })
})

// A page-only effectful declaration moves even when the import it calls is
// also read by a declaration the route module keeps. Found by the real-app
// differential corpus (thenishantsapkota/streamly, routes/index.tsx:
// `SERIES_ROWS`/`ANIME_ROWS`, arrays of `apiQuery(…)` read only by the page,
// next to `FILM_ROWS`/`q`, also `apiQuery(…)`, read by the loader too): main
// moves the page-only ones into the chunk, the PR keeps them in the route
// module (+~1 KB initial). DESIGN §3.4.2 R31 (c) only lets the move happen
// for "import specifiers used by no other output".
describe('a page-only effectful declaration calling an import the route module also uses', () => {
  it('loads with the component', async () => {
    const route = await loadRoute(
      `${head}import { register } from './state'
const kept = register('MARK_kept')
const page = register('MARK_page')
export const Route = createFileRoute('/')({
  loader: () => kept,
  component: Page,
})
function Page() {
  return <p>{kept + page}</p>
}
`,
      {
        files: {
          'state.ts': `export const register = (name: string) => name
`,
        },
      },
    )
    await expectValidModules(route)
    const eager = await route.eagerModules()
    expect({
      html: await route.run(`return render('component')`),
      eagerHolds: ['kept', 'page'].filter((name) =>
        eager.some((code) => holdsMarker(code, `MARK_${name}`)),
      ),
    }).toEqual({ html: '<p>MARK_keptMARK_page</p>', eagerHolds: ['kept'] })
  })
})
