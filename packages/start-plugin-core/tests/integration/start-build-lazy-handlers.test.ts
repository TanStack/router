/**
 * What a production server build evaluates, and when, for the modules that
 * define server fns (Vite and Rsbuild builds, Start's whole plugin, the
 * server bundle run by Start's own server entry inside a real request):
 * the modules only handlers import load on the first call, like main, and
 * nothing a server fn module evaluates runs twice, whether server code calls
 * the fn directly or a page calls it over HTTP.
 * Source: the real-app differential corpus (lbogerd/tictaak-start: a route
 * file whose handlers import the database module, which throws at load
 * without DATABASE_URL); issue #6451 (concurrent first calls of a server fn
 * whose handler's imports load slowly).
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../build-harness'
import { createStartHost } from '../regression-helpers'
import type { StartBuild } from '../build-harness'
import type { StartHost } from '../regression-helpers'

const timeout = 60_000

const head = `import { createServerFn } from '@tanstack/react-start'\n`

/** A module counting its evaluations in `globalThis[name]`, exporting `value`. */
const counted = (name: string, value = `'${name}'`) =>
  `globalThis.${name} = (globalThis.${name} ?? 0) + 1
export const value = ${value}
`

const files = {
  // handler-only dependencies
  'heavy.server.ts': counted('MARK_HEAVY'),
  'deep.server.ts': counted('MARK_DEEP'),
  'slow.server.ts': `${counted('MARK_SLOW')}await new Promise((resolve) => setTimeout(resolve, 200))
`,
  'broken.server.ts': `throw new Error('MARK_BROKEN_AT_IMPORT')
export const value = 'unreachable'
`,
  'tla-dep.server.ts': counted('MARK_TLA_DEP'),
  'tla-for-dep.server.ts': counted('MARK_TLA_FOR_DEP'),
  // a module whose own code and handlers share state
  'fns.ts': `${head}import { value as heavy } from './heavy.server'
import { value as slow } from './slow.server'
import { value as deep } from './deep.server'
globalThis.MARK_FNS = (globalThis.MARK_FNS ?? 0) + 1
let label = 'initial'
export function setLabel(next: string) {
  label = next
}
let count = 0
export function readCount() {
  return count
}
export const getHeavy = createServerFn().handler(async () => heavy)
export const getSlow = createServerFn().handler(async () => slow)
export const readLabel = createServerFn().handler(async () => label)
export const bump = createServerFn().handler(async () => ++count)
export function makeNested() {
  const nested = createServerFn().handler(async () => deep)
  return nested
}
`,
  // two handlers writing one binding nothing else of the module uses
  'writers.ts': `${head}let calls = 0
export const addOne = createServerFn().handler(async () => ++calls)
export const addTen = createServerFn().handler(async () => (calls += 10))
`,
  // state only handlers read, set by an effect in its declaration or in a
  // statement after it, and by a pure value (the control); `seed` is
  // imported (a method of `globalThis` would be a change of a global, which
  // keeps a statement and not a declaration: R146 amendment)
  'seed.ts': `;(globalThis as any).seeded = []
export const seed = (name: string) => {
  ;(globalThis as any).seeded.push(name)
  return 1
}
`,
  'seeded.ts': `${head}import { seed } from './seed'
let initialised = seed('initialiser')
let assigned = 0
assigned = seed('assignment')
let pure = 0
pure = 5
export const readInitialised = createServerFn().handler(async () => initialised)
export const readAssigned = createServerFn().handler(async () => assigned)
export const readPure = createServerFn().handler(async () => pure)
`,
  // a server fn with a middleware, whose handler alone imports a module: the
  // order the three first run in
  'order-dep.server.ts': `;((globalThis as any).ORDER ??= []).push('dep')
export const value = 'MARK_ORDER'
`,
  'ordered.ts': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { value } from './order-dep.server'
const logged = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  ;((globalThis as any).ORDER ??= []).push('middleware')
  return next()
})
export const ordered = createServerFn()
  .middleware([logged])
  .handler(async () => {
    ;((globalThis as any).ORDER ??= []).push('handler')
    return value
  })
