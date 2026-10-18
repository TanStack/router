import { describe, expect, it } from 'vitest'
import {
  declaredNames,
  expectValidModules,
  head,
  loadRoute,
} from './regression-helpers'
import type { CodeSplitGroupings } from '../src/core/constants'

describe('split chunks keep the module state the route relies on', () => {
  // Source: Qwik optimizer test.rs
  // should_keep_non_migrated_binding_from_shared_destructuring_declarator_with_default (+ _with_rest)
  it('evaluates a destructuring split between the loader and the component once', async () => {
    let calls = 0
    const route = await loadRoute(
      `${head}import { makeConfig } from './config'
const { a = 'A', ...b } = makeConfig()
export const Route = createFileRoute('/')({
  loader: () => a,
  component: () => <div>{JSON.stringify(b)}</div>,
})
`,
      {
        stubs: {
          './config': {
            makeConfig: () => {
              calls++
              return { x: 1 }
            },
          },
        },
      },
    )
    await expectValidModules(route.modules)
    expect([
      route.options.loader(),
      await route.render('component'),
      calls,
    ]).toEqual(['A', '<div>{&quot;x&quot;:1}</div>', 1])
  })

  // Source: Qwik optimizer test.rs root_level_self_referential_qrl,
  // example_self_referential_component_migration
  it('declares mutually recursive components used by two lazy chunks once', async () => {
    const seen = new Set<unknown>()
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
      { stubs: { './see': { see: (value: unknown) => seen.add(value) } } },
    )
    await expectValidModules(route.modules)
    expect([
      await route.render('component'),
      await route.render('errorComponent'),
      // Both chunks render the same `A` and the same `B`
      seen.size,
    ]).toEqual(['<b><i>a</i></b>', '<b><i>a</i></b>', 2])
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
    await expectValidModules(route.modules)
    // `#n in counter` only holds for the class that created `counter`.
    expect([route.options.loader(), await route.render('component')]).toEqual([
      1,
      '<div>true</div>',
    ])
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
    await expectValidModules(route.modules)
    expect([route.options.loader(), await route.render('component')]).toEqual([
      [0],
      '<p>1</p>',
    ])
  })

  // TypeScript erases type positions, so a declaration the split component
  // only reads in a type is created once, by the route module. (Next to a
  // type alias that reads it: pinned in known-bugs-code-splitter.test.ts.)
  // Source: #8504 (corpus-diff, forms that cast `as z.infer<typeof schema>`
  // in the split component).
  it('creates a declaration the split component only reads in a type once', async () => {
    let calls = 0
    const route = await loadRoute(
      `${head}import { init } from './state'
const value = init(1)
export const Route = createFileRoute('/')({
  component: () => <p>{typeof ({} as typeof value)}</p>,
})`,
      {
        stubs: {
          './state': {
            init: <T>(value: T) => {
              calls++
              return value
            },
          },
        },
      },
    )
    await expectValidModules(route.modules)
    expect([await route.render('component'), calls]).toEqual([
      '<p>object</p>',
      1,
    ])
  })
})

// Exported destructurings whose bindings split options read: each
// initializer runs once, and the route module exports the objects the
// options read. Shapes of the deleted code-splitter snapshot fixtures
// destructured-export-multiple, destructured-export-nested and
// shared-destructured-export.
it('keeps one instance of exported destructured bindings the loader and the component read', async () => {
  const calls = { init: 0, init2: 0 }
  const seen: Record<string, unknown> = {}
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
      stubs: {
        './state': {
          init: <T>(value: T) => {
            calls.init++
            return value
          },
          init2: <T>(value: T) => {
            calls.init2++
            return value
          },
          see: (values: Record<string, unknown>) => {
            Object.assign(seen, values)
            return ''
          },
        },
      },
    },
  )
  await expectValidModules(route.modules)
  const loaded = await (await route.load('loader'))()
  expect([loaded, await route.render('component'), calls]).toEqual([
    { extra: { flag: true } },
    '<p>/apix</p>',
    { init: 1, init2: 1 },
  ])
  // What the rest of the app imports from the route file is what the
  // options read.
  const imported = await route.importFromRoute(
    `export { rest, base, x, y } from '#route'\n`,
  )
  expect(imported.rest).toBe(loaded)
  expect(imported.base).toBe(seen.base)
  expect(imported.x).toBe(seen.x)
  expect(imported.y).toEqual({ id: 'y' })
})

