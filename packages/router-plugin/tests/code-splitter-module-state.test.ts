import { describe, expect, it } from 'vitest'
import {
  buildAndRun,
  compileRouteModules,
  countAcrossModules,
  declarationOf,
  expectValidModules,
  head,
  importSources,
  loadRoute,
} from './regression-helpers'
import type { CodeSplitGroupings } from '../src/core/constants'

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
    // Known limitation on main: the chunk gets its own copy of `state` and
    // `renders`, so callers of the exported functions are not checked here.
    // Pinned in known-bugs-code-splitter.test.ts ("a binding read by an exported function").
    // `store.count` is 2: the chunk mutated the store the route module exports
    expect(result).toEqual(['<p>1/1/1</p>', '<p>2/2/2</p>', 2])
  }, 30_000)

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
      (await route.load('component'))(),
      calls,
    ]).toEqual(['A', '<div>{"x":1}</div>', 1])
  })

  // Source: Qwik optimizer test.rs root_level_self_referential_qrl,
  // example_self_referential_component_migration
  it('declares mutually recursive components used by two lazy chunks once', async () => {
    const route =
      await loadRoute(`${head}function A({ depth }) { return depth ? <B depth={depth - 1} /> : <i>a</i> }
function B({ depth }) { return <b><A depth={depth} /></b> }
export const Route = createFileRoute('/')({
  component: () => <A depth={1} />,
  errorComponent: () => <B depth={0} />,
})
`)
    await expectValidModules(route.modules)
    expect([
      (await route.load('component'))(),
      (await route.load('errorComponent'))(),
    ]).toEqual(['<b><i>a</i></b>', '<b><i>a</i></b>'])
    expect(countAcrossModules(route.modules, declarationOf('A'))).toBe(1)
    expect(countAcrossModules(route.modules, declarationOf('B'))).toBe(1)
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
    expect([route.options.loader(), (await route.load('component'))()]).toEqual(
      [1, '<div>true</div>'],
    )
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
    expect([route.options.loader(), (await route.load('component'))()]).toEqual(
      [[0], '<p>1</p>'],
    )
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
    expect([(await route.load('component'))(), calls]).toEqual([
      '<p>object</p>',
      1,
    ])
  })

  // Source: #8504 (code-splitter-exported-bindings-identity.test.ts).
  it('gives the split component the state the route file configures before it creates it', async () => {
    const html = await buildAndRun(
      `${head}import { configure, createStore } from '../store'
configure(5)
const store = createStore()
export function useCount() {
  return store.count
}
function Page() {
  return <p>{useCount()}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
      `return await entry.render(entry.Route.options.component)`,
      {
        files: {
          'store.ts': `let initial = 0
export function configure(count: number) {
  initial = count
}
export function createStore() {
  return { count: initial }
}
`,
        },
      },
    )
    expect(html).toBe('<p>5</p>')
  }, 30_000)
})

describe('split chunks keep reassigned bindings next to their writers', () => {
  // Source: React Router route-chunks-test.ts "reassignment"; babel-dead-code-elimination
  // find-removable-bindings.test.ts "constant violations mark as external"
  it('moves a binding that only the split component reassigns into its chunk', async () => {
    const { modules } =
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
    expect(modules.reference).not.toContain('initial-marker')
    expect(importSources(modules.reference!)).not.toContain('./next')
    expect(modules['virtual component']).toMatch(declarationOf('current'))
    expect(modules['virtual component']).toContain('initial-marker')
    await expectValidModules(modules)
  })

  // Source: Next.js ssg/getStaticProps/should-support-babel-style-memoized-function
  it.each([
    { name: 'the component', loader: `'data'`, loaded: 'data' },
    {
      name: 'the loader and the component',
      loader: 'fetchData()',
      loaded: 'memoized',
    },
  ])(
    'keeps a self-reassigning function used by $name working',
    async ({ loader, loaded }) => {
      const route = await loadRoute(`${head}function fetchData() {
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
      await expectValidModules(route.modules)
      const component = await route.load('component')
      expect([
        route.options.loader(),
        component(),
        route.options.loader(),
        component(),
      ]).toEqual([loaded, '<div>memoized</div>', loaded, '<div>memoized</div>'])
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
    expect([route.options.loader(), (await route.load('component'))()]).toEqual(
      ['data', '<p>7</p>'],
    )
  })
})

// Module-level bindings read by route options, across binding kinds,
// groupings and readers: every reader gets the value, the binding is created
// once with one identity, and a binding only one module needs is not
// declared in the others.
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
   * calls a function, read by one split option only, is declared in that
   * option's chunk and also kept in the route module (dead-code elimination
   * keeps a class with a side-effectful static initializer), so the class is
   * created twice.
   * Impact: what the static initializer does (registrations, counters) runs
   * again when the chunk loads, and the route module holds a second class.
   */
  const isKnownBug = (row: Case, codeSplitGroupings: CodeSplitGroupings) => {
    const [reader, ...others] = Object.keys(row.readers) as Array<Reader>
    const split = codeSplitGroupings.some((group) =>
      group.includes(reader as never),
    )
    return row.name.startsWith('a class') && others.length === 0 && split
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
          results.push((await route.load('component'))())
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

        // A binding only the component reads is not declared in the route
        // module; one only the loader reads is not in the component's chunk.
        const componentChunks = Object.keys(route.modules).filter(
          (label) =>
            label.startsWith('virtual ') &&
            label.slice('virtual '.length).split('-').includes('component'),
        )
        const readBy = (name: string) =>
          (Object.keys(readers) as Array<Reader>).filter((reader) =>
            readers[reader]!.includes(name),
          )
        for (const name of new Set(Object.values(readers).flat())) {
          const readersOfName = readBy(name)
          if (readersOfName.join() === 'component') {
            expect(route.modules.reference, name).not.toMatch(
              declarationOf(name),
            )
          }
          if (readersOfName.join() === 'loader') {
            for (const chunk of componentChunks) {
              expect(route.modules[chunk], name).not.toMatch(
                declarationOf(name),
              )
            }
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