`,
  'broken.ts': `${head}import { value } from './broken.server'
export const callBroken = createServerFn().handler(async () => value)
`,
  // a module that awaits one of its own server fns while it evaluates, whose
  // handler reads the module's own state
  'tla.ts': `${head}import { value } from './tla-dep.server'
export const prefix = ['tla', ''].join(':')
export const tlaFn = createServerFn().handler(async () => prefix + value)
export const ready = await tlaFn()
`,
  // the same, awaiting it in a top-level `for await` loop
  'tla-for.ts': `${head}import { value } from './tla-for-dep.server'
export const prefix = ['tla-for', ''].join(':')
export const tlaForFn = createServerFn().handler(async () => prefix + value)
export const results: Array<string> = []
for await (const result of [tlaForFn()]) {
  results.push(result)
}
`,
  // a route whose split component defines a server fn: the chain is hoisted
  // into the route module, the component moves to its chunk
  'route-dep.server.ts': counted('MARK_ROUTE_DEP'),
  'src/routes/nested.tsx': `import { createFileRoute } from '@tanstack/react-router'
${head}import { value } from '../../route-dep.server'
function Page() {
  const load = createServerFn().handler(async () => value)
  ;(globalThis as any).__routeLoad = load
  return 'MARK_ROUTE_PAGE'
}
export const Route = createFileRoute('/nested')({ component: Page })
`,
  // a route whose loader and split component both call a server fn whose
  // handler alone reads a module-level declaration (jsedlacek/knihovna
  // `$authorSlug.tsx`'s `log`; the route module reads `PAGE_SIZE`, which the
  // chunk and the handler share): main shares only what the route module
  // keeps once Start moved the handler out, so the declaration and its
  // import load with the handler, on the first call
  'route-log.ts': `globalThis.MARK_ROUTE_LOG = (globalThis.MARK_ROUTE_LOG ?? 0) + 1
export const createLogger = (name: string) => ({
  info: (message: string) => name + ':' + message,
})
`,
  'src/routes/shared-log.tsx': `import { createFileRoute } from '@tanstack/react-router'
${head}import { createLogger } from '../../route-log'
const log = createLogger('route')
const PAGE_SIZE = 20
export const listLogged = createServerFn().handler(
  async () => log.info('x') + ':' + PAGE_SIZE,
)
export const Route = createFileRoute('/shared-log')({
  loader: () => listLogged({ data: PAGE_SIZE }),
  component: Page,
})
function Page() {
  return <p onClick={() => listLogged()}>MARK_SHARED_LOG_PAGE {PAGE_SIZE}</p>
}
`,
  // a server fn nested in an exported class only the split component reads:
  // the class leaves the route module, which holds the hoisted fn, and each
  // of the two imports the other
  'src/routes/nested-class.tsx': `import { createFileRoute } from '@tanstack/react-router'
${head}export class K {
  label() {
    return 'MARK_CLASS'
  }
  make() {
    return createServerFn().handler(async () => new K().label())
  }
}
function Page() {
  ;(globalThis as any).__classLoad = new K().make()
  return 'MARK_CLASS_PAGE'
}
export const Route = createFileRoute('/nested-class')({ component: Page })
`,
  // R158: server fns only a route's split component calls (the route file's
  // code does not name them) live in the file's lazy module with their
  // chain, and the chunk calls them through a stub
  // the route probe (design 2.3): a middleware module, a validator schema
  // built by a call (an effect in a chain argument) and a handler-only
  // module, none of which load at server start or with the chunk
  'probe-mw.ts': `${counted('MARK_PROBE_MW')}import { createMiddleware } from '@tanstack/react-start'
