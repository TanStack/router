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
  test(
    'a snapshot of a table before an unknown call adds a column shows the table without it',
    async () => {
      const r = await mounted(
        bundler,
        `${head}import { createTable, snapshot } from '../table'
const table = createTable()
const columns = snapshot(table)
table.addColumn('MARK_ADD')
export const Route = createFileRoute('/')({
  component: () => <p>{columns}</p>,
})
`,
      )
      expect(r.text).toBe('none')
      // the statement follows the table into the chunk, in source order
      expect(r.where('MARK_ADD')).toBe('lazy')
    },
    timeout,
  )

  test(
    'a snapshot of an object before a write through another name shows the value before the write',
    async () => {
      const r = await mounted(
        bundler,
        `${head}import { snap } from '../snap'
const cfg = { v: 1 }
const alias = cfg
const seen = snap(cfg)
alias.v = 2
export const Route = createFileRoute('/')({
  component: () => <p>{seen}</p>,
})
`,
      )
      expect(r.text).toBe('1')
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

    test(
      'a statement patching a global with a registry only the component reads runs when the chunk loads',
      async () => {
        const app = await build({
          bundler,
          env: 'client',
          minify: false,
          files: routeApp(
            `${head}import { createRegistry } from '../registry'
const registry = createRegistry()
registry.install()
export const Route = createFileRoute('/')({
  component: () => <p>{registry ? 'ok' : ''}</p>,
})
`,
            { env: 'client', files: libs },
          ),
        })
        try {
          const { result } = await app.run(
            'const before = globalThis.__patched ?? "unpatched"\nawait entry.mount(entry.Route.options.component)\nreturn [before, globalThis.__patched]',
          )
          // (the source patches it when the route module loads)
          expect(result).toEqual(['unpatched', 'patched'])
        } finally {
          await app.dispose()
        }
      },
      timeout,
    )

    // R151: a statement using bindings of two split options, and an
    // effectful declaration two split options read, go to one lazy shared
    // module both chunks import: the effect runs once, when the first of
    // them loads, whichever it is
    test.each([
      [
        'a statement using bindings of two split options',
        `import { link } from '../link'
const a = { x: 'MARK_SHARED_A' }
const b = { y: 'MARK_SHARED_B' }
link(a, b)
export const Route = createFileRoute('/')({
  component: () => <p>{a.x}</p>,
  errorComponent: () => <p>{b.y}</p>,
})
`,
        'link',
      ],
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

    // R149, extended: an extracted export's module is a destination. An
    // export with effects only the component reads is extracted, the
    // statement using only it follows it there, and both run when the
    // component's chunk imports the export (the module is flagged
    // side-effect free: nothing runs while nothing uses it)
    test(
      'an exported store with effects and the statement registering it run when the component uses the export',
      async () => {
        const app = await build({
          bundler,
          env: 'client',
          minify: false,
          files: routeApp(
            `${head}import { createStore, register } from '../log'
export const store = createStore('MARK_STORE')
register(store, '+MARK_REGISTER')
export const Route = createFileRoute('/')({
  component: () => <p>{store.value}</p>,
})
`,
            { env: 'client', files: libs },
          ),
        })
        try {
          expect(app.where('MARK_STORE')).toBe('lazy')
          expect(app.where('MARK_REGISTER')).toBe('lazy')
          const run = await app.run(
            'const before = [...(globalThis.__log ?? [])]\nawait entry.mount(entry.Route.options.component)\nreturn [before, [...globalThis.__log]]',
          )
          expect(run.result).toEqual([[], ['create', 'register']])
          expect((run.html as string).replace(/<[^>]*>/g, '')).toBe(
            'MARK_STORE+MARK_REGISTER',
          )
        } finally {
          await app.dispose()
        }
      },
      timeout,
    )
  },
)
