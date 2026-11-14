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

  test('e07: an effectful initialiser an export reads too stays on the client and runs once', async () => {
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
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('db')
    expect(await serverCalls(served)).toEqual(['db'])
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
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('db')
    // each once on the server (where and when: the kind A row of the dispatch, R154)
    expect((await serverCalls(served)).sort()).toEqual([...ran].sort())
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

  // e26: a kept function writes the container the handler reads: the server
  // has one container
  test('e26: an exported function writing the container the handler reads works on the server', async () => {
    const served = await serveCase(await host(), {
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
  test('e29b: a `let` the handler assigns and an export reads is one binding on the server', async () => {
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
    expect((await served.ssr()).peek()).toBe('db')
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