export const probeMw = createMiddleware({ type: 'function' }).server(async ({ next }) => next())
`,
  'probe-schema.ts': `${counted('MARK_PROBE_SCHEMA')}export const buildSchema = () => {
  ;(globalThis as any).MARK_PROBE_BUILDS = ((globalThis as any).MARK_PROBE_BUILDS ?? 0) + 1
  return (data: unknown) => data
}
`,
  'probe-db.server.ts': counted('MARK_PROBE_DB', `'MARK_PROBE_DB'`),
  'src/routes/probe.tsx': `import { createFileRoute } from '@tanstack/react-router'
${head}import { probeMw } from '../../probe-mw'
import { buildSchema } from '../../probe-schema'
import { value } from '../../probe-db.server'
const save = createServerFn({ method: 'POST' })
  .middleware([probeMw])
  .validator(buildSchema())
  .handler(async () => value)
export const Route = createFileRoute('/probe')({ component: Page })
function Page() {
  ;(globalThis as any).__probeSave = save
  return 'MARK_PROBE_PAGE'
}
`,
  // what the chain, the handler and the module share: the validator's state
  // (chain state, validator state), a declaration whose evaluation reads
  // kept state (`snapshot`, R157 rule 4), a class and a container the
  // module's own code uses (#8656)
  'src/routes/shared-state.tsx': `import { createFileRoute } from '@tanstack/react-router'
${head}let seen = 0
const next = createServerFn({ method: 'POST' })
  .validator(() => ({ n: ++seen }))
  .handler(({ data }) => data.n)
let calls = 0
const validated = createServerFn()
  .validator((data: unknown) => {
    calls++
    return data
  })
  .handler(() => calls)
const cfg = { url: 'a' }
const snapshot = cfg.url
function set(o: { url: string }) {
  o.url = 'b'
}
set(cfg)
const snap = createServerFn().handler(async () => snapshot + '/' + cfg.url)
export class Session {
  constructor(public id: string) {}
}
const store = new Map<string, number>()
export const remember = () => store.set('k', 1).size
const make = createServerFn().handler(async () => new Session('a'))
const size = createServerFn().handler(async () => store.size)
export const Route = createFileRoute('/shared-state')({ component: Page })
function Page() {
  ;(globalThis as any).__shared = { next, validated, snap, make, size }
  return 'MARK_SHARED_PAGE'
}
`,
  // the step-4 stop (WebDevSimplified `routes/index.tsx`): the loader calls
  // one server fn, whose lazy handler keeps Start's loader in the route
  // module; another only the split component calls (and one with the
  // default method) still lives in the lazy module (R158 amendment)
  'stop-schema.ts': `${counted('MARK_STOP_SCHEMA')}export const buildStopSchema = () => {
  ;(globalThis as any).MARK_STOP_BUILDS = ((globalThis as any).MARK_STOP_BUILDS ?? 0) + 1
  return (data: unknown) => data
}
`,
  'stop-db.server.ts': counted('MARK_STOP_DB', `'MARK_STOP_DB'`),
  'src/routes/stop.tsx': `import { createFileRoute } from '@tanstack/react-router'
${head}import { buildStopSchema } from '../../stop-schema'
import { value } from '../../stop-db.server'
const list = createServerFn().handler(async () => 'MARK_STOP_LIST')
const save = createServerFn({ method: 'POST' })
  .validator(buildStopSchema())
  .handler(async () => value)
const peek = createServerFn().handler(async () => 'MARK_STOP_PEEK')
export const Route = createFileRoute('/stop')({
  loader: () => list(),
  component: Page,
})
function Page() {
  ;(globalThis as any).__stop = { save, peek }
  return 'MARK_STOP_PAGE'
}
`,
  // shapes the chunk's stub does not take (a stored builder, a method that
  // is no literal): the route module holds them (R157), with the module's
  // one state
  'src/routes/fallback.tsx': `import { createFileRoute } from '@tanstack/react-router'
${head}let seen = 0
const base = createServerFn({ method: 'POST' })
const viaBase = base
  .validator(() => ({ n: ++seen }))
  .handler(({ data }) => data.n)
