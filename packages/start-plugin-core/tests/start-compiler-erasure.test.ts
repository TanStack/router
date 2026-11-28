import { beforeAll, describe, expect, test } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  callFromClient,
  callServerFnThroughCallers,
  createStartHost,
  inPage,
  serveCase,
} from './regression-helpers'
import type { StartHost } from './start-host'
import type { ServedCase } from './regression-helpers'

// Erasure of code meant for the other environment, against `main` (R155,
// spec-phase1-handlers-erasure.md 4.3): the rows `main` gets right, which
// moving handler modules and erasure-only plans to the one placement must
// not move (kind B: `main` parity), and the rows where the compiler does
// better than `main` (better-than-`main` pins: `main` fails them). Each
// test names its row (4.3, appendix B). Observed through the public Start
// host: the client in a real page, the server in the SSR environment and in
// real requests; "loads" is what the environment's module graph reaches.

/**
 * The route files of the one-instance rows (below): an unexported server fn
 * the route's component calls on SSR, from the split chunk. Each route
 * records into a module of its own.
 */
function routeFiles(): Record<string, string> {
  const head = `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
`
  const page = (fn: string, also = '') => `function Page() {
  void ${fn}({ data: {} })${also}
  return <p data-url={${fn}.url}>page</p>
}
`
  return {
    // what the validator and the handler see, in order
    'src/notes-chain.ts': `const notes: Array<number> = []
export const note = (n: number) => {
  notes.push(n)
  return [...notes]
}
`,
    'src/routes/chain-state.tsx': `${head}import { note } from '../notes-chain'
let seen = 0
const save = createServerFn({ method: 'POST' })
  .validator(() => ({ n: ++seen }))
  .handler(({ data }) => Response.json(note(data.n)))
export const Route = createFileRoute('/chain-state')({ component: Page })
${page('save')}`,
    // how often a validator schema is built, per route
    ...Object.fromEntries(
      ['once', 'read'].map((key) => [
        `src/schema-${key}.ts`,
        `let builds = 0
export const countedSchema = () => {
  builds++
  return (data: unknown) => data
}
export const schemaBuilds = () => builds
`,
      ]),
    ),
    'src/routes/schema-once.tsx': `${head}import { countedSchema, schemaBuilds } from '../schema-once'
const schema = countedSchema()
const check = createServerFn({ method: 'POST' })
  .validator(schema)
  .handler(() => Response.json(schemaBuilds()))
export const Route = createFileRoute('/schema-once')({ component: Page })
${page('check')}`,
    // a handler-only initialiser naming a declaration the route module keeps
    // (R157 rule 4): it runs once, at load (review-a1-classes-stay 2)
    ...Object.fromEntries(
      ['class', 'const'].map((key) => [
        `src/inits-${key}.ts`,
        `export const inits: Array<string> = []
export const track = (name: string, ..._rest: Array<unknown>) => {
  inits.push(name)
  return name
}
export const count = (name: string) => inits.filter((n) => n === name).length
`,
      ]),
    ),
    'src/routes/handler-init-class.tsx': `${head}import { count, track } from '../inits-class'
class K { static made = track('K-static'); v() { return 'k' } }
const k = (track('k-init'), new K())
const getK = createServerFn({ method: 'POST' }).handler(() => Response.json([k.v(), count('k-init')]))
function Page() { return <p data-url={getK.url}>{new K().v()}</p> }
export const Route = createFileRoute('/handler-init-class')({ component: Page })
`,
    'src/routes/handler-init-const.tsx': `${head}import { count, track } from '../inits-const'
const cfg = { v: 'k' }
track('stmt', cfg.v)
const k = (track('k-init'), [cfg])
const getK = createServerFn({ method: 'POST' }).handler(() => Response.json([k[0]!.v, count('k-init')]))
function Page() { return <p data-url={getK.url}>{cfg.v}</p> }
export const Route = createFileRoute('/handler-init-const')({ component: Page })
`,
    // a declaration only its own text names, next to state the component
    // reads (review-a1-classes-stay-round2 s11): the split chunk's copy of
    // `routes` takes it, as main's chunk does
    'src/routes/self-named-init.tsx': `${head}const routes: Array<string> = []
const reg: any = (routes.push('x'), { again: () => reg })
const count = createServerFn({ method: 'POST' }).handler(() => Response.json(routes.length))
function Page() { return <p data-n={routes.length} data-url={count.url}>page</p> }
export const Route = createFileRoute('/self-named-init')({ component: Page })
`,
    // a class a handler names only in a type, reading a `.server` module
    // (review-a1-classes-stay-round2 s8): it leaves the client with it, and
    // on the server it runs at load with it (round 3 s8 server); the loader
    // reports what ran
    'src/class-type-db.server.ts': `;(globalThis as any).caseClassTypeDb = 'loaded'
export const db = { all: () => ['row'] }
`,
    'src/routes/class-type-in-handler.tsx': `${head}import { db } from '../class-type-db.server'
class Repo { static made = ((globalThis as any).caseClassTypeRepo = 'made'); all() { return db.all() } }
const list = createServerFn({ method: 'POST' }).handler(() => { const r: Repo | null = null; return Response.json(String(r)) })
function Page() { return <p data-loaded={Route.useLoaderData()} data-url={list.url}>page</p> }
export const Route = createFileRoute('/class-type-in-handler')({
  loader: () => [(globalThis as any).caseClassTypeRepo, (globalThis as any).caseClassTypeDb].map(String).join(','),
  component: Page,
})
`,
    // a class or enum a handler names only in a type (review-a1-classes-stay-round3
    // s16, s18): the server runs it at route load, as main; the loader reads
    // what it registered
    ...Object.fromEntries(
      ['class', 'enum'].map((key) => [
        `src/registry-${key}.ts`,
        `const items: Array<string> = []
export const registry = {
  add: (name: string) => (items.push(name), name),
  list: () => items.join(','),
}
`,
      ]),
    ),
    'src/routes/handler-type-class.tsx': `${head}import { registry } from '../registry-class'
class Repo { static made = registry.add('repo'); all() { return 1 } }
const list = createServerFn({ method: 'POST' }).handler(() => { const r: Repo | null = null; return Response.json(String(r)) })
function Page() { return <p data-loaded={Route.useLoaderData()} data-url={list.url}>page</p> }
export const Route = createFileRoute('/handler-type-class')({ loader: () => registry.list(), component: Page })
`,
    'src/routes/handler-type-enum.tsx': `${head}import { registry } from '../registry-enum'
enum Kind { A = registry.add('kind') as any }
const list = createServerFn({ method: 'POST' }).handler((): Kind | null => null)
function Page() { return <p data-loaded={Route.useLoaderData()} data-url={list.url}>page</p> }
export const Route = createFileRoute('/handler-type-enum')({ loader: () => registry.list(), component: Page })
`,
    // a class only <Hydrate> children name, in a type (round 3 s17): it
    // stays in the client route module and runs when it loads, as main
    'src/routes/hydrate-type-class.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { Hydrate } from '@tanstack/react-start'
class Chart { static made = ((globalThis as any).caseHydrateTypeChart = 'made'); draw() { return 'chart' } }
function Page() { return <div><Hydrate when="visible"><p>{((c: Chart | null) => String(c))(null)}</p></Hydrate></div> }
export const Route = createFileRoute('/hydrate-type-class')({ component: Page })
`,
    // a `let` the component and the error component read (two split
    // chunks) and a handler assigns: on the server the component reads what
    // the handler wrote
    'src/routes/shared-writer.tsx': `${head}let filters = { q: 'start' }
const setQ = createServerFn({ method: 'POST' }).handler(() => {
  filters = { q: 'set' }
  return Response.json('ok')
})
function Page() {
  return <p data-q={filters.q} data-url={setQ.url}>page</p>
}
function Err() { return <b data-q={filters.q}>err</b> }
export const Route = createFileRoute('/shared-writer')({ component: Page, errorComponent: Err })
`,
    // a <Hydrate> boundary inside a route option the client deletes
    // (`server`, `headers`): nothing of the option, its boundary included,
    // loads on the client
    'src/hydrate-heavy.server.tsx': `export const Heavy = () => <b>heavy</b>\n`,
    'src/hydrate-render.server.ts': `export const render = (_: unknown) => 'rendered'\n`,
    ...Object.fromEntries(
      [
        [
          'server',
          '',
          `server: { handlers: { GET: async () => new Response(render(<Hydrate><Heavy /></Hydrate>)) } },`,
        ],
        [
          'headers',
          `const title = 'MARK_HEADERS_TITLE'\nfunction Mail() { return <h1>{title}</h1> }\n`,
          `headers: () => ({ 'x-preview': render(<Hydrate><Mail /><Heavy /></Hydrate>) }),`,
        ],
      ].map(([key, decls, option]) => [
        `src/routes/hydrate-in-${key}.tsx`,
        `import { createFileRoute } from '@tanstack/react-router'
import { Hydrate } from '@tanstack/react-start'
import { Heavy } from '../hydrate-heavy.server'
import { render } from '../hydrate-render.server'
${decls}function Page() { return <p>page</p> }
export const Route = createFileRoute('/hydrate-in-${key}')({
  ${option}
  component: Page,
})
`,
      ]),
    ),
    // a server fn created in an object (hoisted: a unit the compiler
    // generates) that only the split component reads
    'src/routes/hoisted-in-object.tsx': `${head}const fns = { a: createServerFn({ method: 'POST' }).handler(() => Response.json('MARK_HOISTED')) }
function Page() { return <p data-url={fns.a.url}>page</p> }
export const Route = createFileRoute('/hoisted-in-object')({ component: Page })
`,
    'src/routes/schema-read.tsx': `${head}import { countedSchema, schemaBuilds } from '../schema-read'
const schema = countedSchema()
const check = createServerFn({ method: 'POST' })
  .validator(schema)
  .handler(() => Response.json(schemaBuilds()))
export const Route = createFileRoute('/schema-read')({ component: Page })
${page('check', '\n  schema({})')}`,
  }
}

let host: StartHost
beforeAll(async () => {
  host = await createStartHost({ files: routeFiles() })
  return () => host.close()
})

const serverFn = `import { createServerFn } from '@tanstack/react-start'\n`

/** `./calls` records each call, in order, in the realm it runs in (`calls`). */
const callsFile = {
  'calls.ts': `export const calls: Array<string> = []
export const connect = (name: string, read?: () => unknown) => {
  calls.push(name)
  return { name, read, q: () => name }
}
`,
}

/** What `./calls` recorded in the page after importing the module (a fresh document). */
async function clientCalls(served: ServedCase, run = '') {
  return inPage<Array<string>>(
    served,
    `${run}
return [...(await load('calls.ts')).calls]`,
  )
}

/** What `./calls` recorded on the server so far. */
async function serverCalls(served: ServedCase) {
  return [...((await served.ssr('calls.ts')).calls as Array<string>)]
}

/** A `.server` module the client must not load. */
const dbServer = (name = 'db.server.ts') => ({
  [name]: `export const db = { a: 1, ready: true, list: ['x'], q: () => 'db', users: () => ['u'], ping: () => {}, warm: () => {} }
export const connect = () => db
`,
})

describe('main parity', () => {
  // e02: a cycle through an effectful declaration only the handler reads
  test('a cycle through an effectful const goes from the client; the server runs it once', async () => {
    const served = await serveCase(host, {
      ...callsFile,
      'module.tsx': `${serverFn}import { connect } from './calls'
const pool = connect('pool', () => getPool())
function getPool() { return pool }
export const fn = createServerFn().handler(async () => getPool().name)`,
    })
    expect(await clientCalls(served, `await load('module.tsx')`)).toEqual([])
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('pool')
    expect(await serverCalls(served)).toEqual(['pool'])
  })

  // e06, e07: an effectful initialiser the handler alone reads leaves the
  // client with its import; one an export reads too stays and runs once
  test('an effectful initialiser only the handler reads leaves the client with its import', async () => {
    const served = await serveCase(host, {
      ...callsFile,
      'module.tsx': `${serverFn}import { connect } from './calls'
const db = connect('db')
export const fn = createServerFn().handler(async () => db.q())`,
    })
    expectNotLoaded(await served.loads(), ['./calls'])
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('db')
    expect(await serverCalls(served)).toEqual(['db'])
  })

  test('an effectful initialiser an export reads too stays on the client and runs once', async () => {
    const served = await serveCase(host, {
      ...callsFile,
      'module.tsx': `${serverFn}import { connect } from './calls'
const db = connect('db')
export const fn = createServerFn().handler(async () => db.q())
export const g = () => db.q()`,
    })
    expect(await clientCalls(served, `await load('module.tsx')`)).toEqual([
      'db',
    ])
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('db')
    expect(await serverCalls(served)).toEqual(['db'])
  })

  // e08, n1: named, default and namespace imports only the handler reads
  // leave the client; a bare import and an import nothing reads stay
  test('imports the handler reads leave the client; a bare and a never-read import stay', async () => {
    const served = await serveCase(host, {
      'a.server.ts': `export const named = 'a'`,
      'b.server.ts': `export default 'b'`,
      'c.server.ts': `export const x = 'c'`,
      'polyfill.ts': `;(globalThis as any).caseParityPolyfill = true`,
      'never.server.ts': `export const never = 'never'`,
      'module.tsx': `${serverFn}import { named } from './a.server'
import def from './b.server'
import * as ns from './c.server'
import './polyfill'
import { never } from './never.server'
export const fn = createServerFn().handler(async () => [named, def, ns.x])`,
    })
    const loads = await served.loads()
    expectNotLoaded(loads, ['./a.server', './b.server', './c.server'])
    expect(loads).toContain('./polyfill')
    expect(loads).toContain('./never.server')
    expect(await callServerFnThroughCallers(served, 'module.fn')).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  // e11, e11b: a statement reading a binding only the handler reads keeps
  // the binding and its import, and runs, in both environments
  test('statements on a binding only the handler reads stay and run in both environments', async () => {
    const served = await serveCase(host, {
      ...callsFile,
      'module.tsx': `${serverFn}import { connect } from './calls'
const db = connect('db')
if (db.name) { connect('if') }
try { connect('try') } catch {}
for (const x of [db.name]) { connect('for:' + x) }
void db
;(() => connect('iife:' + db.name))()
export const fn = createServerFn().handler(async () => db.q())`,
    })
    const ran = ['db', 'if', 'try', 'for:db', 'iife:db']
    expect(await clientCalls(served, `await load('module.tsx')`)).toEqual(ran)
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('db')
    // each once on the server (where and when: the kind A row of the dispatch, R154)
    expect((await serverCalls(served)).sort()).toEqual([...ran].sort())
  })

  // e12: `export { db }` keeps it on the client
  test('a binding the handler reads and `export { }` names stays on the client', async () => {
    const served = await serveCase(host, {
      ...callsFile,
      'module.tsx': `${serverFn}import { connect } from './calls'
const db = connect('db')
export const fn = createServerFn().handler(async () => db.q())
export { db }`,
    })
    expect(
      await inPage(served, `return (await load('module.tsx')).db.name`),
    ).toBe('db')
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('db')
  })

  // e26: a kept function writes the container the handler reads: the server
  // has one container
  test('an exported function writing the container the handler reads works on the server', async () => {
    const served = await serveCase(host, {
      'module.tsx': `${serverFn}const cache = new Map<string, number>()
export function remember(k: string, v: number) { cache.set(k, v) }
export const size = createServerFn().handler(async () => cache.size)`,
    })
    const module = await served.ssr()
    module.remember('a', 1)
    expect(await callFromClient(served, 'module.size')).toBe(1)
    expect(
      await inPage(
        served,
        `const m = await load('module.tsx')
m.remember('k', 2)
return typeof m.remember`,
      ),
    ).toBe('function')
  })

  // e29b: the handler assigns a `let` an export reads: the client keeps the
  // `let`; on the server, the export sees what the handler assigned
  test('a `let` the handler assigns and an export reads is one binding on the server', async () => {
    const served = await serveCase(host, {
      ...dbServer('load.server.ts'),
      'module.tsx': `${serverFn}import { db } from './load.server'
let cache: unknown
export const fill = createServerFn().handler(async () => { cache = db.q(); return 'filled' })
export const peek = () => cache`,
    })
    expect(
      await inPage(served, `return (await load('module.tsx')).peek() ?? null`),
    ).toBe(null)
    expectNotLoaded(await served.loads(), ['./load.server'])
    expect(await callFromClient(served, 'module.fill')).toBe('filled')
    expect((await served.ssr()).peek()).toBe('db')
  })

  // t2, t3: a value import the handler reads by value and kept code only in
  // a type (`typeof db`, `x is Model`) leaves the client
  test('a const the handler reads, and kept code only by `typeof`, leaves the client', async () => {
    const served = await serveCase(host, {
      ...dbServer(),
      'module.tsx': `${serverFn}import { connect } from './db.server'
const db = connect()
export type DbType = typeof db
export function describe(x: typeof db) { return String(x.a) }
export const fn = createServerFn().handler(async () => db.q())`,
    })
    expectNotLoaded(await served.loads(), ['./db.server'])
    expect(
      await inPage(
        served,
        `return (await load('module.tsx')).describe({ a: 2 })`,
      ),
    ).toBe('2')
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('db')
  })

  test('a class the handler constructs and kept code names only in a type predicate leaves the client', async () => {
    const served = await serveCase(host, {
      'model.server.ts': `export class Model { name = 'model' }`,
      'module.tsx': `${serverFn}import { Model } from './model.server'
export const fn = createServerFn().handler(async () => new Model().name)
export function is(x: unknown): x is Model { return x !== null }`,
    })
    expectNotLoaded(await served.loads(), ['./model.server'])
    expect(
      await inPage(served, `return (await load('module.tsx')).is(1)`),
    ).toBe(true)
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('model')
  })
})

describe('better than main (main fails these)', () => {
  // e03: `main` keeps the class (classes are never deleted) and removes the
  // function its static initialiser calls: a ReferenceError at load
  test('a class in a cycle only the handler reads leaves the client whole', async () => {
    const served = await serveCase(host, {
      'module.tsx': `${serverFn}class A { static y = b() }
function b() { return () => A }
export const fn = createServerFn().handler(async () => typeof b())`,
    })
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe(
      'function',
    )
  })

  // e10d, e10g: an enum kept code reads, and an exported enum, stay
  test('an enum kept code reads and an exported enum stay on the client', async () => {
    const served = await serveCase(host, {
      ...dbServer(),
      'module.tsx': `${serverFn}import { db } from './db.server'
enum Mode { Fast, Slow }
export enum Kind { A = 1 }
export const fn = createServerFn().handler(async () => [Mode.Fast, Kind.A, db.a])
export const mode = () => Mode.Slow`,
    })
    expect(
      await inPage(
        served,
        `const m = await load('module.tsx')
return [m.mode(), m.Kind.A]`,
      ),
    ).toEqual([1, 1])
    expectNotLoaded(await served.loads(), ['./db.server'])
    expect(await callServerFnThroughCallers(served, 'module.fn')).toEqual([
      0, 1, 1,
    ])
  })

  // e10e, e10f: merged declarations (function + namespace, enum + namespace)
  // and a `const enum` only the handler reads leave the client; `main` keeps
  // them with `./db.server`
  test('merged declarations and a const enum only the handler reads leave the client', async () => {
    const served = await serveCase(host, {
      ...dbServer(),
      'module.tsx': `${serverFn}import { db } from './db.server'
function tool() { return db.a }
namespace tool { export const version = 1 }
enum E { A }
namespace E { export const f = () => db.a + 1 }
const enum Flag { On = 1, Off = 0 }
export const fn = createServerFn().handler(async () => [tool(), tool.version, E.f(), Flag.On])`,
    })
    expectNotLoaded(await served.loads(), ['./db.server'])
    expect(await callServerFnThroughCallers(served, 'module.fn')).toEqual([
      1, 1, 2, 1,
    ])
  })

  // f1 (R170): one removal rule at every level: a function's local that only
  // erased code names, in a type, goes with its import, as a module-level
  // one does; `main` keeps both with `./db.server`
  test('a function local only erased code names in a type leaves the client with its import', async () => {
    const served = await serveCase(host, {
      ...dbServer(),
      'module.tsx': `import { createServerOnlyFn } from '@tanstack/react-start'
import { connect } from './db.server'
export function make() {
  const db = connect()
  return createServerOnlyFn(() => { const c: typeof db | null = null; return c ?? 'none' })
}`,
    })
    expectNotLoaded(await served.loads(), ['./db.server'])
    expect(
      await inPage(served, `return typeof (await load('module.tsx')).make()`),
    ).toBe('function')
    expect((await served.ssr()).make()()).toBe('none')
  })

  // l6: `handler(createServerOnlyFn(f))`: `main`'s client stub throws
  // instead of calling the server
  test('a handler that is a createServerOnlyFn call runs on the server when the client calls it', async () => {
    const served = await serveCase(host, {
      ...dbServer(),
      'module.tsx': `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
export const q = createServerFn().handler(createServerOnlyFn(async () => db.q()))`,
    })
    expectNotLoaded(await served.loads(), ['./db.server'])
    expect(await callServerFnThroughCallers(served, 'module.q')).toBe('db')
  })
})

// Server-fn handler modules and erasure-only plans on the one placement
// (R155 phase 1, spec 8.2 kind A: each failed on the old engine): what a
// statement names stays in the module with it and runs when the module
// loads (R154); a declaration goes where removed text alone used it.
describe('handlers on the one placement', () => {
  /** A `.server` module recording that it ran (`./calls`). */
  const recordedServer = (name: string) => ({
    [`${name}.ts`]: `import { calls } from './calls'
calls.push(${JSON.stringify(name)})
export const db = { q: () => 'db', reset: () => {} }
`,
  })

  // l1: `clear` is needed only by the handler; it assigns `cache`, which an
  // export reads. The old engine kept writers beside the binding they write,
  // and with them what they read.
  test('client: a function only the handler calls leaves the client although it assigns a kept `let`', async () => {
    const served = await serveCase(host, {
      ...callsFile,
      ...recordedServer('db.server'),
      'module.tsx': `${serverFn}import { db } from './db.server'
let cache: Map<string, number> | null = null
function clear() { cache = null; db.reset() }
export function getCache() { return (cache ??= new Map()) }
export const reset = createServerFn().handler(async () => { clear(); return 'reset' })`,
    })
    expectNotLoaded(await served.loads(), ['./db.server'])
    expect(
      await inPage(served, `return (await load('module.tsx')).getCache().size`),
    ).toBe(0)
  })

  // l1 on the server: the handler would assign what its module imports, so
  // it stays in place (accepted: main is broken here, its copy clears a
  // second `cache`): one `cache`, and `./db.server` loads with the module
  test('server: that handler stays in place and clears the one `cache` the export reads', async () => {
    const served = await serveCase(host, {
      ...callsFile,
      ...recordedServer('db.server'),
      'module.tsx': `${serverFn}import { db } from './db.server'
let cache: Map<string, number> | null = null
function clear() { cache = null; db.reset() }
export function getCache() { return (cache ??= new Map()) }
export const reset = createServerFn().handler(async () => { clear(); return 'reset' })`,
    })
    expect(await serverCalls(served)).toEqual(['db.server'])
    const module = await served.ssr()
    const before = module.getCache()
    expect(await callFromClient(served, 'module.reset')).toBe('reset')
    expect(module.getCache()).not.toBe(before)
  })

  // e13, l10: a container a top-level statement fills stays with the
  // statement and its import, and the statement runs once, at load
  test('a container a statement fills stays in the module and is filled at load, once', async () => {
    const served = await serveCase(host, {
      ...callsFile,
      'module.tsx': `${serverFn}import { connect } from './calls'
const table = new Map<string, unknown>()
table.set('a', connect('a'))
table.set('b', connect('b'))
export const fn = createServerFn().handler(async ({ data }: { data: string }) => (table.get(data) as any).name)`,
    })
    expect(await serverCalls(served)).toEqual(['a', 'b'])
    expect(await callServerFnThroughCallers(served, 'module.fn', 'b')).toBe('b')
    expect(await serverCalls(served)).toEqual(['a', 'b'])
  })

  // e11: statements reading what only the handler reads run at load, in
  // source order, once
  test('statements on a binding only the handler reads run at load on the server, in source order', async () => {
    const served = await serveCase(host, {
      ...callsFile,
      'module.tsx': `${serverFn}import { connect } from './calls'
const db = connect('db')
if (db.name) { connect('if') }
try { connect('try') } catch {}
export const fn = createServerFn().handler(async () => db.q())`,
    })
    expect(await serverCalls(served)).toEqual(['db', 'if', 'try'])
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('db')
    expect(await serverCalls(served)).toEqual(['db', 'if', 'try'])
  })

  // e23: `let db; db = connect()` read by a handler: both stay, the
  // assignment runs at load
  test('a `let` a top-level statement assigns stays with the statement, which runs at load', async () => {
    const served = await serveCase(host, {
      ...callsFile,
      'module.tsx': `${serverFn}import { connect } from './calls'
let db: ReturnType<typeof connect>
db = connect('db')
export const fn = createServerFn().handler(async () => db.q())`,
    })
    expect(await serverCalls(served)).toEqual(['db'])
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('db')
    expect(await serverCalls(served)).toEqual(['db'])
  })

  // l13: code never used that reads the handler's helper keeps the helper
  // (and what it reads) in the module (R153 amendment: already-unused code
  // stays); the handler module imports the helper
  test('a helper code never used reads stays in the module, with its import', async () => {
    const served = await serveCase(host, {
      ...callsFile,
      ...recordedServer('db.server'),
      'module.tsx': `${serverFn}import { db } from './db.server'
function helper() { return db.q() }
function Unused() { return helper() }
export const fn = createServerFn().handler(async () => helper())`,
    })
    expect(await serverCalls(served)).toEqual(['db.server'])
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('db')
    expect(await serverCalls(served)).toEqual(['db.server'])
  })

  // t1: a value import the handler uses only as a type is no import of the
  // module on the server (verbatimModuleSyntax keeps what is written)
  test('a class import the handler uses only as a type does not load on the server', async () => {
    const served = await serveCase(host, {
      ...callsFile,
      ...recordedServer('client.server'),
      'module.tsx': `${serverFn}import { db } from './client.server'
export const fn = createServerFn().handler(async () => { const c: typeof db | null = null; return c ?? 'none' })`,
    })
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('none')
    expect(await serverCalls(served)).toEqual([])
  })
})

// F1 (spec-phase1 6.2): main deletes type-only export statements
// (`stripTypeExports`) before its removal rule, so a value only such a
// statement reads goes, with what it reads, in both environments. Kind A
// (t4, t7 and the other forms of the statement): they failed before. Kind B
// beside them: a value a local type, an annotation or a class used as a
// type reads stays, and runs, as on main (t5, t6, t8).
describe('a value only a type-only export reads', () => {
  const schemaFiles = {
    ...callsFile,
    'schema.server.ts': `import { calls } from './calls'
calls.push('schema.server')
export const users = { table: 'users' }
`,
    'make.ts': `import { calls } from './calls'
export const makeSchema = (x: unknown) => {
  calls.push('makeSchema')
  return { x }
}
`,
  }
  const head = `${serverFn}import { users } from './schema.server'
import { makeSchema } from './make'
const UserSchema = makeSchema(users)
`
  const handler = `export const getUser = createServerFn().handler(async () => 1)\n`

  test.each([
    ['t4: `export type X = typeof v`', 'export type User = typeof UserSchema'],
    [
      'an exported interface',
      'export interface User { schema: typeof UserSchema }',
    ],
    ['`export type { v }`', 'export type { UserSchema }'],
    [
      '`export { type v }`',
      'const version = 1\nexport { version, type UserSchema }',
    ],
  ])(
    '%s: the value goes with its imports, client and server',
    async (_name, typeExport) => {
      const served = await serveCase(host, {
        ...schemaFiles,
        'module.tsx': `${head}${typeExport}\n${handler}`,
      })
      expectNotLoaded(await served.loads(), ['./schema.server', './make'])
      expectNotLoaded(await served.serverLoads(), ['./schema.server', './make'])
      expect(await callServerFnThroughCallers(served, 'module.getUser')).toBe(1)
    },
  )

  test('a function only an exported type reads goes with its import', async () => {
    const served = await serveCase(host, {
      ...dbServer(),
      'module.tsx': `${serverFn}import { db } from './db.server'
function Unused() { return db.q() }
export type U = ReturnType<typeof Unused>
${handler}`,
    })
    expectNotLoaded(await served.loads(), ['./db.server'])
    expectNotLoaded(await served.serverLoads(), ['./db.server'])
  })

  // a type never keeps a value (user decision, 2026-11-25): an annotation
  // of code that runs names what it names, through a local alias too; the
  // value leaves with its evaluation, client and server
  test("a value only a running function's annotation names leaves", async () => {
    const served = await serveCase(host, {
      ...schemaFiles,
      'module.tsx': `${head}type User = typeof UserSchema
export function show(u: User) { return String(u) }
${handler}`,
    })
    expect(await clientCalls(served, `await load('module.tsx')`)).toEqual([])
    expect(await serverCalls(served)).toEqual([])
  })

  // imports are the host's: one only a type names stays an import, a class
  // only a type names leaves (with the import only it read)
  test('an import a parameter annotation names stays, a class used only as a type leaves', async () => {
    const served = await serveCase(host, {
      ...callsFile,
      'schema.server.ts': `import { calls } from './calls'
calls.push('schema.server')
export const users = { table: 'users' }
`,
      'base.server.ts': `import { calls } from './calls'
calls.push('base.server')
export class Base {}
`,
      'module.tsx': `${serverFn}import { users } from './schema.server'
import { Base } from './base.server'
class Repo extends Base {}
export function show(u: typeof users, r: Repo) { return String(u) + String(r) }
${handler}`,
    })
    expect(await clientCalls(served, `await load('module.tsx')`)).toEqual([
      'schema.server',
    ])
  })
})

// R157 rule 4: `snapshot`, which only the handler reads, evaluates a read of
// `cfg`, which the module keeps (a statement writes it through a parameter,
// or a `for…of` variable): it stays in the module and runs at load, as in
// the source; the handler module imports both.
// Kind A: failed when the handler module imported `cfg` and evaluated
// `snapshot` at the first call (`'b/b'`).
test('a handler reads the value its module read at load before a write through a local name', async () => {
  const served = await serveCase(host, {
    'module.tsx': `${serverFn}const cfg = { url: 'a' }
const snapshot = cfg.url
function set(o: { url: string }) { o.url = 'b' }
set(cfg)
export const getCfg = () => cfg.url
export const viaParam = createServerFn().handler(async () => snapshot + '/' + cfg.url)
const cfgs = [{ url: 'a' }]
const first = cfgs[0]!.url
for (const c of cfgs) { c.url = 'b' }
export const count = () => cfgs.length
export const viaForOf = createServerFn().handler(async () => first + '/' + cfgs[0]!.url)`,
  })
  expect(await callServerFnThroughCallers(served, 'module.viaParam')).toBe(
    'a/b',
  )
  expect(await callServerFnThroughCallers(served, 'module.viaForOf')).toBe(
    'a/b',
  )
  const ssr = await served.ssr()
  expect([ssr.getCfg(), ssr.count()]).toEqual(['b', 1])
})

// R157 rules 4 and 5 (design-serverfn-instances-first-principles.md): a
// declaration only handlers reach moves to the lazy handler module unless
// evaluating it reads, by name and transitively, something the module
// keeps; then it stays in the module and runs at load, as in the source. A
// declaration that is exactly a function evaluates nothing and moves. A
// handler assigning a binding the module keeps stays in place.
describe('handler-only declarations and handler writes', () => {
  /** A `.server` module recording its own load in `./calls`. */
  const loadsRecorded = (name: string) => ({
    [`${name}.ts`]: `import { calls } from './calls'
calls.push(${JSON.stringify(name)})
export const wrap = (value: unknown) => () => value
`,
  })

  // rule 4, transitively: `snap` calls `read`, a function only handlers
  // reach, which reads `cfg`, which the module keeps
  test('a handler-only declaration reading kept state through a function runs at load', async () => {
    const served = await serveCase(host, {
      'module.tsx': `${serverFn}const cfg = { url: 'a' }
function read() { return cfg.url }
const snap = read()
function set(o: { url: string }) { o.url = 'b' }
set(cfg)
export const f = createServerFn().handler(async () => snap + '/' + cfg.url)`,
    })
    expect(await callServerFnThroughCallers(served, 'module.f')).toBe('a/b')
  })

  // rule 4's laziness cost (corpus: petit-meme `server/meme.ts`): the
  // pinned declaration's import loads with the module, as in the source
  test('a pinned declaration runs at load with the module it imports', async () => {
    const served = await serveCase(host, {
      ...callsFile,
      ...loadsRecorded('wrap.server'),
      'module.tsx': `${serverFn}import { wrap } from './wrap.server'
const cfg = { url: 'a' }
const fetcher = wrap(cfg.url)
function set(o: { url: string }) { o.url = 'b' }
set(cfg)
export const f = createServerFn().handler(async () => fetcher() + '/' + cfg.url)`,
    })
    expect(await serverCalls(served)).toEqual(['wrap.server'])
    expect(await callServerFnThroughCallers(served, 'module.f')).toBe('a/b')
    expect(await serverCalls(served)).toEqual(['wrap.server'])
  })

  // a declaration that is exactly a function moves: what only it imports
  // loads at the first call; it reads the module's current state
  test('a handler-only function reading kept state stays lazy and reads the current value', async () => {
    const served = await serveCase(host, {
      ...callsFile,
      ...loadsRecorded('wrap.server'),
      'module.tsx': `${serverFn}import { wrap } from './wrap.server'
const cfg = { url: 'a' }
const read = () => wrap(cfg.url)()
function set(o: { url: string }) { o.url = 'b' }
set(cfg)
export const f = createServerFn().handler(async () => read())`,
    })
    expect(await serverCalls(served)).toEqual([])
    expect(await callServerFnThroughCallers(served, 'module.f')).toBe('b')
    expect(await serverCalls(served)).toEqual(['wrap.server'])
  })

  // probe t1_request_mutation: request-time code fills the container after
  // load; `initialSize` was read at load (main: '0/0', its copy's
  // container)
  test('a value read at load from a container later filled by server code', async () => {
    const served = await serveCase(host, {
      'module.tsx': `${serverFn}const cache = new Map<string, number>()
const initialSize = cache.size
export const fill = () => { cache.set('k', 1); return cache.size }
export const f = createServerFn().handler(async () => initialSize + '/' + cache.size)`,
    })
    expect((await served.ssr()).fill()).toBe(1)
    expect(await callFromClient(served, 'module.f')).toBe('0/1')
  })

  // rule 5, probe h_write: the handler assigns `count`, which the module
  // keeps: it stays in place, and server code sees its writes (main: 0)
  test('a handler assigning kept state is what the module reads', async () => {
    const served = await serveCase(host, {
      'module.tsx': `${serverFn}let count = 0
export const getCount = () => count
export const inc = createServerFn().handler(async () => ++count)`,
    })
    expect(await callFromClient(served, 'module.inc')).toBe(1)
    expect(await callFromClient(served, 'module.inc')).toBe(2)
    expect((await served.ssr()).getCount()).toBe(2)
  })

  // #8656 (probe p8656_class): a class of the module the handler
  // instantiates is the class SSR code sees, and the handler reads the
  // container SSR code fills (main: false, 0)
  test('a class and a container the handler shares with SSR code are one', async () => {
    const served = await serveCase(host, {
      'module.tsx': `${serverFn}export class Session { constructor(public id: string) {} }
const store = new Map<string, number>()
export const remember = () => store.set('k', 1).size
export const make = createServerFn().handler(async () => new Session('a'))
export const size = createServerFn().handler(async () => store.size)`,
    })
    const module = await served.ssr()
    module.remember()
    const session = await served.inRequest(() => module.make({}))
    expect(session instanceof module.Session).toBe(true)
    expect(await callFromClient(served, 'module.size')).toBe(1)
  })
})

// R157 rule 3: the handler module imports what its module keeps, so the
// handler reads the one instance the module's load-time code set up: a
// function the module calls at load, a helper filling a registry, a write
// through an alias, a class static block, a never-read declaration, a
// declaration only an export reads. Each runs once. (Under R156 the handler
// module copied the state, and R1 copied the code reaching it: kind A at
// cb9d1331b2 for r1 to r6.)
describe('the handler module reads the state its module set up at load', () => {
  test.each([
    {
      name: 'a function the module calls at load writes the state',
      code: `const cfg = { url: 'a' }
function init() { cfg.url = 'b' }
init()
export const getCfg = () => cfg.url
export const f = createServerFn().handler(async () => cfg.url)`,
      expected: 'b',
    },
    {
      name: 'a registry filled through a helper',
      code: `const registry = new Map<string, number>()
function register(k: string, v: number) { registry.set(k, v) }
register('a', 1)
register('b', 2)
export const f = createServerFn().handler(async () => [registry.get('a'), registry.size])`,
      expected: [1, 2],
    },
    {
      name: 'a write through an alias',
      code: `const cfg = { url: 'a', n: 0 }
const alias = cfg
alias.url = 'b'
export const f = createServerFn().handler(async () => cfg.url)`,
      expected: 'b',
    },
    // (a class only an export reads is not reached: main keeps it because
    // its removal rule never removes a class; open, review-phase1 r5)
    {
      name: 'a class static block',
      code: `const routes: Array<string> = []
class Boot { static { routes.push('boot') } }
export const f = createServerFn().handler(async () => routes.length)`,
      expected: 1,
    },
    {
      name: 'a never-read declaration',
      code: `const registry = new Map<string, number>()
const _boot = registry.set('a', 1)
export const f = createServerFn().handler(async () => registry.get('a'))`,
      expected: 1,
    },
    // main's copy deletes `filled` (only an export read it; its exports are
    // stripped), so its handler reads `undefined`; one instance: the
    // source's value (kind A at b89355a9fe: `undefined`)
    {
      name: 'a declaration only an export reads, filling the state',
      code: `const registry = new Map<string, number>()
const filled = registry.set('a', 1)
export const g = () => filled
export const f = createServerFn().handler(async () => registry.get('a'))`,
      expected: 1,
    },
    // the probe r7_export_init: `export const ready = boot(cfg)` (main: 'a')
    {
      name: 'an exported initialiser writing the state the handler reads',
      code: `const cfg = { url: 'a' }
const boot = (o: { url: string }) => { o.url = 'b'; return true }
export const ready = boot(cfg)
export const f = createServerFn().handler(async () => cfg.url)`,
      expected: 'b',
    },
    // a `var` a top-level statement declares, assigned by the handler: the
    // handler assigns the module's binding, never an import of it
    {
      name: 'a handler assigning a var a top-level statement declares',
      code: `if (typeof window === 'undefined') { var conn: unknown = 'loaded' }
export const f = createServerFn().handler(async () => { conn = 'reset'; return conn })`,
      expected: 'reset',
    },
  ])('$name', async ({ code, expected }) => {
    const served = await serveCase(host, {
      'module.tsx': `${serverFn}${code}`,
    })
    expect(await callServerFnThroughCallers(served, 'module.f')).toEqual(
      expected,
    )
  })

  // (was a pinned known difference under R156: the copy lacked the static
  // block of a class only an export reads; main reads 1)
  test('a class static block whose class only an export reads', async () => {
    const served = await serveCase(host, {
      'module.tsx': `${serverFn}const routes: Array<string> = []
class Boot { static { routes.push('boot') } }
export const boot = Boot
export const f = createServerFn().handler(async () => routes.length)`,
    })
    expect(await callServerFnThroughCallers(served, 'module.f')).toBe(1)
  })

  // O1 (review-phase1-final 3.1, f6): a statement declaring a name (`if
  // (…) { var conn = … }`) runs once; the handler module imports `conn`.
  test('a statement declaring a name the handler module imports runs once', async () => {
    const served = await serveCase(host, {
      ...callsFile,
      'module.tsx': `${serverFn}import { connect } from './calls'
const cfg = { url: 'a' }
const opts = { cfg }
if (opts) { var conn = connect('conn') }
export const getCfg = () => cfg.url
export const f = createServerFn().handler(async () => [typeof conn, cfg.url])`,
    })
    expect(await callServerFnThroughCallers(served, 'module.f')).toEqual([
      'object',
      'a',
    ])
    expect(await serverCalls(served)).toEqual(['conn'])
  })

  test('load-time code that reaches nothing the handler copies runs once', async () => {
    const served = await serveCase(host, {
      ...callsFile,
      'module.tsx': `${serverFn}import { connect } from './calls'
const cfg = { url: 'a' }
const other = { n: 0 }
function bumpOther() { other.n++; connect('bumpOther') }
bumpOther()
export const getCfg = () => cfg.url
export const getOther = () => other.n
export const f = createServerFn().handler(async () => cfg.url)`,
    })
    expect(await callServerFnThroughCallers(served, 'module.f')).toBe('a')
    expect(await serverCalls(served)).toEqual(['bumpOther'])
  })
})

