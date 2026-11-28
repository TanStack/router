/**
 * What a production server build loads and evaluates, and when, for the
 * modules that define server fns (Vite and Rsbuild builds, Start's whole
 * plugin, the server bundle run by Start's own server entry inside a real
 * request): the modules only handlers import load on the first call, like
 * main, and nothing a server fn module evaluates runs twice, whether server
 * code calls the fn directly or a page calls it over HTTP.
 * Source: the real-app differential corpus (lbogerd/tictaak-start: a route
 * file whose handlers import the database module, which throws at load
 * without DATABASE_URL); issue #6451 (concurrent first calls of a server fn
 * whose handler's imports load slowly).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, test } from 'vitest'
import {
  runNodeProgram,
  runNodeStep,
} from '@tanstack/compiler-test-utils/run-node'
import { closeAtEnd } from '../test-end'
import { closeAfterAll } from '../file-end'
import {
  buildStartShared,
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../build-harness'
import { createStartHost } from '../regression-helpers'
import { routerFile } from '../request-probe'
import type { StartBuild } from '../build-harness'

const timeout = 60_000

const head = `import { createServerFn } from '@tanstack/react-start'\n`

/** A module counting its evaluations in `globalThis[name]`, exporting `value`. */
const counted = (name: string, value = `'${name}'`) =>
  `globalThis.${name} = (globalThis.${name} ?? 0) + 1
export const value = ${value}
`

/**
 * R159: the builder shapes of probe-r158-builder-shapes.md, each a route
 * whose split component alone names `save`: the chain's root (`root`, after
 * `preamble`), the modules it loads (`chain`, which main loads with the
 * chunk). `save`'s validator writes `seen`, which its handler reads; its
 * handler reads a pinned `snapshot` (R157 rule 4), a class and a container
 * the file's own export uses (#8656), a handler-only module (`lib/db`) and
 * the context of the middleware's server half, which reads what its client
 * half sent.
 */
const builderShapes: Record<
  string,
  { imports: string; preamble: string; root: string; chain: Array<string> }
> = {
  // a literal chain
  s0: {
    imports: `import { createServerFn } from '@tanstack/react-start'
import { authMw } from '../../lib/auth'
`,
    preamble: '',
    root: `createServerFn({ method: 'POST' }).middleware([authMw])`,
    chain: ['auth'],
  },
  // a builder imported from another module
  s1: {
    imports: `import { authedFn } from '../../lib/fns'\n`,
    preamble: '',
    root: 'authedFn',
    chain: ['fns', 'auth'],
  },
  // a builder declared in the route file
  s2: {
    imports: `import { createServerFn } from '@tanstack/react-start'
import { authMw } from '../../lib/auth'
`,
    preamble: `const base = createServerFn({ method: 'POST' }).middleware([authMw])\n`,
    root: 'base',
    chain: ['auth'],
  },
  // a builder through a barrel
  s3: {
    imports: `import { authedFn } from '../../lib'\n`,
    preamble: '',
    root: 'authedFn',
    chain: ['index', 'fns', 'factory', 'auth'],
  },
  // a factory
  s4: {
    imports: `import { makeFn } from '../../lib/factory'\n`,
    preamble: '',
    root: 'makeFn()',
    chain: ['factory', 'auth'],
  },
  // options that are no literal
  s5: {
    imports: `import { createServerFn } from '@tanstack/react-start'
import { authMw } from '../../lib/auth'
`,
    preamble: `const opts = { method: ['PO', 'ST'].join('') as 'POST' }\n`,
    root: 'createServerFn(opts).middleware([authMw])',
    chain: ['auth'],
  },
}