const method = ['G', 'ET'].join('') as 'GET'
const viaMethod = createServerFn({ method })
  .validator(() => ({ n: ++seen }))
  .handler(({ data }) => data.n)
export const Route = createFileRoute('/fallback')({ component: Page })
function Page() {
  ;(globalThis as any).__fallback = { viaBase, viaMethod }
  return 'MARK_FALLBACK_PAGE'
}
`,
  // nickysemenza/cubby `mutation-data.ts`: a server fn only an isomorphic
  // fn's client side calls, so no server code names it
  'cubby-contract.ts': `${counted('MARK_CUBBY_CONTRACT')}export const contract = (data: unknown) => data
`,
  'cubby.ts': `import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'
import { contract } from './cubby-contract'
const hidden = createServerFn({ method: 'POST' })
  .validator(contract)
  .handler(async ({ data }) => data)
export const check = createIsomorphicFn()
  .server(async (data: unknown) => 'server:' + String(data))
  .client((data: unknown) => hidden({ data }))
`,
  'client-entry.ts': `import './seed'
export * from './fns'
export * from './writers'
export * from './seeded'
export * from './ordered'
export { callBroken } from './broken'
export const loadTla = () => import('./tla')
export const loadTlaFor = () => import('./tla-for')
export { getRouter } from './src/router'
export { listLogged } from './src/routes/shared-log'
export { remember, Session } from './src/routes/shared-state'
export { check } from './cubby'
`,
  'ssr-entry.ts': `export * from './client-entry'
export { renderPath } from './harness/render'
${callByIdExports}`,
}

/** SSR script prelude: the evaluation counters of `files`. */
const counters = `const count = (name) => globalThis[name] ?? 0
const counts = (...names) =>
  Object.fromEntries(names.map((name) => [name, count('MARK_' + name.toUpperCase())]))
`

describe.each(startBundlers)('%s build', (bundler) => {
  let build: StartBuild
  const cleanups: Array<() => Promise<void>> = []

  beforeAll(async () => {
    build = await buildStart({
      bundler,
      files,
      entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
      registerCleanup: (cleanup) => cleanups.push(cleanup),
    })
  }, timeout)

  afterAll(async () => {
    await Promise.all(cleanups.map((cleanup) => cleanup()))
  })

  test(
    'SSR: the server-only modules of handlers load on the first call, not with the module defining the fn',
    async () => {
      const { result } = await build.ssr
        .run(`${counters}const before = counts('fns', 'heavy')
const heavy = await entry.getHeavy()
return { before, heavy, after: counts('fns', 'heavy') }`)
      expect(result).toEqual({
        before: { fns: 1, heavy: 0 },
        heavy: 'MARK_HEAVY',
        after: { fns: 1, heavy: 1 },
      })
    },
    timeout,
  )

  test(
    'SSR: direct calls and calls over HTTP run one instance of the module and of what its handlers import',
    async () => {
      const { result } = await build.ssr
        .run(`${callByIdPrelude}${counters}const results = await Promise.all([
  ...Array.from({ length: 25 }, () => entry.getSlow()),
  ...Array.from({ length: 25 }, () => callById(serverFnId(entry.getSlow))),
])
return {
  results: [...new Set(results)],
  counts: counts('fns', 'slow'),
  overHttp: await callById(serverFnId(entry.getHeavy)),
  after: counts('fns', 'slow', 'heavy'),
}`)
      expect(result).toEqual({
        results: ['MARK_SLOW'],
        counts: { fns: 1, slow: 1 },
        overHttp: 'MARK_HEAVY',
        after: { fns: 1, slow: 1, heavy: 1 },
      })
    },
    timeout,
  )

  test(
    "SSR: a handler reads the module's current state, and a handler's writes are what the module reads",
    async () => {
      const { result } = await build.ssr
        .run(`${callByIdPrelude}entry.setLabel('changed')