// Initializers whose side effects hide in their syntax, read by the loader
// and the split component: each runs once and both options read the one
// value (when it runs is free). Source: #8504
// (shared-bindings-helpers.test.ts; lost case L8).
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
    let effects = 0
    const seen: Array<unknown> = []
    const effect = () => {
      effects++
      return { id: effects }
    }
    const route = await loadRoute(
      `${head}import { prefix, register, see } from './state'
${declaration}
export const Route = createFileRoute('/')({
  loader: () => see(value),
  component: () => <p>{String(see(value))}</p>,
})
`,
      {
        stubs: {
          './state': {
            prefix: {
              toString: () => String(effect().id),
              valueOf: () => effect().id,
            },
            register: effect,
            see: (value: unknown) => {
              seen.push(value)
              return 1
            },
          },
          immutable: {
            Map: class {
              id = effect().id
            },
          },
        },
      },
    )
    await expectValidModules(route.modules)
    route.options.loader()
    expect(await route.render('component')).toBe('<p>1</p>')
    expect(effects).toBe(expected)
    expect(seen).toHaveLength(2)
    expect(seen[0]).toBe(seen[1])
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
      { stubs: { './next': { next: 'next' } } },
    )
    // Nothing the route module loads requests what only the component reads.
    expect(route.eager).not.toContain('./next')
    await expectValidModules(route.modules)
    expect([
      route.options.loader(),
      await route.render('component'),
      await route.render('component'),
    ]).toEqual(['data', '<p>initial-next</p>', '<p>next-next</p>'])
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
      let created = 0
      const seen = new Set<unknown>()
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
          stubs: {
            './config': {
              createConfig: () => {
                created++
                return { title: 'config' }
              },
              see: (value: unknown) => {
                seen.add(value)
                return value
              },
            },
          },
        },
      )
      await expectValidModules(route.modules)
      expect([
        route.options.loader(),
        await route.render('component'),
        route.options.loader(),
        await route.render('component'),
        created,
        seen.size,
      ]).toEqual([
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
    await expectValidModules(route.modules)
    expect([route.options.loader(), await route.render('component')]).toEqual([
      'data',
      '<p>7</p>',
    ])
  })
})

