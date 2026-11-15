import { describe, expect, test } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  callFromClient,
  callServerFnThroughCallers,
  inPage,
  serveCase,
  useStartHost,
} from './regression-helpers'
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
 * No import protection (its dev mock would hide a leaked import from the
 * loads) and `verbatimModuleSyntax` (without it, the TypeScript transform
 * drops imports nothing reads after the compiler and hides leaks).
 */
const host = useStartHost({
  start: { importProtection: { enabled: false } },
  files: {
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        strict: true,
        verbatimModuleSyntax: true,
      },
    }),
  },
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

describe('main parity (kind B)', () => {
  // e02: a cycle through an effectful declaration only the handler reads
  test('e02: a cycle through an effectful const goes from the client; the server runs it once', async () => {
    const served = await serveCase(await host(), {
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
  test('e06: an effectful initialiser only the handler reads leaves the client with its import', async () => {
    const served = await serveCase(await host(), {
      ...callsFile,
      'module.tsx': `${serverFn}import { connect } from './calls'
const db = connect('db')
export const fn = createServerFn().handler(async () => db.q())`,
    })
    expectNotLoaded(await served.loads(), ['./calls'])
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('db')
    expect(await serverCalls(served)).toEqual(['db'])
  })

  // (server: the handler module has its own copy, as main's provider copy:
  // R156)
  test('e07: an effectful initialiser an export reads too stays on the client and runs once there', async () => {
    const served = await serveCase(await host(), {
      ...callsFile,
      'module.tsx': `${serverFn}import { connect } from './calls'
const db = connect('db')
export const fn = createServerFn().handler(async () => db.q())
export const g = () => db.q()`,
    })
    expect(await clientCalls(served, `await load('module.tsx')`)).toEqual([
      'db',
    ])
    expect(await serverCalls(served)).toEqual(['db'])
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('db')
    expect(await serverCalls(served)).toEqual(['db', 'db'])
  })

  // e08, n1: named, default and namespace imports only the handler reads
  // leave the client; a bare import and an import nothing reads stay
  test('e08, n1: imports the handler reads leave the client; a bare and a never-read import stay', async () => {
    const served = await serveCase(await host(), {
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
  test('e11, e11b: statements on a binding only the handler reads stay and run in both environments', async () => {
    const served = await serveCase(await host(), {
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
    expect(await serverCalls(served)).toEqual(ran)
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('db')
    // the handler module's copy runs `db` and the statements naming it
    // again, at the first call, as main's provider copy does (R156); main's
    // copy also runs `try` again
    expect(await serverCalls(served)).toEqual([
      ...ran,
      'db',
      'if',
      'for:db',
      'iife:db',
    ])
  })

  // e12: `export { db }` keeps it on the client
  test('e12: a binding the handler reads and `export { }` names stays on the client', async () => {
    const served = await serveCase(await host(), {
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

  // e26: a kept function writes the container the handler reads: the
  // handler module has its own container, as main's provider copy (R156;
  // main's second instance)
  test('e26: an exported function and the handler each use their own copy of the container', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `${serverFn}const cache = new Map<string, number>()
export function remember(k: string, v: number) { cache.set(k, v) }
export const size = createServerFn().handler(async () => cache.size)`,
    })
    const module = await served.ssr()
    module.remember('a', 1)
    expect(await callFromClient(served, 'module.size')).toBe(0)
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
  // `let`; on the server the handler assigns its module's copy, as main's
  // provider copy (R156; main's second instance)
  test('e29b: a `let` the handler assigns and an export reads: the handler assigns its own copy on the server', async () => {
    const served = await serveCase(await host(), {
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
    expect((await served.ssr()).peek()).toBe(undefined)
  })

  // t2, t3: a value import the handler reads by value and kept code only in
  // a type (`typeof db`, `x is Model`) leaves the client
  test('t2: a const the handler reads, and kept code only by `typeof`, leaves the client', async () => {
    const served = await serveCase(await host(), {
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

  test('t3: a class the handler constructs and kept code names only in a type predicate leaves the client', async () => {
    const served = await serveCase(await host(), {
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
  test('e03: a class in a cycle only the handler reads leaves the client whole', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `${serverFn}class A { static y = b() }
function b() { return () => A }
export const fn = createServerFn().handler(async () => typeof b())`,
    })
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe(
      'function',
    )
  })

  // e10d, e10g: an enum kept code reads, and an exported enum, stay
  test('e10d, e10g: an enum kept code reads and an exported enum stay on the client', async () => {
    const served = await serveCase(await host(), {
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
  test('e10e, e10f: merged declarations and a const enum only the handler reads leave the client', async () => {
    const served = await serveCase(await host(), {
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

  // l6: `handler(createServerOnlyFn(f))`: `main`'s client stub throws
  // instead of calling the server
  test('l6: a handler that is a createServerOnlyFn call runs on the server when the client calls it', async () => {
    const served = await serveCase(await host(), {
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
describe('handlers on the one placement (kind A)', () => {
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
  test('l1, client: a function only the handler calls leaves the client although it assigns a kept `let`', async () => {
    const served = await serveCase(await host(), {
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

  // l1 on the server: the handler module copies `clear` and `cache`, as
  // main's provider copy (R156): the handler clears its own `cache`, the
  // export's stays (main's second instance), and `./db.server` loads with
  // the handler module, at the first call
  test('l1, server: that handler clears the copy of `cache` in its own module, lazily', async () => {
    const served = await serveCase(await host(), {
      ...callsFile,
      ...recordedServer('db.server'),
      'module.tsx': `${serverFn}import { db } from './db.server'
let cache: Map<string, number> | null = null
function clear() { cache = null; db.reset() }
export function getCache() { return (cache ??= new Map()) }
export const reset = createServerFn().handler(async () => { clear(); return 'reset' })`,
    })
    expect(await serverCalls(served)).toEqual([])
    const module = await served.ssr()
    const before = module.getCache()
    expect(await callFromClient(served, 'module.reset')).toBe('reset')
    expect(module.getCache()).toBe(before)
    expect(await serverCalls(served)).toEqual(['db.server'])
  })

  // e13, l10: a container a top-level statement fills stays with the
  // statement and its import, and the statement runs at load; the handler
  // module fills its own copy at the first call, as main's provider copy
  // (R156)
  test('e13, l10: a container a statement fills stays in the module and is filled at load', async () => {
    const served = await serveCase(await host(), {
      ...callsFile,
      'module.tsx': `${serverFn}import { connect } from './calls'
const table = new Map<string, unknown>()
table.set('a', connect('a'))
table.set('b', connect('b'))
export const fn = createServerFn().handler(async ({ data }: { data: string }) => (table.get(data) as any).name)`,
    })
    expect(await serverCalls(served)).toEqual(['a', 'b'])
    expect(await callServerFnThroughCallers(served, 'module.fn', 'b')).toBe('b')
    expect(await serverCalls(served)).toEqual(['a', 'b', 'a', 'b'])
  })

  // e11: statements reading what only the handler reads run at load, in
  // source order; the handler module's copy runs the ones naming what it
  // copies again at the first call (R156; main's copy runs all of them)
  test('e11: statements on a binding only the handler reads run at load on the server, in source order', async () => {
    const served = await serveCase(await host(), {
      ...callsFile,
      'module.tsx': `${serverFn}import { connect } from './calls'
const db = connect('db')
if (db.name) { connect('if') }
try { connect('try') } catch {}
export const fn = createServerFn().handler(async () => db.q())`,
    })
    expect(await serverCalls(served)).toEqual(['db', 'if', 'try'])
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('db')
    expect(await serverCalls(served)).toEqual(['db', 'if', 'try', 'db', 'if'])
  })

  // e23: `let db; db = connect()` read by a handler: both stay, the
  // assignment runs at load; the handler module's copy runs it again at the
  // first call (R156, as main's provider copy)
  test('e23: a `let` a top-level statement assigns stays with the statement, which runs at load', async () => {
    const served = await serveCase(await host(), {
      ...callsFile,
      'module.tsx': `${serverFn}import { connect } from './calls'
let db: ReturnType<typeof connect>
db = connect('db')
export const fn = createServerFn().handler(async () => db.q())`,
    })
    expect(await serverCalls(served)).toEqual(['db'])
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('db')
    expect(await serverCalls(served)).toEqual(['db', 'db'])
  })

  // l13: code never used that reads the handler's helper keeps the helper
  // (and what it reads) in the module (R153 amendment: already-unused code
  // stays); the handler module has its own copy of it (R156)
  test('l13: a helper code never used reads stays in the module, with its import', async () => {
    const served = await serveCase(await host(), {
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
  test('t1: a class import the handler uses only as a type does not load on the server', async () => {
    const served = await serveCase(await host(), {
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
describe('a value only a type-only export reads (F1)', () => {
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
      const served = await serveCase(await host(), {
        ...schemaFiles,
        'module.tsx': `${head}${typeExport}\n${handler}`,
      })
      expectNotLoaded(await served.loads(), ['./schema.server', './make'])
      expectNotLoaded(await served.serverLoads(), ['./schema.server', './make'])
      expect(await callServerFnThroughCallers(served, 'module.getUser')).toBe(1)
    },
  )

  test('t7: a function only an exported type reads goes with its import', async () => {
    const served = await serveCase(await host(), {
      ...dbServer(),
      'module.tsx': `${serverFn}import { db } from './db.server'
function Unused() { return db.q() }
export type U = ReturnType<typeof Unused>
${handler}`,
    })
    expectNotLoaded(await served.loads(), ['./db.server'])
    expectNotLoaded(await served.serverLoads(), ['./db.server'])
  })

  test('t5, kind B: a value only a local type reads stays and runs', async () => {
    const served = await serveCase(await host(), {
      ...schemaFiles,
      'module.tsx': `${head}type User = typeof UserSchema
export function show(u: User) { return String(u) }
${handler}`,
    })
    expect(await clientCalls(served, `await load('module.tsx')`)).toEqual([
      'schema.server',
      'makeSchema',
    ])
    expect(await serverCalls(served)).toEqual(['schema.server', 'makeSchema'])
  })

  test('t6, t8, kind B: an import a parameter annotation or a class used as a type reads stays', async () => {
    const served = await serveCase(await host(), {
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
      'base.server',
    ])
  })
})

// R156 (gate probe x2; integration: start-build-handler-local-writes, round 1
// F2-1): the handler module copies what it reads from its module, with the
// statements naming it, as main's provider copy does, so a value the source
// read at load before a write through a local name keeps that value. Kind A:
// failed when the handler module imported `cfg` and evaluated `snapshot` at
// the first call (`'b/b'`).
test('x2: a handler reads the value its module read at load before a write through a local name', async () => {
  const served = await serveCase(await host(), {
    'module.tsx': `${serverFn}const cfg = { url: 'a' }
const snapshot = cfg.url
function set(o: { url: string }) { o.url = 'b' }
set(cfg)
export const getCfg = () => cfg.url
export const viaParam = createServerFn().handler(async () => snapshot + '/' + cfg.url)`,
  })
  expect(await callServerFnThroughCallers(served, 'module.viaParam')).toBe(
    'a/b',
  )
  expect((await served.ssr()).getCfg()).toBe('b')
})

// R1 (review-phase1 3.1): the handler module copies, with what it copies,
// the top-level code that reaches it through other names, as main's
// provider copy of the whole file runs it: a function the module calls at
// load, a helper filling a registry, a write through an alias, a class
// static block, a never-read declaration. Kind A: each failed at cb9d1331b2
// (the copy held the state without the code that changes it). The control
// row: code that reaches nothing the handler copies is not copied.
describe('the handler module copies the load-time code reaching what it copies (R1)', () => {
  test.each([
    {
      name: 'r1: a function the module calls at load writes the state',
      code: `const cfg = { url: 'a' }
function init() { cfg.url = 'b' }
init()
export const getCfg = () => cfg.url
export const f = createServerFn().handler(async () => cfg.url)`,
      expected: 'b',
    },
    {
      name: 'r2: a registry filled through a helper',
      code: `const registry = new Map<string, number>()
function register(k: string, v: number) { registry.set(k, v) }
register('a', 1)
register('b', 2)
export const f = createServerFn().handler(async () => [registry.get('a'), registry.size])`,
      expected: [1, 2],
    },
    {
      name: 'r3: a write through an alias',
      code: `const cfg = { url: 'a', n: 0 }
const alias = cfg
alias.url = 'b'
export const f = createServerFn().handler(async () => cfg.url)`,
      expected: 'b',
    },
    // (a class only an export reads is not reached: main keeps it because
    // its removal rule never removes a class; open, review-phase1 r5)
    {
      name: 'r5: a class static block',
      code: `const routes: Array<string> = []
class Boot { static { routes.push('boot') } }
export const f = createServerFn().handler(async () => routes.length)`,
      expected: 1,
    },
    {
      name: 'r6: a never-read declaration',
      code: `const registry = new Map<string, number>()
const _boot = registry.set('a', 1)
export const f = createServerFn().handler(async () => registry.get('a'))`,
      expected: 1,
    },
    // main's copy deletes `filled` (only an export read it; its exports are
    // stripped), so the handler reads `undefined`, as on main (R153)
    {
      name: 'r7: a declaration only an export reads, filling the state, as main',
      code: `const registry = new Map<string, number>()
const filled = registry.set('a', 1)
export const g = () => filled
export const f = createServerFn().handler(async () => registry.get('a'))`,
      expected: undefined,
    },
  ])('$name', async ({ code, expected }) => {
    const served = await serveCase(await host(), {
      'module.tsx': `${serverFn}${code}`,
    })
    expect(await callServerFnThroughCallers(served, 'module.f')).toEqual(
      expected,
    )
  })

  // (main's copy runs it again: fewer runs than main, as many as the source.
  // Code reaching the copied state through any name, an export reading both
  // included, is copied and runs again, as on main)
  // Known difference (accepted, KNOWN-BUGS "Accepted limits"): a class
  // whose only reader is an export is not reached by name, so the handler
  // module's copy lacks its static block; main keeps every class (its
  // removal rule never removes one) and reads 1. Pinned: asserts main's value.
  test.fails(
    'r5 known difference: a class static block whose class only an export reads',
    async () => {
      const served = await serveCase(await host(), {
        'module.tsx': `${serverFn}const routes: Array<string> = []
class Boot { static { routes.push('boot') } }
export const boot = Boot
export const f = createServerFn().handler(async () => routes.length)`,
      })
      expect(await callServerFnThroughCallers(served, 'module.f')).toBe(1)
    },
  )

  test('r8: load-time code that reaches nothing the handler copies runs once', async () => {
    const served = await serveCase(await host(), {
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
