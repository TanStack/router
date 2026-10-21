/**
 * Module-level bindings read by route options (SPEC G3, J2.4, J2.5, J2.12),
 * across binding kinds, groupings and readers. Split from
 * code-splitter-module-state.test.ts (same harness, `./route-app`): its own
 * file so that the fast tier runs it in parallel with the rest.
 */
import { describe, expect, it } from 'vitest'
import { expectValidModules, head, holdsMarker, loadRoute } from './route-app'
import type { CodeSplittingOptions } from '../src/vite'

type CodeSplitGroupings = NonNullable<CodeSplittingOptions['defaultBehavior']>

// Module-level bindings read by route options, across binding kinds,
// groupings and readers: every reader gets the value, the binding is created
// once with one identity, a function only the component reads is not in
// what loads with the route module, and a binding only the loader reads is
// not in what loading the component loads (D5: absence of the user's own
// code, told by a string marker in its body or initializer, whatever the
// compiler names or prints). (Where a const or class only the component
// reads is initialised, and so when, is free.)
describe('module-level bindings read by route options', () => {
  type Kind = 'const' | 'function' | 'class'
  type Reader = 'loader' | 'component' | 'beforeLoad'

  /** The user marker in the code declaring `name`. */
  const marker = (name: string) => `MARK_BINDING_${name}`

  /** Declares `name` as `kind`; consts and classes call `init` once. */
  const declare = (kind: Kind, name: string) =>
    ({
      const: `const ${name} = init({ name: '${marker(name)}' })`,
      function: `function ${name}() { return '${marker(name)}' }`,
      class: `class ${name} { static created = init('${marker(name)}') }`,
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

  const stateModule = `export let initCalls = 0
export const entries: Array<{ reader: string; values: Record<string, unknown> }> = []
export const init = <T,>(value: T): T => {
  initCalls++
  return value
}
export const seen = (reader: string, values: Record<string, unknown>) => {
  entries.push({ reader, values })
  return Object.keys(values).length
}
`

  describe.each(groupings)(
    'with $name',
    ({ groupings: codeSplitGroupings }) => {
      const assertReads = async ({
        declarations,
        readers,
        inits,
        same,
      }: Case) => {
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
          { files: { 'state.ts': stateModule } },
        )
        await expectValidModules(route)

        const names = [...new Set(Object.values(readers).flat())]
        const observed = await route.run<{
          results: Array<unknown>
          initCalls: number
          distinct: Record<string, number>
          same: Array<boolean>
          eagerCode: Array<string>
          componentCode: Array<string>
        }>(`// What loads with the route module, and what loading the component
// loads on top of it
const eager = compiled()
const before = new Set(eager)
await trigger('component')
const componentLoads = compiled().filter((request) => !before.has(request))
const readers = ${JSON.stringify(readers)}
const results = []
for (const reader of ['loader', 'beforeLoad']) {
  if (readers[reader]) results.push(await (await load(reader))())
}
if (readers.component) results.push(await render('component'))
const state = await app('state.ts')
// Every reader got the same value for each binding.
const distinct = {}
for (const name of ${JSON.stringify(names)}) {
  distinct[name] = new Set(
    state.entries.filter((entry) => name in entry.values).map((entry) => entry.values[name]),
  ).size
}
const read = (values, path) => path.split('.').reduce((value, key) => value[key], values)
const same = []
for (const [left, right] of ${JSON.stringify(same ?? [])}) {
  for (const { values } of state.entries) same.push(read(values, left) === read(values, right))
}
return {
  results,
  initCalls: state.initCalls,
  distinct,
  same,
  eagerCode: await Promise.all(eager.map(served)),
  componentCode: await Promise.all(componentLoads.map(served)),
}`)
        expect(observed.results).toEqual(
          (['loader', 'beforeLoad', 'component'] as const)
            .filter((reader) => readers[reader])
            .map((reader) =>
              reader === 'component'
                ? `<p>${readers.component!.length}</p>`
                : readers[reader]!.length,
            ),
        )
        expect(observed.initCalls).toBe(inits)
        expect(observed.distinct).toEqual(
          Object.fromEntries(names.map((name) => [name, 1])),
        )
        expect(observed.same.every(Boolean)).toBe(true)

        // A function only the component reads is not in what loads with the
        // route module; a binding only the loader reads is not in what
        // loading the component loads.
        const readBy = (name: string) =>
          (Object.keys(readers) as Array<Reader>).filter((reader) =>
            readers[reader]!.includes(name),
          )
        for (const name of names) {
          const readersOfName = readBy(name)
          if (
            readersOfName.join() === 'component' &&
            declarations.includes(`function ${name}(`)
          ) {
            expect(
              observed.eagerCode.some((code) =>
                holdsMarker(code, marker(name)),
              ),
              name,
            ).toBe(false)
          }
          if (readersOfName.join() === 'loader') {
            expect(
              observed.componentCode.some((code) =>
                holdsMarker(code, marker(name)),
              ),
              name,
            ).toBe(false)
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