const label = await entry.readLabel()
const overHttp = await callById(serverFnId(entry.readLabel))
await entry.bump()
await callById(serverFnId(entry.bump))
return { label, overHttp, count: entry.readCount() }`)
      expect(result).toEqual({
        label: 'changed',
        overHttp: 'changed',
        count: 2,
      })
    },
    timeout,
  )

  test(
    'SSR: two handlers writing one binding share one instance of it',
    async () => {
      const { result } = await build.ssr.run(`${callByIdPrelude}return [
  await entry.addOne(),
  await callById(serverFnId(entry.addTen)),
  await entry.addTen(),
  await callById(serverFnId(entry.addOne)),
]`)
      expect(result).toEqual([1, 11, 21, 22])
    },
    timeout,
  )

  // each runs once (R157): the statement assigning the state stays in the
  // module and runs at load (R154), and the handler module imports what it
  // assigns; the declaration only handlers read, which evaluates nothing the
  // module keeps (`seed` is an import), moves to the handler module and runs
  // at the first call, as on main (R153 supersedes R29/R31's "both at the
  // same time"; main's provider copy runs the statement a second time)
  test(
    'SSR: an effect setting state only handlers read runs once, in its declaration or after it',
    async () => {
      const { result } = await build.ssr
        .run(`${callByIdPrelude}const atLoad = [...globalThis.seeded]
const values = [
  await entry.readInitialised(),
  await entry.readAssigned(),
  await callById(serverFnId(entry.readAssigned)),
  await entry.readPure(),
]
return { atLoad, values, after: globalThis.seeded }`)
      const { atLoad, values, after } = result as {
        atLoad: Array<string>
        values: Array<number>
        after: Array<string>
      }
      expect(values).toEqual([1, 1, 1, 5])
      expect(atLoad).toEqual(['assignment'])
      expect(after).toEqual(['assignment', 'initialiser'])
    },
    timeout,
  )

  test(
    'SSR: the server-only module of a nested server fn loads on its first call',
    async () => {
      const { result } = await build.ssr
        .run(`${counters}const fn = entry.makeNested()
const before = counts('deep')
return { before, called: await fn(), after: counts('deep') }`)
      expect(result).toEqual({
        before: { deep: 0 },
        called: 'MARK_DEEP',
        after: { deep: 1 },
      })
    },
    timeout,
  )

  test(
    'SSR: a server fn nested in an exported class only the split component reads runs, directly and over HTTP',
    async () => {
      const { result } = await build.ssr
        .run(`${callByIdPrelude}const { routeTree } = entry.getRouter()
const rendered = await entry.renderPath(routeTree, '/nested-class')
const load = globalThis.__classLoad
return {
  rendered: rendered.includes('MARK_CLASS_PAGE'),
  called: await load(),
  overHttp: await callById(serverFnId(load)),
}`)
      expect(result).toEqual({
        rendered: true,
        called: 'MARK_CLASS',
        overHttp: 'MARK_CLASS',
      })
    },
    timeout,
  )

  test(
    "SSR: a server fn nested in a route's split component runs, directly and over HTTP, loading its handler's module on the first call",
    async () => {
      const { result } = await build.ssr
        .run(`${callByIdPrelude}${counters}const { routeTree } = entry.getRouter()
const rendered = await entry.renderPath(routeTree, '/nested')
const load = globalThis.__routeLoad
const before = counts('route_dep')
return {
  rendered: rendered.includes('MARK_ROUTE_PAGE'),
  before,
  called: await load(),
  overHttp: await callById(serverFnId(load)),
  after: counts('route_dep'),
}`)
      expect(result).toEqual({
        rendered: true,
        before: { route_dep: 0 },
        called: 'MARK_ROUTE_DEP',
        overHttp: 'MARK_ROUTE_DEP',
        after: { route_dep: 1 },
      })
    },
    timeout,
  )

  test(
    "SSR: a declaration only a route's server-fn handler reads loads on the first call, though the loader and the split component both call the fn",
    async () => {
      const { result } = await build.ssr
        .run(`${callByIdPrelude}${counters}const before = counts('route_log')
