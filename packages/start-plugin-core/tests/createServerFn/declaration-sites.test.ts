/**
 * Where a `createServerFn` can be written (SPEC J4.6; user ruling D13):
 * top-level server fns work everywhere; a server fn nested in a function
 * whose handler reads no local of the function works too (goal pins); any
 * other position works or is rejected with a clear error at the call, and
 * never ships its handler to the client. Observed through the public Start
 * host: what each environment serves or rejects, what a page loads, and
 * calls of the server fns from the client (by id, through Start's server
 * entry) and from server code.
 */
import { describe, expect, test } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  callFromClient,
  callOnServer,
  callServerFnThroughCallers,
  compileError,
  expectCompileError,
  expectNoClientHandler,
  inPage,
  serveCase,
  serverFnUrls,
  useStartHost,
} from '../regression-helpers'
import { placementModule, placements } from './placements'
import type { PlacementHead } from './placements'

const host = useStartHost()

const head = `import { createServerFn } from '@tanstack/react-start'\n`
const top = `export const top = createServerFn().handler(async () => 'top')\n`
const inFunction = `export function make() {
  const fn = createServerFn().handler(async () => 'nested')
  return fn
}`
const inSwitchCase = `export function pick(kind: string) {
  switch (kind) {
    case 'a':
      const fn = createServerFn().handler(async () => 'nested')
      return fn
  }
}`

/** The server-only module the placement handlers read, as a real file. */
const dbFiles = {
  'db.server.ts': `export const db = { inner: () => 'inner', top: () => 'top' }\n`,
}

const literalPlacements = [
  {
    name: 'a function',
    code: inFunction,
    hasTop: false,
    read: 'module.make()',
  },
  {
    name: 'a switch case inside a function',
    code: inSwitchCase,
    hasTop: false,
    read: "module.pick('a')",
  },
  {
    name: 'a function next to a top-level one',
    code: `${top}${inFunction}`,
    hasTop: true,
    read: 'module.make()',
  },
  {
    name: 'a switch case next to a top-level one',
    code: `${top}${inSwitchCase}`,
    hasTop: true,
    read: "module.pick('a')",
  },
]

// Regression control: an environment either rejects the module clearly or
// serves a working module, and an adjacent top-level server function still
// executes. The paired goal below checks nested RPCs.
test.each(literalPlacements)(
  'a server fn declared in $name compiles to valid modules or is rejected',
  async ({ code, hasTop }) => {
    const source = `${head}${code}`
    const startCase = await (await host()).case({ 'module.tsx': source })
    for (const environment of ['client', 'ssr'] as const) {
      const failure = await compileError(startCase, environment)
      if (failure !== undefined) {
        expectCompileError(failure, {
          source,
          at: undefined,
          names: ['createServerFn'],
        })
        continue
      }
      if (environment === 'client') {
        const run = await startCase.client('return true')
        expect(run.errors, 'client page errors').toEqual([])
        if (hasTop) {
          expect(await callFromClient(startCase, 'module.top')).toBe('top')
        }
      } else {
        await startCase.ssr()
        if (hasTop) {
          expect(await callOnServer(startCase, 'module.top')).toBe('top')
        }
      }
    }
  },
)

// Bug: dependency-free nested handlers remain in successful client output.
// Source: start-SYNTH S13; the four public make/pick usages below.
// Impact: client calls execute the server handler locally instead of using RPC.
test.fails.each(literalPlacements)(
  'a server fn declared in $name never ships its nested handler to the client',
  async ({ code, hasTop, read }) => {
    // Keep the original literal-returning input, as well as a distinct
    // executable canary. Required nested support has no rejection branch.
    for (const body of [
      code,
      code.replaceAll(
        "async () => 'nested'",
        "async () => ['MARK_LITERAL_NESTED_HANDLER', 'nested'][1]",
      ),
    ]) {
      const served = await serveCase(await host(), {
        'module.tsx': `${head}${body}`,
      })
      expect(served.code.client).not.toContain('MARK_LITERAL_NESTED_HANDLER')
      // The client gets an RPC: a server fn with its public url.
      expect(await inPage(served, `return typeof (${read}).url`)).toBe('string')
      // RPC absence cannot skip server execution or excuse a local handler.
      expect(await callFromClient(served, read)).toBe('nested')
      expect(await callOnServer(served, read)).toBe('nested')
      if (hasTop) {
        expect(await callFromClient(served, 'module.top')).toBe('top')
      }
    }
  },
)