const builderShapeFiles = {
  'lib/auth.ts': `${counted('MARK_LIB_AUTH')}import { createMiddleware } from '@tanstack/react-start'
const g = globalThis as any
export const authMw = createMiddleware({ type: 'function' })
  .client(async ({ next }) => {
    g.LIB_CLIENT_HALF = (g.LIB_CLIENT_HALF ?? 0) + 1
    return next({ sendContext: { sent: 'from-client' } })
  })
  .server(async ({ next, context }) => {
    g.LIB_SERVER_HALF = (g.LIB_SERVER_HALF ?? 0) + 1
    return next({ context: { received: (context as any).sent ?? null } })
  })
`,
  'lib/fns.ts': `${counted('MARK_LIB_FNS')}import { createServerFn } from '@tanstack/react-start'
import { authMw } from './auth'
export const authedFn = createServerFn({ method: 'POST' }).middleware([authMw])
`,
  'lib/factory.ts': `${counted('MARK_LIB_FACTORY')}import { createServerFn } from '@tanstack/react-start'
import { authMw } from './auth'
export const makeFn = () => createServerFn({ method: 'POST' }).middleware([authMw])
`,
  'lib/index.ts': `${counted('MARK_LIB_INDEX')}export { authedFn } from './fns'
export { makeFn } from './factory'
`,
  'lib/schema.ts': `${counted('MARK_LIB_SCHEMA')}export const makeSchema = () => {
  ;(globalThis as any).MARK_LIB_BUILDS = ((globalThis as any).MARK_LIB_BUILDS ?? 0) + 1
  return (data: unknown) => data
}
`,
  'lib/db.server.ts': counted('MARK_LIB_DB', `'MARK_LIB_DB'`),
  ...Object.fromEntries(
    Object.entries(builderShapes).map(([k, shape]) => [
      `src/routes/shape-${k}.tsx`,
      `import { createFileRoute } from '@tanstack/react-router'
${shape.imports}import { makeSchema } from '../../lib/schema'
import { value as db } from '../../lib/db.server'
let seen = 0
const schema = makeSchema()
const cfg = { url: 'a' }
const snapshot = cfg.url
function set(o: { url: string }) {
  o.url = 'b'
}
set(cfg)
export class Session {}
const store = new Map<string, number>()
export const remember = () => {
  ;(globalThis as any).__session_${k} = Session
  return store.set('k', 1).size
}
${shape.preamble}const save = ${shape.root}
  .validator((d: unknown) => (schema(d), { n: ++seen }))
  .handler(async ({ data, context }) => ({
    n: data.n,
    seen,
    session: (globalThis as any).__session_${k} === Session,
    size: store.size,
    snap: snapshot + '/' + cfg.url,
    db,
    received: (context as any).received,
  }))
export const Route = createFileRoute('/shape-${k}')({ component: Page })
function Page() {
  ;(globalThis as any).__shape_${k} = save
  return 'MARK_SHAPE_PAGE'
}
`,
    ]),
  ),
}

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
  'tla-using-dep.server.ts': counted('MARK_TLA_USING_DEP'),
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
export const hoisted = { nested: createServerFn().handler(async () => deep) }
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
  // declarations only a handler reads whose evaluation reads `field`, which
  // a later statement assigns: a pattern on the left of a function literal
  // reads its computed key at load (R157 rule 4: not exactly a function),
  // and the control, a member read of a function's own declaration.
  // Source: Astra review 3 (core B2)
  'picked.ts': `${head}let field: 'length' | 'name' = 'length'
const { [field]: picked } = function works(x: number) {
  return x
}
const fn = function works(x: number) {
  return x
}
const control = fn[field]
field = 'name'
export const readPicked = createServerFn().handler(async () => [picked, control])
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
  // the same, awaiting it in the disposer of an `await using` declaration in
  // a top-level block and in a top-level `for` head: the module awaits each
  // disposal before it finishes evaluating. (Not directly at the top level:
  // with the harness's targets Rolldown 1.2.13 drops that declaration, and
  // the SWC lowering of Rsbuild (2.3.1 to 2.3.3) moves the module's later
  // declarations after the disposal.) Source: Astra review 4 (architecture
  // B2, core B1)
  'tla-using-block.ts': `${head}import { value } from './tla-using-dep.server'
export const prefix = ['tla-using-block', ''].join(':')
export const tlaUsingFn = createServerFn().handler(async () => prefix + value)
export const results: Array<string> = []
{
  await using resource = {
    async [Symbol.asyncDispose]() {
      results.push(await tlaUsingFn())
    },
  }
}
`,
  'tla-using-for.ts': `${head}import { value } from './tla-using-dep.server'
export const prefix = ['tla-using-for', ''].join(':')
export const tlaUsingFn = createServerFn().handler(async () => prefix + value)
export const results: Array<string> = []
for (await using resource of [
  {
    async [Symbol.asyncDispose]() {
      results.push(await tlaUsingFn())
    },
  },
]) {
  void resource
}
`,
  // a top-level statement names a server fn the split component calls: the
  // file holds it; one instance answers the chunk's calls and HTTP calls
  'register.ts': `export const register = (fn: unknown) => {
  ;((globalThis as any).REGISTERED ??= []).push(typeof fn)
}
`,
  'src/routes/registered.tsx': `import { createFileRoute } from '@tanstack/react-router'