// Module-level bindings read by route options, across binding kinds,
// groupings and readers: every reader gets the value, the binding is created
// once with one identity, a function only the component reads is not
// declared in the route module, and a binding only the loader reads is not
// declared in the component's chunk. (Where a const or class only the
// component reads is initialised, and so when, is free.)
describe('module-level bindings read by route options', () => {
  type Kind = 'const' | 'function' | 'class'
  type Reader = 'loader' | 'component' | 'beforeLoad'

  /** Declares `name` as `kind`; consts and classes call `init` once. */
  const declare = (kind: Kind, name: string) =>
    ({
      const: `const ${name} = init({ name: '${name}' })`,
      function: `function ${name}() { return '${name}' }`,
      class: `class ${name} { static created = init('${name}') }`,
    })[kind]

  const groupings: Array<{ name: string; groupings: CodeSplitGroupings }> = [
    {
      name: 'default groupings',
      groupings: [['component'], ['errorComponent'], ['notFoundComponent']],
    },
    {
      name: 'loader and component combined, errorComponent split',
      groupings: [['loader', 'component'], ['errorComponent']],
    },
    {
      name: 'loader split, components combined',
      groupings: [
        ['loader'],
        [
          'component',
          'pendingComponent',
          'errorComponent',
          'notFoundComponent',
        ],
      ],
    },
  ]

  type Case = {
    name: string
    /** Declarations of the route file, after the imports. */
    declarations: string
    /** Bindings each route option passes to `seen`. */
    readers: Partial<Record<Reader, Array<string>>>
    /** How many times `init` runs: once per const or class binding. */
    inits: number
    /** Identities that must be the same object, as expressions over `values`. */
    same?: Array<[string, string]>
  }

  const kinds: Array<Kind> = ['const', 'function', 'class']
  const singleBinding = kinds.flatMap((kind): Array<Case> => {
    const declarations = declare(kind, 'x')
    const inits = kind === 'function' ? 0 : 1
    return [
      { name: `a ${kind} only the loader reads`, readers: { loader: ['x'] } },
      {
        name: `a ${kind} only the component reads`,
        readers: { component: ['x'] },
      },
      {
        name: `a ${kind} the loader and the component read`,
        readers: { loader: ['x'], component: ['x'] },
      },
      {
        name: `a ${kind} the component and beforeLoad read`,
        readers: { component: ['x'], beforeLoad: ['x'] },
      },
    ].map((row) => ({ ...row, declarations, inits }))
  })

  const cases: Array<Case> = [
    ...singleBinding,
    {
      name: 'two consts the loader and the component read',
      declarations: `${declare('const', 'a')}\n${declare('const', 'b')}`,
      readers: { loader: ['a', 'b'], component: ['a', 'b'] },
      inits: 2,
    },
    {
      name: 'a const both read next to a const only the component reads',
      declarations: `${declare('const', 'a')}\n${declare('const', 'b')}`,
      readers: { loader: ['a'], component: ['a', 'b'] },
      inits: 2,
    },
    {
      name: 'a chain of consts (a reads b reads c)',
      declarations: `${declare('const', 'c')}
const b = { c }
const a = { b }`,
      readers: { loader: ['a'], component: ['a'] },
      inits: 1,
    },
    {
      name: 'a diamond of consts (a reads b and c, both read d)',
      declarations: `${declare('const', 'd')}
const b = { d }
const c = { d }
const a = { b, c }`,
      readers: { loader: ['a'], component: ['a'] },
      inits: 1,
      same: [['a.b.d', 'a.c.d']],
    },
  ]

  /**
   * Known bug, remove from here when fixed: a class whose static initializer
   * calls a function, read by the options of one split chunk only, is
   * declared in that chunk and also kept in the route module (dead-code
   * elimination keeps a class with a side-effectful static initializer), so
   * the class is created twice.
   * Impact: what the static initializer does (registrations, counters) runs
   * again when the chunk loads, and the route module holds a second class.
   */
  const isKnownBug = (row: Case, codeSplitGroupings: CodeSplitGroupings) => {
    const readers = Object.keys(row.readers) as Array<Reader>
    const oneChunk = codeSplitGroupings.some((group) =>
      readers.every((reader) => group.includes(reader as never)),
    )
    return row.name.startsWith('a class') && oneChunk
  }

  describe.each(groupings)(
    'with $name',
    ({ groupings: codeSplitGroupings }) => {
      const assertReads = async ({
        declarations,
        readers,
        inits,
        same,
      }: Case) => {
        let initCalls = 0
        const seen: Array<{ reader: string; values: Record<string, unknown> }> =
          []
        const options = (['loader', 'component', 'beforeLoad'] as const)
          .filter((reader) => readers[reader])
          .map((reader) => {
            const values = `{ ${readers[reader]!.join(', ')} }`
            return reader === 'component'
              ? `  component: () => <p>{seen('component', ${values})}</p>,`
              : `  ${reader}: () => seen('${reader}', ${values}),`
          })
        const route = await loadRoute(
          `${head}import { init, seen } from './state'
${declarations}
export const Route = createFileRoute('/')({
  codeSplitGroupings: ${JSON.stringify(codeSplitGroupings)},
${options.join('\n')}
})
`,
          {
            stubs: {
              './state': {
                init: <T>(value: T) => {
                  initCalls++
                  return value
                },
                seen: (reader: string, values: Record<string, unknown>) => {
                  seen.push({ reader, values })
                  return Object.keys(values).length
                },
              },
            },
          },
        )
        await expectValidModules(route.modules)

        const results: Array<unknown> = []
        for (const reader of ['loader', 'beforeLoad'] as const) {
          if (readers[reader]) {
            results.push(await (await route.load(reader))())
          }
        }
        if (readers.component) {
          results.push(await route.render('component'))
        }
        expect(results).toEqual(
          (['loader', 'beforeLoad', 'component'] as const)
            .filter((reader) => readers[reader])
            .map((reader) =>
              reader === 'component'
                ? `<p>${readers.component!.length}</p>`
                : readers[reader]!.length,
            ),
        )
        expect(initCalls).toBe(inits)

        // Every reader got the same value for each binding.
        for (const name of new Set(Object.values(readers).flat())) {
          const values = seen
            .filter((entry) => name in entry.values)
            .map((entry) => entry.values[name])
          expect(new Set(values).size, name).toBe(1)
        }
        for (const [left, right] of same ?? []) {
          for (const { values } of seen) {
            const read = (path: string) =>
              path.split('.').reduce<any>((value, key) => value[key], values)
            expect(read(left)).toBe(read(right))
          }
        }

        // A function only the component reads is not declared by what loads
        // with the route module; a binding only the loader reads is not
        // declared by what loading the component loads. (These observers
        // load the route again in a fork: the counts above are final.)
        const eagerCode = route.eager
          .filter((id) => route.graph.modules.has(id))
          .map((id) => route.graph.modules.get(id)!)
        const componentCode = (await route.isLazy('component'))
          ? await route.loadedBy('component')
          : []
        const readBy = (name: string) =>
          (Object.keys(readers) as Array<Reader>).filter((reader) =>
            readers[reader]!.includes(name),
          )
        for (const name of new Set(Object.values(readers).flat())) {
          const readersOfName = readBy(name)
          if (
            readersOfName.join() === 'component' &&
            declarations.includes(`function ${name}(`)
          ) {
            expect(
              eagerCode.flatMap((code) => [...declaredNames(code)]),
              name,
            ).not.toContain(name)
          }
          if (readersOfName.join() === 'loader') {
            expect(
              componentCode.flatMap((code) => [...declaredNames(code)]),
              name,
            ).not.toContain(name)
          }
        }
      }

      it.each(cases.filter((row) => !isKnownBug(row, codeSplitGroupings)))(
        '$name',
        assertReads,
      )
      // See `isKnownBug`.
      it.fails.each(cases.filter((row) => isKnownBug(row, codeSplitGroupings)))(
        '$name',
        assertReads,
      )
    },
  )
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
      { stubs: { './thing': { useThing: (options: unknown) => options } } },
    )
    expect([route.options.loader(), await route.render('component')]).toEqual([
      1,
      '<p>1x</p>',
    ])
  })

  it('keeps exported classes next to it importable, with one identity', async () => {
    const seen: Array<unknown> = []
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
      { stubs: { './see': { see: (value: unknown) => seen.push(value) } } },
    )
    await expectValidModules(route.modules)
    const imported = await route.importFromRoute(
      `export { AppError, Cache } from '#route'\n`,
    )
    const loaded = route.options.loader()
    expect(await route.render('component')).toBe('<p>component</p>')
    expect({
      sameInLoader: loaded.AppError === imported.AppError,
      sameInComponent: seen.length === 1 && seen[0] === imported.AppError,
      cached: loaded.cached,
      local: loaded.local,
      cache: new imported.Cache().value,
    }).toEqual({
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
    let inits = 0
    const seen: Array<unknown> = []
    const route = await loadRoute(
      `${head}import { init, see, UI } from './state'
${declarations}
export const Route = createFileRoute('/')({
  loader: () => see(${loader}),
  component: () => <p>{String(see(${component}))}</p>,
})
`,
      {
        stubs: {
          './state': {
            init: <T>(value: T) => {
              inits++
              return value
            },
            see: (value: any) => {
              seen.push(value)
              return typeof value?.read === 'function'
                ? value.read().name
                : 'ok'
            },
            UI: { Title: () => 'title' },
          },
        },
      },
    )
    await expectValidModules(route.modules)
    const loaded = route.options.loader()
    expect(await route.render('component')).toBe(`<p>${loaded}</p>`)
    expect(seen).toHaveLength(2)
    if (loader === component) {
      expect(seen[0]).toBe(seen[1])
    }
    expect(inits).toBe(1)
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
          stubs: {
            './panel': {
              createPanel: () => ({
                Panel: () => 'panel',
                usePanel: () => 'state',
              }),
            },
          },
        },
      )
      await expectValidModules(route.modules)
      expect([
        route.exports.usePanelState(),
        await route.render('component'),
      ]).toEqual(['state', 'panel'])
    },
  )

  it('reads an exported object destructuring created once', async () => {
    let calls = 0
    const route = await loadRoute(
      `${head}import { getConfig } from './config'
export const { title } = getConfig()
export const Route = createFileRoute('/')({
  component: () => <p>{title}</p>,
})
`,
      {
        stubs: {
          './config': {
            getConfig: () => {
              calls++
              return { title: 't' }
            },
          },
        },
      },
    )
    await expectValidModules(route.modules)
    expect([
      await route.render('component'),
      calls,
      route.exports.title,
    ]).toEqual(['<p>t</p>', 1, 't'])
  })
})

