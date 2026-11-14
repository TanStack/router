/**
 * The order of effects between top-level declarations, real builds (Vite
 * and Rspack client builds, mounted in a DOM): what a split component
 * shows, and where each declaration loads. The maintainer's shapes: a
 * snapshot of state an unknown call changes after it (the call follows the
 * table into the chunk), and of state written after it through another
 * name, each show the value the source gives; a
 * column helper and its columns only the component reads load with the
 * component although a schema the route module keeps (`validateSearch`)
 * calls something the compiler does not know after them.
 */
import { describe, expect, test } from 'vitest'
import { build, head, routeApp } from '../build-harness'

const timeout = 120_000

const libs = {
  'table.ts': `export function createTable() {
  return { cols: [] as Array<string>, addColumn(c: string) { this.cols.push(c) } }
}
export function snapshot(t: { cols: Array<string> }) {
  return t.cols.length === 0 ? 'none' : t.cols.join(',')
}
export function createColumnHelper(mark: string) {
  return { mark, accessor: (key: string, o: object) => ({ key, ...o }) }
}
`,
  'schema.ts': `export function createSchema(shape: Record<string, string>) {
  return (search: Record<string, unknown>) => ({ ...search, shape })
}
`,
  'registry.ts': `export function createRegistry() {
  return {
    install() {
      ;(globalThis as any).__patched = 'patched'
    },
  }
}
`,
  // what an exported store's effects record, in order
  'log.ts': `export const log: Array<string> = []
;(globalThis as any).__log = log
export function createStore(mark: string) {
  log.push('create')
  return { value: mark }
}
export function register(store: { value: string }, mark: string) {
  log.push('register')
  store.value += mark
}
`,
  // what a shared module's effects record (R151)
  'link.ts': `export function link(a: object, b: object) {
  ;((globalThis as any).__runs ??= []).push('link')
  ;(a as any).peer = b
}
export function make(mark: string) {
  ;((globalThis as any).__runs ??= []).push('make')
  return { mark }
}
`,
  'snap.ts': `export function snap(o: { v: number }) {
  return String(o.v)
}
`,
  // a library's hidden state: a default app, a counter
  'state.ts': `let app: { name: string } | null = null
export function initializeApp(name: string) {
  app = { name }
  return app
}
export function getAuth() {
  if (app === null) {
    throw new Error('no default app')
  }
  return { app }
}
let n = 0
export const takeSnapshot = () => String(n)
export const advance = () => ++n
const stores: Array<{ value: string }> = []
export function createStore() {
  const store = { value: 'empty' }
  stores.push(store)
  return store
}
export function hydrateStores() {
  for (const store of stores) {
    store.value = 'hydrated'
  }
}
`,
}

async function mounted(bundler: 'vite' | 'rspack', route: string) {
  const app = await build({
    bundler,
    env: 'client',
    minify: false,
    files: routeApp(route, { env: 'client', files: libs }),
  })
  try {
    const run = await app.run(
      'await entry.mount(entry.Route.options.component)\nreturn null',
    )
    return {
      text: (run.html as string).replace(/<[^>]*>/g, ''),
      where: (mark: string) => app.where(mark),
    }
  } finally {
    await app.dispose()
  }
}