${head}import { register } from '../../register'
let seen = 0
const save = createServerFn({ method: 'POST' })
  .validator(() => ({ n: ++seen }))
  .handler(({ data }) => data.n)
register(save)
export const Route = createFileRoute('/registered')({ component: Page })
function Page() {
  ;(globalThis as any).__registered = save
  return 'MARK_REGISTERED_PAGE'
}
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
  // R158, R159: server fns only a route's split component calls (the route
  // file's code does not name them) live in the file's lazy module with
  // their chain; the chunk holds a caller copy (the chain, its handler an
  // RPC to the lazy module's one instance)
  // the route probe (design 2.3): a middleware module, a validator schema
  // built by a call (an effect in a chain argument) and a handler-only
  // module, none of which load at server start; the chain's modules load
  // with the chunk, as on main, the handler's at the first call
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
  // a validator assigning an exported binding (challenge-serverfn-generic.md
  // 5.5): the chunk's caller copy has no validator, so it assigns nothing
  // it imports and the component is split on the server
  'vw-ui.ts': counted('MARK_VW_UI', `'MARK_VW_PAGE'`),
  'src/routes/validator-writes.tsx': `import { createFileRoute } from '@tanstack/react-router'
${head}import { value } from '../../vw-ui'
export let seen = 0
const save = createServerFn({ method: 'POST' })
  .validator(() => ({ n: ++seen }))
  .handler(({ data }) => data.n)
export const Route = createFileRoute('/validator-writes')({ component: Page })
function Page() {
  ;(globalThis as any).__vw = save
  return value
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
  ...builderShapeFiles,
  'client-entry.ts': `import './seed'