// Loosened regression, paired with the pins "with another Start factory
// imported, a server fn in $name works or is rejected at the call" of
// known-bugs-start-compiler.test.ts (main's rejection has no position).
// Next to another Start factory, these placements never ship the handler
// to the client: each environment rejects the code naming createServerFn
// or serves a working module without the handler, and calling the server
// fn from the client and from server code runs it. With createServerFn
// alone, and for declarators below the top level (in a function, a switch
// case or a top-level block), they are pinned in
// known-bugs-start-compiler.test.ts.
test.each(placements.filter((placement) => !placement.declarator))(
  'next to another Start factory, a server fn in $name does not ship its handler to the client',
  async ({ code, read }) => {
    await expectNoClientHandler(
      await host(),
      placementModule('another Start factory', code),
      { rejection: 'named', read },
    )
  },
)

/** A top-level server fn wrapped in two calls of a user helper. */
const wrappedTwice = `const wrap = <T,>(fn: T) => fn
export const fn = wrap(wrap(createServerFn().handler(async () => db.inner())))`

// Loosened regression of the goal below (S16): wrapped in user helper calls,
// a top-level server fn never ships its handler to the client, whatever
// factories the module imports.
test.each<PlacementHead>(['createServerFn alone', 'another Start factory'])(
  'with %s imported, a server fn wrapped in two calls does not ship its handler to the client',
  async (importHead) => {
    await expectNoClientHandler(
      await host(),
      placementModule(importHead, wrappedTwice),
      { rejection: 'named', read: 'module.fn' },
    )
  },
)

// Bug: a server fn passed through calls of a user helper (`wrap(wrap(...))`,
// e.g. helpers registering or typing it) is not extracted: the compiler
// rejects it ("must be assigned to a variable"), although the server fn
// itself initializes a top-level variable. Transparent wrappers are a
// supported recognition form (SPEC J4.5), so rejecting is no fix here.
// Impact: the build fails for a module whose server fn the user can only
// write unwrapped.
// Source: FIX-PLAN S16 (Sol F17); declaration-sites "wrapped in two calls".
test.fails.each<PlacementHead>([
  'createServerFn alone',
  'another Start factory',
])(
  'with %s imported, a server fn wrapped in two calls works like an unwrapped one',
  async (importHead) => {
    const served = await serveCase(await host(), {
      'module.tsx': placementModule(importHead, wrappedTwice),
      ...dbFiles,
    })
    expectNotLoaded(await served.loads(), ['./db.server'])
    expect(served.code.client).not.toContain('db.inner()')
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('inner')
  },
)

// Malformed-input diagnostic control (SPEC §8, G5): `.validator()` without
// a validator is a type error (tsc against the real declarations: TS2554
// "Expected 1 arguments, but got 0"). It only has to fail clearly, naming
// the API; a position is not required of input the types reject.
test('rejects a validator call without a validator', async () => {
  const source = `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
export const fn = createServerFn().validator().handler(async () => 1)`
  const startCase = await (await host()).case({ 'module.tsx': source })
  for (const environment of ['client', 'ssr'] as const) {
    expectCompileError(await compileError(startCase, environment), {
      source,
      at: undefined,
      names: ['validator'],
    })
  }
})

// Goal (N13, user ruling D13): a server fn nested in a function is supported
// like a top-level one when its handler reads no local of the function: the
// client gets an RPC, and the server runs its handler under the id the
// client uses. (One whose handler reads a local may also be rejected:
// pinned in known-bugs-start-compiler.test.ts.) Today these are left
// untransformed, rejected or extracted into an invalid server module (pins
// in known-bugs-start-compiler.test.ts).
describe.each<PlacementHead>(['createServerFn alone', 'another Start factory'])(
  'with %s imported',
  (importHead) => {
    test.fails.each(
      placements.filter(
        (placement) =>
          placement.nested &&
          placement.name !== 'the handler of another server fn',
      ),
    )('supports a server fn in $name', async ({ code, read }) => {
      const served = await serveCase(await host(), {
        'module.tsx': placementModule(importHead, code),
        ...dbFiles,
      })
      expectNotLoaded(await served.loads(), ['./db.server'])
      expect(await callServerFnThroughCallers(served, read!)).toBe('inner')
    })
  },
)