describe.each(['vite', 'rspack'] as const)('a %s build', (bundler) => {
  // round tools, placement-exec seeds 1112264, 1612539 (toy planner),
  // 1300879, 1600380 (router planner): the write follows the object into
  // its export's module, which the other export's module imports, so it
  // ran before the read
  test(
    'a read of an exported object before a later write keeps the value the source reads when another export reads it',
    async () => {
      const r = await mounted(
        bundler,
        `${head}export const o0: { v: number; p?: number } = { v: 1 }
const r2 = o0.p
o0.p = 6
export const r13 = [r2]
export const Route = createFileRoute('/')({
  component: () => <p>{String(r2)} {String(r13[0])}</p>,
})
`,
      )
      expect(r.text).toBe('undefined undefined')
    },
    timeout,
  )

  // round tools, fuzz seeds 6104927, 6407720, 6510105, 6518119 (Start,
  // React, line-minimised; the free names are globals), toy seed 1409092: a
  // statement using an export and a `let` the component's code reads
  // followed the export into its module, which then read the `let` of the
  // route module at its evaluation
  test(
    'a statement using an export and a binding only split code reads runs when the route module loads, in source order',
    async () => {
      const app = await build({
        bundler,
        env: 'client',
        minify: false,
        files: routeApp(
          `${head}import '../globals'
declare global {
  var fmt: (...a: Array<unknown>) => number
  var log: (tag: string, ...a: Array<unknown>) => unknown
}
export function Ex2() { return <i>Ex2:{globalThis.fmt(1)}</i> }
let l4: unknown = globalThis.fmt(2)
l4 = globalThis.log('T2', l4)
async function f5(x?: unknown) { return globalThis.fmt(x, l4) }
globalThis.log('T5', l4, Ex2)
const P8 = () => <div>P8:{globalThis.fmt(3)}<Ex2 /></div>
export const Route = createFileRoute('/')({
  component: () => <b>I:{globalThis.fmt(P8, f5)}</b>,
})
`,
          {
            env: 'client',
            files: {
              ...libs,
              'globals.ts': `const g = globalThis as any
g.__effects = []
g.fmt = (...a: Array<unknown>) => a.length
g.log = (tag: string, ...a: Array<unknown>) => {
  g.__effects.push([tag, ...a.map((x) => typeof x)].join(':'))
  return a[0]
}
`,
            },
          },
        ),
      })
      try {
        const run = await app.run(
          'const atLoad = [...globalThis.__effects]\nawait entry.mount(entry.Route.options.component)\nreturn atLoad',
        )
        expect(run.result).toEqual(['T2:number', 'T5:number:function'])
        expect((run.html as string).replace(/<[^>]*>/g, '')).toBe('I:2')
      } finally {
        await app.dispose()
      }
    },
    timeout,
  )

  test(
    'a column helper and the columns only the component reads load with it, before a schema the route module keeps',
    async () => {
      const r = await mounted(
        bundler,
        `${head}import { createColumnHelper } from '../table'
import { createSchema } from '../schema'
const helper = createColumnHelper('MARK_HELPER')
const columns = [helper.accessor('MARK_COLUMNS', {})]
export const Route = createFileRoute('/')({
  validateSearch: createSchema({ page: 'number' }),
  component: () => <p>{columns.map((c) => c.key).join(',')}</p>,
})
`,
      )
      expect(r.text).toBe('MARK_COLUMNS')
      expect(r.where('MARK_HELPER')).toBe('lazy')
      expect(r.where('MARK_COLUMNS')).toBe('lazy')
    },
    timeout,
  )
})

// What no order rule reorders without a warning (DESIGN-order-none.md
// §3 and DESIGN-order-guarantee-aggressive.md S-1, S-2): declarations
// holding values move past what follows them, statements included, when
// they share state the compiler cannot see.
describe.each(['vite', 'rspack'] as const)(
  'what no order rule reorders, a %s build',
  (bundler) => {
    test(
      'a setup call only the component reads runs after a call that needs it, which throws (S-1)',
      async () => {
        await expect(
          mounted(
            bundler,
            `${head}import { initializeApp, getAuth } from '../state'
const app = initializeApp('x')
const auth = getAuth()
export const Route = createFileRoute('/')({
  loader: () => auth.app.name,
  component: () => <p>{app.name}</p>,
})
`,
          ),
        ).rejects.toThrow(/no default app/)
      },
      timeout,
    )

    test(
      'a snapshot only the component reads sees the state a later value advanced (S-2)',
      async () => {
        const r = await mounted(
          bundler,
          `${head}import { takeSnapshot, advance } from '../state'
const before = takeSnapshot()
const state = advance()
export const Route = createFileRoute('/')({
  loader: () => state,
  component: () => <p>{before}</p>,
})
`,
        )
        // (the source shows 0)
        expect(r.text).toBe('1')
      },
      timeout,
    )

    test(
      'a store only the component reads is created after the statement that hydrates the stores (a)',
      async () => {
        const r = await mounted(
          bundler,
          `${head}import { createStore, hydrateStores } from '../state'
const store = createStore()
hydrateStores()
export const Route = createFileRoute('/')({
  component: () => <p>{store.value}</p>,
})
`,
        )
        // (the source shows hydrated)
        expect(r.text).toBe('empty')
      },
      timeout,
    )

    // R151: a statement using bindings of two split options, and an
    // effectful declaration two split options read, go to one lazy shared
    // module both chunks import: the effect runs once, when the first of
    // them loads, whichever it is
    test.each([
      [
        'an effectful declaration two split options read',
        `import { make } from '../link'
const x = make('MARK_SHARED_X')
export const Route = createFileRoute('/')({
  component: () => <p>{x.mark}</p>,
  errorComponent: () => <p>{x.mark}</p>,
})
`,
        'make',
      ],
    ])(
      '%s runs once, when the first of their chunks loads, whichever',
      async (_, body, effect) => {
        const app = await build({
          bundler,
          env: 'client',
          minify: false,
          files: routeApp(`${head}${body}`, { env: 'client', files: libs }),
        })
        try {
          expect(app.where(/MARK_SHARED_[ABX]/)).toBe('lazy')
          for (const first of ['component', 'errorComponent']) {
            const second =
              first === 'component' ? 'errorComponent' : 'component'
            const run = await app.run(
              `const before = [...(globalThis.__runs ?? [])]
await entry.Route.options.${first}.preload()
const mid = [...globalThis.__runs]
await entry.Route.options.${second}.preload()
return [before, mid, [...globalThis.__runs]]`,
            )
            expect(run.result, first).toEqual([[], [effect], [effect]])
          }
        } finally {
          await app.dispose()
        }
      },
      timeout,
    )
  },
)