export * from './fns'
export * from './writers'
export * from './seeded'
export * from './picked'
export * from './ordered'
export { callBroken } from './broken'
export const loadTla = () => import('./tla')
export const loadTlaFor = () => import('./tla-for')
export const loadTlaUsing = {
  block: () => import('./tla-using-block'),
  for: () => import('./tla-using-for'),
}
export { getRouter } from './src/router'
export { listLogged } from './src/routes/shared-log'
export { remember, Session } from './src/routes/shared-state'
export { check } from './cubby'
export { seen as vwSeen } from './src/routes/validator-writes'
${Object.keys(builderShapes)
  .map(
    (k) =>
      `export { remember as remember_${k} } from './src/routes/shape-${k}'\n`,
  )
  .join('')}`,
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
  const openBuild = closeAfterAll()
  beforeAll(async () => {
    build = await openBuild(() =>
      buildStartShared({
        bundler,
        files,
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
      }),
    )
  }, timeout)

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
    'SSR: a destructuring of a function literal only a handler reads is evaluated at load, before a later statement changes its computed key',
    async () => {
      const { result } = await build.ssr.run(`${callByIdPrelude}return [
  await entry.readPicked(),
  await callById(serverFnId(entry.readPicked)),
]`)
      expect(result).toEqual([
        [1, 1],
        [1, 1],
      ])
    },
    timeout,
  )

  test(
    'SSR: the server-only module of a hoisted server fn loads on its first call',
    async () => {
      const { result } = await build.ssr
        .run(`${counters}const fn = entry.hoisted.nested
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
    'SSR: a server fn a top-level statement names and the split component calls has one instance: 1 2 3 4',
    async () => {
      const { result } = await build.ssr
        .run(`${callByIdPrelude}const { routeTree } = entry.getRouter()
await entry.renderPath(routeTree, '/registered')
const save = globalThis.__registered
const calls = [await save({ data: {} })]
calls.push(await callById(serverFnId(save), {}, 'POST'))
calls.push(await callById(serverFnId(save), {}, 'POST'))
calls.push(await save({ data: {} }))
return calls`)
      expect(result).toEqual([1, 2, 3, 4])
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
    "SSR: a server fn only a route's split component calls loads nothing at server start; its chain loads with the chunk, as on main, its handler's imports at the first call",
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
      // the chunk's caller copy builds the chain's root and middleware (its
      // validator is the server phase's, gone as in the client's copy), the
      // lazy module the executing instance (main: its provider copy, after
      // the chunk built the validator too)
      const called_ = { mw: 1, schema: 1, builds: 1, db: 1 }
      expect(result).toEqual({
        atStart: { mw: 0, schema: 0, builds: 0, db: 0 },
        rendered: true,
        afterRender: { mw: 1, schema: 0, builds: 0, db: 0 },
        called: 'MARK_PROBE_DB',
        afterCall: called_,
        overHttp: 'MARK_PROBE_DB',
        end: called_,
      })
    },
    timeout,
  )

  test(
    "SSR: server fns only a route's split component calls share the module's state: chain state 1 2 3 4, validator state, a pinned snapshot, #8656's class and container",
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
    "SSR: a server fn only the split component calls stays lazy beside one the route's loader calls; the chunk's caller copy has the server fn's url and method",
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
      const once = { schema: 1, builds: 1, db: 1 }
      expect(result).toEqual({
        atStart: { schema: 0, builds: 0, db: 0 },
        rendered: true,
        // the render runs the loader: the file's first server-fn call loads
        // its lazy module, `save`'s chain with it (main: its provider copy)
        afterRender: once,
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

  test.each(Object.entries(builderShapes))(
    "SSR %s: a server fn only a route's split component calls, on any chain shape, loads its chain (without its validator) with the chunk as on main and the handler's imports at the first call; one executing instance; the caller copy runs the middleware's client half and has the server fn's method and url; production lists its id",
    async (k, shape) => {
      const { result } = await build.ssr
        .run(`${callByIdPrelude}const g = globalThis
const marks = () => ({
  index: g.MARK_LIB_INDEX ?? 0,
  fns: g.MARK_LIB_FNS ?? 0,
  factory: g.MARK_LIB_FACTORY ?? 0,
  auth: g.MARK_LIB_AUTH ?? 0,
  schema: g.MARK_LIB_SCHEMA ?? 0,
  builds: g.MARK_LIB_BUILDS ?? 0,
  db: g.MARK_LIB_DB ?? 0,
})
const atStart = marks()
const { routeTree } = entry.getRouter()
const rendered = (await entry.renderPath(routeTree, '/shape-${k}')).includes('MARK_SHAPE_PAGE')
const afterRender = marks()
const save = g.__shape_${k}
const remembered = entry.remember_${k}()
const calls = [await save({ data: {} })]
const afterCall = marks()
calls.push(await callById(serverFnId(save), {}, 'POST'))
calls.push(await callById(serverFnId(save), {}, save.method))
calls.push(await save({ data: {} }))
return {
  atStart,
  rendered,
  afterRender,
  afterCall,
  end: marks(),
  remembered,
  calls,
  halves: { client: g.LIB_CLIENT_HALF ?? 0, server: g.LIB_SERVER_HALF ?? 0 },
  method: save.method,
  url: serverFnId(save).length > 0,
}`)
      const loaded = (names: Array<string>, extra: object) => ({
        index: 0,
        fns: 0,
        factory: 0,
        auth: 0,
        ...Object.fromEntries(names.map((name) => [name, 1])),
        ...extra,
      })
      const value = (n: number, received: string | null) => ({
        n,
        seen: n,
        session: true,
        size: 1,
        snap: 'a/b',
        db: 'MARK_LIB_DB',
        received,
      })
      expect(result).toEqual({
        atStart: loaded([], { schema: 0, builds: 0, db: 0 }),
        rendered: true,
        // the caller copy has no validator (R159, as the client's copy): the
        // schema is built once, by the instance (main: by the chunk too)
        afterRender: loaded(shape.chain, { schema: 0, builds: 0, db: 0 }),
        afterCall: loaded(shape.chain, { schema: 1, builds: 1, db: 1 }),
        end: loaded(shape.chain, { schema: 1, builds: 1, db: 1 }),
        remembered: 1,
        // the copy's calls run the middleware's client half, whose context
        // reaches its server half; an HTTP call by id sends none
        calls: [
          value(1, 'from-client'),
          value(2, null),
          value(3, null),
          value(4, 'from-client'),
        ],
        halves: { client: 2, server: 4 },
        method: 'POST',
        // (a production build: the manifest lists only client-referenced
        // ids, J4.2; the copy's calls and the HTTP calls reach it by its id)
        url: true,
      })
    },
    timeout,
  )

  test(
    'SSR: a server fn whose validator assigns an exported binding, only the split component calls it: the component is split on the server; one instance counts 1 2 3 4',
    async () => {
      const { result } = await build.ssr
        .run(`${callByIdPrelude}const atStart = globalThis.MARK_VW_UI ?? 0
const { routeTree } = entry.getRouter()
const rendered = (await entry.renderPath(routeTree, '/validator-writes')).includes('MARK_VW_PAGE')
const afterRender = globalThis.MARK_VW_UI ?? 0
const save = globalThis.__vw
const calls = [await save({ data: {} })]
calls.push(await callById(serverFnId(save), {}, 'POST'))
calls.push(await callById(serverFnId(save), {}, 'POST'))
calls.push(await save({ data: {} }))
return { atStart, rendered, afterRender, calls, seen: entry.vwSeen }`)
      expect(result).toEqual({
        atStart: 0,
        rendered: true,
        afterRender: 1,
        calls: [1, 2, 3, 4],
        seen: 4,
      })
    },
    timeout,
  )

  test(
    'SSR: a server fn only the client side of an isomorphic fn calls loads nothing at server start',
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
    "SSR: an HTTP call loads its handler's imports before its middleware runs, as main's provider module does",
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

  test(
    'SSR: a module that awaits one of its own server fns in the disposer of an `await using` in a top-level block or for head evaluates',
    async () => {
      const { result } = await build.ssr.run(`const loaded = {}
for (const [form, load] of Object.entries(entry.loadTlaUsing)) {
  const tla = await load()
  loaded[form] = { results: tla.results, again: await tla.tlaUsingFn() }
}
return { loaded, dep: globalThis.MARK_TLA_USING_DEP }`)
      expect(result).toEqual({
        loaded: Object.fromEntries(
          ['block', 'for'].map((form) => {
            const answer = `tla-using-${form}:MARK_TLA_USING_DEP`
            return [form, { results: [answer], again: answer }]
          }),
        ),
        dep: 1,
      })
    },
    timeout,
  )
})

/**
 * A production server reads and parses the handlers of the server fns a
 * request calls, and of no other (as main does): the evaluation counts above
 * cannot see a handler that is loaded and never run. Each server fn is in a
 * file of its own (a handler module holds the handlers of its file), the
 * routes' loaders call them (so the client calls them too, and the server-fn
 * manifest lists them), and the route files import them: the defining
 * modules load with the router. `getSplit`'s handler imports a module that
 * otherwise only the split component of its route imports.
 * Source: audit of the Rsbuild server output (every handler module and its
 * imports in the router's chunk, and a second copy in a chunk of its own).
 */
const firstRequestFiles = {
  'entry.ts': `export {}\n`,
  // (the app's own router entry: the client imports it, and its routes)
  'src/router.ts': routerFile('@tanstack/react-router'),
  'src/called.ts': `${head}export const getCalled = createServerFn().handler(async () => 'MARK_CALLED_HANDLER')
`,
  'src/heavy.server.ts': `export const heavy = 'MARK_HEAVY_DEP'\n`,
  'src/uncalled.ts': `${head}import { heavy } from './heavy.server'
export const getUncalled = createServerFn().handler(async () => 'MARK_UNCALLED_HANDLER:' + heavy)
`,
  'src/split-only.ts': `;(globalThis as any).__splitOnlyEvaluations = ((globalThis as any).__splitOnlyEvaluations ?? 0) + 1
export const splitOnly = 'MARK_SPLIT_ONLY'
`,
  'src/split-fn.ts': `${head}import { splitOnly } from './split-only'
export const getSplit = createServerFn().handler(async () => 'MARK_SPLIT_HANDLER:' + splitOnly)
`,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { getCalled } from '../called'
export const Route = createFileRoute('/')({
  loader: () => getCalled(),
  component: () => <p>{'page:' + Route.useLoaderData()}</p>,
})
`,
  'src/routes/uncalled.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { getUncalled } from '../uncalled'
export const Route = createFileRoute('/uncalled')({
  loader: () => getUncalled(),
  component: () => <p>{'page:' + Route.useLoaderData()}</p>,
})
`,
  'src/routes/split.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { getSplit } from '../split-fn'
import { splitOnly } from '../split-only'
function Page() {
  const evaluations = (globalThis as any).__splitOnlyEvaluations
  return <p>{'page:' + Route.useLoaderData() + ':' + splitOnly + ':' + evaluations}</p>
}
export const Route = createFileRoute('/split')({
  loader: () => getSplit(),
  component: Page,
})
`,
}

/** The markers of `firstRequestFiles`' handlers and of their imports. */
const handlerMarkers = [
  'MARK_CALLED_HANDLER',
  'MARK_UNCALLED_HANDLER',
  'MARK_HEAVY_DEP',
  'MARK_SPLIT_HANDLER',
  'MARK_SPLIT_ONLY',
] as const

/**
 * A fresh Node process imports the server bundle's entry (Start's server
 * entry) after registering a load hook, then requests `paths` in order:
 * for each, the response's status and text, and every file of `outDir` the
 * process had loaded by then.
 */
const requestsProgram = (
  serverEntryFile: string,
  outDir: string,
  paths: Array<string>,
) => `import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
const loaded = new Set()
registerHooks({
  load(url, context, nextLoad) {
    if (url.startsWith('file:')) {
      const file = fileURLToPath(url)
      if (file.startsWith(${JSON.stringify(outDir + path.sep)})) {
        loaded.add(file)
      }
    }
    return nextLoad(url, context)
  },
})
${runNodeStep('importing the server entry')}const serverModule = await import(${JSON.stringify(pathToFileURL(serverEntryFile).href)})
const serverEntry = typeof serverModule.default?.fetch === 'function' ? serverModule.default : serverModule.default?.default
const steps = []
for (const path of ${JSON.stringify(paths)}) {
${runNodeStep('requesting a page')}  const response = await serverEntry.fetch(new Request(new URL(path, 'http://localhost')))
  steps.push({ path, status: response.status, text: await response.text(), loaded: [...loaded] })
}
process.stdout.write(JSON.stringify(steps))
process.exit(0)
`

describe.each(startBundlers)(
  '%s build: the files a production server loads',
  (bundler) => {
    let build: StartBuild

    const openBuild2 = closeAfterAll()
    beforeAll(async () => {
      build = await openBuild2(() =>
        buildStartShared({
          bundler,
          files: firstRequestFiles,
        }),
      )
    }, timeout)

    test(
      'each handler, and each module only handlers or split chunks import, is emitted once',
      () => {
        expect(
          Object.fromEntries(
            handlerMarkers.map((marker) => [
              marker,
              build.ssr.chunks
                .filter((chunk) => chunk.code.includes(marker))
                .map((chunk) => chunk.fileName),
            ]),
          ),
        ).toEqual(
          Object.fromEntries(
            handlerMarkers.map((marker) => [marker, [expect.any(String)]]),
          ),
        )
      },
      timeout,
    )

    test(
      'the first request loads the handler it calls and no other; a handler sharing a module with a split component loads it once',
      async () => {
        const { outDir } = build.ssr
        const { stdout } = await runNodeProgram(
          requestsProgram(path.join(outDir, build.ssr.entry.fileName), outDir, [
            '/',
            '/uncalled',
            '/split',
          ]),
          { cwd: outDir, env: { ...process.env, NODE_ENV: 'production' } },
        )
        const steps = JSON.parse(stdout) as Array<{
          path: string
          status: number
          text: string
          loaded: Array<string>
        }>
        const markersIn = (files: Array<string>) => {
          const code = files.map((file) => readFileSync(file, 'utf8'))
          return handlerMarkers.filter((marker) =>
            code.some((text) => text.includes(marker)),
          )
        }
        expect(
          steps.map((step) => ({
            path: step.path,
            status: step.status,
            page: /page:[^<]*/.exec(step.text)?.[0],
            markers: markersIn(step.loaded),
          })),
        ).toEqual([
          {
            path: '/',
            status: 200,
            page: 'page:MARK_CALLED_HANDLER',
            markers: ['MARK_CALLED_HANDLER'],
          },
          {
            path: '/uncalled',
            status: 200,
            page: 'page:MARK_UNCALLED_HANDLER:MARK_HEAVY_DEP',
            markers: [
              'MARK_CALLED_HANDLER',
              'MARK_UNCALLED_HANDLER',
              'MARK_HEAVY_DEP',
            ],
          },
          {
            path: '/split',
            status: 200,
            page: 'page:MARK_SPLIT_HANDLER:MARK_SPLIT_ONLY:MARK_SPLIT_ONLY:1',
            markers: [...handlerMarkers],
          },
        ])
      },
      timeout,
    )
  },
)

// `@vitejs/plugin-vue` serves an SFC's `<script lang="ts">` block in builds
// as a module of its own (`Page.vue?vue&type=script&lang.ts`); its
// handlers' server-only modules load on the first call like any module's.
describe('vite build of a Vue app', () => {
  test(
    'SSR: the server-only module of a handler in a <script lang="ts"> block is not loaded with the SFC',
    async () => {
      const host = await closeAtEnd(
        () => createStartHost({ framework: 'vue', serve: false }),
        (opened) => opened.close(),
      )
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