// Goal (N13, user ruling D13): a server fn created in the handler of another
// one is supported. The client gets an RPC of the outer server fn, its
// handler runs on the server under the id the client uses and calls the
// inner one there; how the inner one is compiled is left open. Today it is
// left untransformed or extracted into an invalid server module (pins in
// known-bugs-start-compiler.test.ts).
// Source: SolidStart compile.spec.ts "keeps client and server ids aligned
// around nested server functions"; #8504 declaration-sites.test.ts
test.fails.each<PlacementHead>([
  'createServerFn alone',
  'another Start factory',
])(
  'with %s imported, supports a server fn in the handler of another server fn',
  async (importHead) => {
    const placement = placements.find(
      ({ name }) => name === 'the handler of another server fn',
    )!
    const served = await serveCase(await host(), {
      'module.tsx': placementModule(importHead, placement.code),
      ...dbFiles,
    })
    expectNotLoaded(await served.loads(), ['./db.server'])
    expect(served.code.client, 'client').not.toContain('db.inner()')
    // The outer handler returns what the inner server fn returns.
    expect(await callServerFnThroughCallers(served, placement.read!)).toBe(
      'inner',
    )
  },
)

// Goal (N13, user ruling D13): two functions of a module each declare a
// server fn under the same local name; each runs its own handler.
// Today they are left untransformed, rejected or extracted into an invalid
// server module (pins in known-bugs-start-compiler.test.ts, placement "a
// function body").
test.fails.each<PlacementHead>([
  'createServerFn alone',
  'another Start factory',
])(
  'with %s imported, supports server fns of the same name in two functions',
  async (importHead) => {
    const served = await serveCase(await host(), {
      'module.tsx': placementModule(
        importHead,
        `export function makeInner() {
  const fn = createServerFn().handler(async () => db.inner())
  return fn
}
export function makeTop() {
  const fn = createServerFn().handler(async () => db.top())
  return fn
}`,
      ),
      ...dbFiles,
    })
    expect([
      await callServerFnThroughCallers(served, 'module.makeInner()'),
      await callServerFnThroughCallers(served, 'module.makeTop()'),
    ]).toEqual(['inner', 'top'])
  },
)

// Sources: TanStack/router#5496 and #5892, where `.handler<T>(...)` was not
// recognized as a server fn and its body reached the client.
test.each([
  {
    name: 'a type argument',
    handler: `.handler<string>(() => 'SERVER_SECRET')`,
  },
  {
    name: 'a Promise type argument',
    handler: `.handler<Promise<{ secret: string }>>(async () => ({ secret: 'SERVER_SECRET' }))`,
  },
])('extracts a server fn whose handler has $name', async ({ handler }) => {
  const served = await serveCase(await host(), {
    'module.tsx': `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn({ method: 'GET' })${handler}`,
  })
  expect(await serverFnUrls(served)).toHaveLength(1)
  expect(served.code.client).not.toContain('SERVER_SECRET')
  expect(await callFromClient(served, 'module.fn')).toEqual(
    handler.includes('secret:') ? { secret: 'SERVER_SECRET' } : 'SERVER_SECRET',
  )
})

// Bug: `.handler()` called through an optional chain
// (`createServerFn()?.handler(...)`) is not recognised: the module is left
// untransformed.
// Impact: the handler and its imports ship to the client, which calls it
// in the browser instead of through an RPC.
// Fix-agnostic: compiling it like a plain chain (an RPC on the client, the
// handler on the server) or rejecting it with a clear error at the call,
// naming createServerFn, both pass.
// Source: #8504 declaration-sites.test.ts (red on main)
test.fails(
  'a server fn created through an optional call chain compiles like a plain chain or is rejected',
  async () => {
    const code = `${head}import { db } from './db.server'
export const fn = createServerFn()?.handler(async () => db.inner())`
    const startCase = await (
      await host()
    ).case({
      'module.tsx': code,
      ...dbFiles,
    })
    const failure = await compileError(startCase)
    if (failure !== undefined) {
      expectCompileError(failure, {
        source: code,
        at: 'createServerFn()?.',
        names: ['createServerFn'],
      })
      return
    }
    const served = await serveCase(await host(), {
      'module.tsx': code,
      ...dbFiles,
    })
    expectNotLoaded(await served.loads(), ['./db.server'])
    expect(served.code.client).not.toContain('db.inner()')
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('inner')
  },
)

// Moved: "a .ts module in a directory whose name contains # compiles as
// TypeScript" is in integration/start-compiler-build-ids.test.ts: Vite's dev
// server serves no module under a `#` directory (a plain Vite app fails the
// same way), so a production build is where the input is reachable.