// In a JavaScript route file, imports are not elided by a type-aware
// transform, so the route module itself must not import what only split
// options read.
describe('state only split options read, in a .jsx route file', () => {
  const stateRoute = (options: string) => `${head}import { init } from './init'
const store = init({ label: 'shared' })
export const Route = createFileRoute('/')({
${options}
})
`

  it('is created once', async () => {
    let inits = 0
    const route = await loadRoute(
      stateRoute(`  component: () => <p>{store.label}</p>,
  errorComponent: () => <p>{store.label}</p>,`),
      {
        filename: 'route.jsx',
        stubs: {
          './init': {
            init: (value: unknown) => {
              inits++
              return value
            },
          },
        },
      },
    )
    // When the store is created is free (initialiser timing is not pinned);
    // what loads with the route module loads `./init` only to create it.
    const atLoad = inits
    const rendered = [
      await route.render('component'),
      await route.render('errorComponent'),
    ]
    expect({
      rendered,
      inits,
      importsInitWithoutStore: route.eager.includes('./init') && atLoad === 0,
    }).toEqual({
      rendered: ['<p>shared</p>', '<p>shared</p>'],
      inits: 1,
      importsInitWithoutStore: false,
    })
  })

  it('is not created by loading a split option that does not read it', async () => {
    let inits = 0
    const route = await loadRoute(
      stateRoute(`  component: () => <p>{store.label}</p>,
  errorComponent: () => <p>{store.label}</p>,
  notFoundComponent: () => <p>nf</p>,`),
      {
        filename: 'route.jsx',
        stubs: {
          './init': {
            init: (value: unknown) => {
              inits++
              return value
            },
          },
        },
      },
    )
    // Whether the route module creates it is free; loading the
    // notFoundComponent chunk does not (it holds only what it needs, D5).
    const atLoad = inits
    expect(await route.render('notFoundComponent')).toBe('<p>nf</p>')
    expect(inits).toBe(atLoad)
    expect(await route.render('component')).toBe('<p>shared</p>')
    expect(inits).toBe(1)
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
        stubs: {
          './store': { createStore: () => ({ get: () => 'v' }) },
          './chart': { Chart: ({ data }: { data: string }) => data },
        },
      },
    )
    // Nothing the route module loads requests `./chart`.
    expect([route.options.loader(), route.eager.includes('./chart')]).toEqual([
      'v',
      false,
    ])
    expect(await route.render('component')).toBe('v')
  })
})