return {
  before,
  called: await entry.listLogged(),
  overHttp: await callById(serverFnId(entry.listLogged)),
  after: counts('route_log'),
}`)
      expect(result).toEqual({
        before: { route_log: 0 },
        called: 'route:x:20',
        overHttp: 'route:x:20',
        after: { route_log: 1 },
      })
    },
    timeout,
  )

  test(
    "SSR (R158): a server fn only a route's split component calls loads nothing at server start or with the chunk; its chain is built once, at the first call",
    async () => {
      const { result } = await build.ssr
        .run(`${callByIdPrelude}const marks = () => ({
  mw: globalThis.MARK_PROBE_MW ?? 0,
  schema: globalThis.MARK_PROBE_SCHEMA ?? 0,
  builds: globalThis.MARK_PROBE_BUILDS ?? 0,
  db: globalThis.MARK_PROBE_DB ?? 0,
})
const atStart = marks()
const { routeTree } = entry.getRouter()
const rendered = (await entry.renderPath(routeTree, '/probe')).includes('MARK_PROBE_PAGE')
const afterRender = marks()
const save = globalThis.__probeSave
const called = await save({ data: { id: 'x' } })
const afterCall = marks()
const overHttp = await callById(serverFnId(save), { id: 'y' }, 'POST')
return { atStart, rendered, afterRender, called, afterCall, overHttp, end: marks() }`)
      const none = { mw: 0, schema: 0, builds: 0, db: 0 }
      const once = { mw: 1, schema: 1, builds: 1, db: 1 }
      expect(result).toEqual({
        atStart: none,
        rendered: true,
        afterRender: none,
        called: 'MARK_PROBE_DB',
        afterCall: once,
        overHttp: 'MARK_PROBE_DB',
        end: once,
      })
    },
    timeout,
  )

  test(
    "SSR (R158): server fns only a route's split component calls share the module's state: chain state 1 2 3 4, validator state, a pinned snapshot, #8656's class and container",
    async () => {
      const { result } = await build.ssr
        .run(`${callByIdPrelude}const { routeTree } = entry.getRouter()
await entry.renderPath(routeTree, '/shared-state')
const fns = globalThis.__shared
const http = (fn, data) => callById(serverFnId(fn), data, 'POST')
const chain = [await fns.next({ data: {} })]
for (let i = 0; i < 3; i++) {
  chain.push(await http(fns.next, {}))
}
entry.remember()
const session = await fns.make()
return {
  chain,
  validated: [await fns.validated({ data: 1 }), await callById(serverFnId(fns.validated), 1)],
  snap: [await fns.snap(), await callById(serverFnId(fns.snap))],
  session: session instanceof entry.Session,
  size: [await fns.size(), await callById(serverFnId(fns.size))],
}`)
      expect(result).toEqual({
        chain: [1, 2, 3, 4],
        validated: [1, 2],
        snap: ['a/b', 'a/b'],
        session: true,
        size: [1, 1],
      })
    },
    timeout,
  )

  test(
    "SSR (R158 amendment): a server fn only the split component calls stays lazy beside one the route's loader calls; the chunk's stub has the server fn's url and method",
    async () => {
      const { result } = await build.ssr
        .run(`${callByIdPrelude}const marks = () => ({
  schema: globalThis.MARK_STOP_SCHEMA ?? 0,
  builds: globalThis.MARK_STOP_BUILDS ?? 0,
  db: globalThis.MARK_STOP_DB ?? 0,
})
const atStart = marks()
const { routeTree } = entry.getRouter()
const rendered = (await entry.renderPath(routeTree, '/stop')).includes('MARK_STOP_PAGE')
const afterRender = marks()
const { save, peek } = globalThis.__stop
const surface = (fn) => ({ url: typeof fn.url === 'string' && fn.url.length > 0, method: fn.method })
const called = await save({ data: {} })
const afterCall = marks()
const overHttp = await callById(serverFnId(save), {}, save.method)
return {
  atStart,
  rendered,
  afterRender,
  surface: [surface(save), surface(peek)],
  called,
  afterCall,
  overHttp,
  peek: [await peek(), await callById(serverFnId(peek), undefined, peek.method)],
  end: marks(),
}`)
      const none = { schema: 0, builds: 0, db: 0 }
      const once = { schema: 1, builds: 1, db: 1 }
      expect(result).toEqual({
        atStart: none,
        rendered: true,
        afterRender: none,
        surface: [
          { url: true, method: 'POST' },
          { url: true, method: 'GET' },
        ],
        called: 'MARK_STOP_DB',
        afterCall: once,
        overHttp: 'MARK_STOP_DB',
        peek: ['MARK_STOP_PEEK', 'MARK_STOP_PEEK'],
        end: once,
      })
    },
    timeout,
  )

  test(
    "SSR (R158): a server fn whose chain's root the stub cannot read (a stored builder, a method that is no literal) is the route module's one instance",
    async () => {
      const { result } = await build.ssr
        .run(`${callByIdPrelude}const { routeTree } = entry.getRouter()