// One executing instance per server fn, as `main` has one: the file or its
// lazy module holds it (R158 rule 1), the handler module imports what the
// file keeps (R157 rule 3), and a split chunk's copy is a caller through the
// registry (R159). Kind A: each failed at 02f8d6b8bd, where the copy was a
// second instance with its own validator schema and chain state.
describe('a server fn has one instance on the server', () => {
  /**
   * Renders `route` on the server (its component calls the route's server
   * fn from the split chunk), then calls that server fn `calls` times over
   * HTTP by its public `url`, one after the other; gives the last call's
   * result (the handler answers with a `Response`, which reaches the caller
   * as is).
   */
  async function renderThenCall(route: string, calls: number) {
    const run = await host.run<unknown>(`(async () => {
  const html = await (await fetch(${JSON.stringify(route)})).text()
  const url = /data-url="([^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g, '&')
  if (!url) {
    throw new Error('no server fn url in ' + html.slice(0, 300))
  }
  let last
  for (let i = 0; i < ${calls}; i++) {
    const response = await fetch(url, { method: 'POST', body: new FormData() })
    last = await response.json()
  }
  return last
})()`)
    expect(run.errors).toEqual([])
    return run.result
  }

  // main: the chunk's caller forwards to the one provider instance: 1 2 3
  // (02f8d6b8bd: 1 1 2, the chunk's copy counting on its own)
  test('a route chunk calls the instance HTTP calls reach: chain state is shared', async () => {
    expect(await renderThenCall('/chain-state', 2)).toEqual([1, 2, 3])
  })

  // a schema only the chain reads is built once, by the lazy module's one
  // instance at the first call: the chunk's caller copy has no validator
  // (R159, as the client's copy) (main: at chunk load, then again in its
  // provider copy at the first call: 2; 02f8d6b8bd: 2, the chunk's copy)
  test('a validator schema only the server fn reads is built once', async () => {
    expect(await renderThenCall('/schema-once', 1)).toBe(1)
  })

  // the component reads the schema itself: the chunk copies it, as main's
  // chunk does, and imports only the server fn (main: 2)
  test('a schema the component also reads is copied into the chunk, as on main', async () => {
    expect(await renderThenCall('/schema-read', 1)).toBe(2)
  })

  test('a server fn created in an object that only the split component reads answers from the page and from the client chunk', async () => {
    expect(await renderThenCall('/hoisted-in-object', 1)).toBe('MARK_HOISTED')
    const run = await host.run<unknown>(`(async () => {
  const route = await import('/src/routes/hoisted-in-object.tsx')
  const Page = (await route.Route.options.component.preload?.())?.default ?? route.Route.options.component
  return typeof Page
})()`)
    expect(run.errors).toEqual([])
    expect(run.result).toBe('function')
  })

  test('a declaration only its own text names is copied with the state it fills, on the server', async () => {
    const run = await host.run<unknown>(`(async () => {
  const html = await (await fetch('/self-named-init')).text()
  return /data-n="([^"]+)"/.exec(html)?.[1] ?? html.slice(0, 300)
})()`)
    expect(run.errors).toEqual([])
    expect(run.result).toBe('1')
  })

  test('a class a handler names only in a type leaves the client with its server-only import', async () => {
    const run = await host.run<unknown>(`(async () => {
  const route = await import('/src/routes/class-type-in-handler.tsx')
  await route.Route.options.component.preload?.()
  return [String(globalThis.caseClassTypeRepo), String(globalThis.caseClassTypeDb)]
})()`)
    expect(run.errors).toEqual([])
    expect(run.result).toEqual(['undefined', 'undefined'])
  })

  /** The `data-loaded` attribute of a route's server render (its loader's value). */
  async function serverLoaded(route: string) {
    const run = await host.run<unknown>(`(async () => {
  const html = await (await fetch(${JSON.stringify(route)})).text()
  return /data-loaded="([^"]*)"/.exec(html)?.[1] ?? html.slice(0, 300)
})()`)
    expect(run.errors).toEqual([])
    return run.result
  }

  test('a class a handler names only in a type runs at route load on the server, with its server-only import', async () => {
    expect(await serverLoaded('/class-type-in-handler')).toBe('made,loaded')
  })

  test.each([
    ['a class', 'class', 'repo'],
    ['an enum', 'enum', 'kind'],
  ])(
    '%s a handler names only in a type runs at route load on the server',
    async (_name, key, registered) => {
      expect(await serverLoaded(`/handler-type-${key}`)).toBe(registered)
    },
  )

  test.each(['server', 'headers'])(
    'a <Hydrate> boundary inside the %s option the client deletes loads nothing of the option',
    async (key) => {
      const run = await host.run<unknown>(
        `(async () => {
  const route = await import('/src/routes/hydrate-in-${key}.tsx')
  await route.Route.options.component.preload?.()
  return performance
    .getEntriesByType('resource')
    .map((entry) => new URL(entry.name).pathname)
    .filter((path) => /hydrate-(heavy|render)/.test(path))
})()`,
        // A new document: the resource timeline of a reused one holds what
        // earlier runs loaded, and stops recording once its buffer is full
        { fresh: true },
      )
      expect(run.errors).toEqual([])
      expect(run.result).toEqual([])
    },
  )

  test('a class only <Hydrate> children name in a type runs when the client route module loads', async () => {
    const run = await host.run<unknown>(`(async () => {
  await import('/src/routes/hydrate-type-class.tsx')
  return String(globalThis.caseHydrateTypeChart)
})()`)
    expect(run.errors).toEqual([])
    expect(run.result).toBe('made')
  })

  // a handler-only declaration whose initialiser names a class (R163) or a
  // const (a statement keeps it) the component reads: the route module
  // keeps it (R157 rule 4), and the server's split chunk, which copies the
  // class or const, does not run it again (main, and the source: once)
  test.each(['class', 'const'])(
    'a handler-only initialiser naming a %s the component reads runs once on the server',
    async (key) => {
      expect(await renderThenCall(`/handler-init-${key}`, 1)).toEqual(['k', 1])
    },
  )

  test('a `let` two split route options read and a handler assigns is one binding on the server', async () => {
    const run = await host.run<unknown>(`(async () => {
  const html = await (await fetch('/shared-writer')).text()
  const url = /data-url="([^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g, '&')
  if (!url) {
    throw new Error('no server fn url in ' + html.slice(0, 300))
  }
  await fetch(url, { method: 'POST', body: new FormData() })
  const after = await (await fetch('/shared-writer')).text()
  return /data-q="([^"]*)"/.exec(after)?.[1] ?? after.slice(0, 300)
})()`)
    expect(run.errors).toEqual([])
    expect(run.result).toBe('set')
  })

  // main: one provider copy runs both handlers: 1 2 3 4 (02f8d6b8bd:
  // 1 1 2 2, `a`'s handler module holding its own `b`)
  test('a handler calling a sibling server fn calls its one instance', async () => {
    const served = await serveCase(host, {
      'module.tsx': `${serverFn}let seen = 0
export const b = createServerFn()
  .validator(() => ({ n: ++seen }))
  .handler(({ data }) => data.n)
export const a = createServerFn().handler(() => b({ data: {} }))`,
    })
    const results = []
    for (const fn of ['module.b', 'module.a', 'module.b', 'module.a']) {
      results.push(await callFromClient(served, fn))
    }
    expect(results).toEqual([1, 2, 3, 4])
  })

  // v_state: a handler reading module state its own validator writes. The
  // validator stays in the module with `calls`; the handler module imports
  // `calls` (R157 rule 3): 1, 2, as main's provider copy and the source.
  // Kind A at b89355a9fe: 0, 0 (the handler module's copy of `calls`).
  test('a handler reads state its validator writes', async () => {
    const served = await serveCase(host, {
      'module.tsx': `${serverFn}let calls = 0
export const fn = createServerFn()
  .validator((data: unknown) => {
    calls++
    return data
  })
  .handler(() => calls)`,
    })
    expect([
      await callFromClient(served, 'module.fn'),
      await callFromClient(served, 'module.fn'),
    ]).toEqual([1, 2])
  })
})