await entry.renderPath(routeTree, '/fallback')
const { viaBase, viaMethod } = globalThis.__fallback
return {
  names: [viaBase.serverFnMeta.name, viaMethod.serverFnMeta.name],
  methods: [viaBase.method, viaMethod.method],
  seen: [
    await viaBase({ data: {} }),
    await callById(serverFnId(viaBase), {}, 'POST'),
    await viaMethod({ data: {} }),
    await callById(serverFnId(viaMethod), {}, 'GET'),
  ],
}`)
      expect(result).toEqual({
        names: ['viaBase', 'viaMethod'],
        methods: ['POST', 'GET'],
        seen: [1, 2, 3, 4],
      })
    },
    timeout,
  )

  test(
    'SSR (R158): a server fn only the client side of an isomorphic fn calls loads nothing at server start (cubby)',
    async () => {
      const { result } = await build.ssr
        .run(`const atStart = globalThis.MARK_CUBBY_CONTRACT ?? 0
return { atStart, server: await entry.check('x'), after: globalThis.MARK_CUBBY_CONTRACT ?? 0 }`)
      expect(result).toEqual({ atStart: 0, server: 'server:x', after: 0 })
    },
    timeout,
  )

  test(
    'SSR: a handler-only module that throws at load fails only the calls of that fn',
    async () => {
      const { result } = await build.ssr.run(`const settle = async (run) => {
  try {
    return { value: await run() }
  } catch (error) {
    return { error: String(error?.message ?? error) }
  }
}
return {
  broken: await settle(() => entry.callBroken()),
  other: await settle(() => entry.getHeavy()),
}`)
      expect(result).toEqual({
        broken: { error: expect.stringContaining('MARK_BROKEN_AT_IMPORT') },
        other: { value: 'MARK_HEAVY' },
      })
    },
    timeout,
  )

  test(
    "SSR: an HTTP call loads its handler's imports before its middleware runs, as main's provider module does (R158 rule 3)",
    async () => {
      const { result } = await build.ssr
        .run(`${callByIdPrelude}const atLoad = globalThis.ORDER ?? []
const overHttp = await callById(serverFnId(entry.ordered))
return { atLoad, overHttp, order: globalThis.ORDER }`)
      expect(result).toEqual({
        atLoad: [],
        overHttp: 'MARK_ORDER',
        order: ['dep', 'middleware', 'handler'],
      })
    },
    timeout,
  )

  test(
    "SSR: a direct call and then an HTTP call of a server fn with a middleware share one instance of its handler's imports",
    async () => {
      const { result } = await build.ssr
        .run(`${callByIdPrelude}const direct = await entry.ordered()
const overHttp = await callById(serverFnId(entry.ordered))
const order = globalThis.ORDER
return {
  direct,
  overHttp,
  deps: order.filter((x) => x === 'dep').length,
  calls: order.filter((x) => x === 'handler').length,
}`)
      expect(result).toEqual({
        direct: 'MARK_ORDER',
        overHttp: 'MARK_ORDER',
        deps: 1,
        calls: 2,
      })
    },
    timeout,
  )

  test(
    'SSR: an HTTP call reaches the server fn of a module that awaits it at its top level, one instance with the direct call',
    async () => {
      const { result } = await build.ssr
        .run(`${callByIdPrelude}const tla = await entry.loadTla()
return {
  ready: tla.ready,
  overHttp: await callById(serverFnId(tla.tlaFn)),
  dep: globalThis.MARK_TLA_DEP,
}`)
      expect(result).toEqual({
        ready: 'tla:MARK_TLA_DEP',
        overHttp: 'tla:MARK_TLA_DEP',
        dep: 1,
      })
    },
    timeout,
  )

  test(
    'SSR: a module that awaits one of its own server fns at its top level evaluates',
    async () => {
      const { result } = await build.ssr.run(`const tla = await entry.loadTla()
return { ready: tla.ready, again: await tla.tlaFn(), dep: globalThis.MARK_TLA_DEP }`)
      expect(result).toEqual({
        ready: 'tla:MARK_TLA_DEP',
        again: 'tla:MARK_TLA_DEP',
        dep: 1,
      })
    },
    timeout,
  )

  test(
    'SSR: a module that awaits one of its own server fns in a top-level for await loop evaluates',
    async () => {
      const { result } = await build.ssr
        .run(`const tla = await entry.loadTlaFor()
return { results: tla.results, again: await tla.tlaForFn(), dep: globalThis.MARK_TLA_FOR_DEP }`)
      expect(result).toEqual({
        results: ['tla-for:MARK_TLA_FOR_DEP'],
        again: 'tla-for:MARK_TLA_FOR_DEP',
        dep: 1,
      })
    },
    timeout,
  )
})

// `@vitejs/plugin-vue` serves an SFC's `<script lang="ts">` block in builds
// as a module of its own (`Page.vue?vue&type=script&lang.ts`); its
// handlers' server-only modules load on the first call like any module's.
describe('vite build of a Vue app', () => {
  let host: StartHost | undefined
  afterAll(() => host?.close())

  test(
    'SSR: the server-only module of a handler in a <script lang="ts"> block is not loaded with the SFC',
    async () => {
      host = await createStartHost({ framework: 'vue', serve: false })
      const startCase = await host.case({
        'Page.vue': `<script lang="ts">
import { createServerFn } from '@tanstack/vue-start'
import { db } from './db.server'
const input = <string>(globalThis as any).input
export const fn = createServerFn().handler(async () => db.x(input))
export default {}
</script>

<template>
  <p>page</p>
</template>
`,
        'db.server.ts': `export const db = { x: (input: string) => 'MARK_DB_SERVER:' + input }\n`,
        'module.ts': `export { fn } from './Page.vue'\n`,
      })
      const build = await host.build()
      const { chunks } = build.environments.ssr!
      const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
      const page = startCase.file('Page.vue')
      // (the SFC module itself, which imports its blocks)
      const own = chunks.filter((chunk) => chunk.moduleIds.includes(page))
      expect(own.length, 'SSR chunks of the SFC').toBeGreaterThan(0)
      // the SFC's chunks and every chunk they import statically
      const loaded = new Set(own)
      for (const chunk of loaded) {
        for (const name of chunk.imports) {
          const next = byName.get(name)
          if (next) {
            loaded.add(next)
          }
        }
      }
      expect({
        withTheSfc: [...loaded].some((chunk) =>
          chunk.code.includes('MARK_DB_SERVER'),
        ),
        inTheBuild: chunks.some((chunk) =>
          chunk.code.includes('MARK_DB_SERVER'),
        ),
      }).toEqual({ withTheSfc: false, inTheBuild: true })
    },
    timeout,
  )
})
