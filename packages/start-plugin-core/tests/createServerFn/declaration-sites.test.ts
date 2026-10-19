/**
 * Where a `createServerFn` can be written (SPEC J4.6; user ruling D13):
 * top-level server fns work everywhere; a server fn nested in a function
 * whose handler reads no local of the function works too (goal pins); any
 * other position works or is rejected with a clear error at the call, and
 * never ships its handler to the client.
 */
import { describe, expect, test } from 'vitest'
import {
  callProvider,
  callServerFnThroughCallers,
  callerRpcId,
  compileAll,
  compileFor,
  evaluateModule,
  expectCompileError,
  expectNoClientHandler,
  moduleLoads,
  outputs,
} from '../regression-helpers'
import { placementModule, placements } from './placements'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import type { ServerFn } from '../../src/start-compiler/types'
import type { PlacementHead } from './placements'

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

/** Compiles every output of `source` on its own, like `compileAll`. */
async function compileEach(source: string) {
  const compiled = {} as Awaited<ReturnType<typeof compileAll>>
  let serverFns: Record<string, ServerFn> = {}
  for (const output of outputs) {
    const result = await compileFor(output, source)
    compiled[output] = result.code ?? source
    if (output !== 'provider') {
      serverFns = { ...serverFns, ...result.serverFns }
    }
  }
  compiled.serverFns = serverFns
  return compiled
}

const dbStubs = {
  './db.server': { db: { inner: () => 'inner', top: () => 'top' } },
}

// Loosened regression (the statement-list crash), paired with the goal pins
// "supports a server fn in $name" below and the leak pins of
// known-bugs-start-compiler.test.ts: a `createServerFn` declared below the
// module top level compiles to valid modules or is rejected naming
// `createServerFn` (main gives that rejection no position: pinned there),
// and top-level server fns next to it are still extracted. When the client
// gives the nested server fn an RPC, it reaches the handler.
test.each([
  {
    name: 'a function',
    code: inFunction,
    hasTop: false,
    read: (module: Record<string, any>) => module.make(),
  },
  {
    name: 'a switch case inside a function',
    code: inSwitchCase,
    hasTop: false,
    read: (module: Record<string, any>) => module.pick('a'),
  },
  {
    name: 'a function next to a top-level one',
    code: `${top}${inFunction}`,
    hasTop: true,
    read: (module: Record<string, any>) => module.make(),
  },
  {
    name: 'a switch case next to a top-level one',
    code: `${top}${inSwitchCase}`,
    hasTop: true,
    read: (module: Record<string, any>) => module.pick('a'),
  },
])(
  'a server fn declared in $name compiles to valid modules or is rejected',
  async ({ code, hasTop, read }) => {
    const source = `${head}${code}`
    const compiled: Partial<Record<(typeof outputs)[number], string>> = {}
    for (const output of outputs) {
      let result: Awaited<ReturnType<typeof compileFor>>
      try {
        result = await compileFor(output, source)
      } catch (error) {
        expectCompileError(error, {
          source,
          at: undefined,
          names: ['createServerFn'],
        })
        continue
      }
      compiled[output] = result.code ?? source
      expect(await getModuleErrors(compiled[output]), output).toEqual([])
    }
    if (hasTop && compiled.provider !== undefined) {
      expect(
        await callProvider(
          { ssr: compiled.ssr, provider: compiled.provider },
          'top',
        ),
      ).toBe('top')
    }
    if (
      outputs.every((output) => compiled[output] !== undefined) &&
      callerRpcId(read(await evaluateModule(compiled.client!))) !== undefined
    ) {
      expect(
        await callServerFnThroughCallers(await compileEach(source), read),
      ).toBe('nested')
    }
  },
)

/**
 * The positions where a clear rejection is as valid as support: not a
 * function scope a handler could capture locals of (SPEC J4.6 "other
 * positions likewise work or error clearly").
 */
const otherPositions = placements.filter((placement) => !placement.nested)

// Loosened regression, paired with the pins "with another Start factory
// imported, a server fn in $name works or is rejected at the call" of
// known-bugs-start-compiler.test.ts (main's rejection has no position).
// Next to another Start factory, these placements never ship the handler
// to the client: each output rejects the code naming createServerFn or
// keeps the handler in the provider only, and a client server fn reaches
// it. With createServerFn alone, and for declarators nested below the top
// level, they are pinned in known-bugs-start-compiler.test.ts.
test.each([
  ...otherPositions,
  ...placements.filter(
    (placement) => placement.nested && !placement.declarator,
  ),
])(
  'next to another Start factory, a server fn in $name does not ship its handler to the client',
  async ({ code, read }) => {
    await expectNoClientHandler(
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
    await expectNoClientHandler(placementModule(importHead, wrappedTwice), {
      rejection: 'named',
      read: (module) => module.fn,
    })
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
test.fails.each<PlacementHead>(['createServerFn alone', 'another Start factory'])(
  'with %s imported, a server fn wrapped in two calls works like an unwrapped one',
  async (importHead) => {
    const compiled = await compileAll(placementModule(importHead, wrappedTwice))
    expectNotLoaded(await moduleLoads(compiled.client), ['./db.server'])
    expect(compiled.client).not.toContain('db.inner()')
    expect(
      await callServerFnThroughCallers(
        compiled,
        (module) => module.fn,
        dbStubs,
      ),
    ).toBe('inner')
  },
)

// Malformed-input diagnostic control (SPEC §8, G5): `.validator()` without
// a validator is a type error (tsc against the real declarations: TS2554
// "Expected 1 arguments, but got 0"). It only has to fail clearly, naming
// the API; a position is not required of input the types reject.
test('rejects a validator call without a validator', async () => {
  const source = `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
export const fn = createServerFn().validator().handler(async () => 1)`
  for (const output of outputs) {
    const error = await compileFor(output, source).catch(
      (caught: unknown) => caught,
    )
    expectCompileError(error, { source, at: undefined, names: ['validator'] })
  }
})

// Goal (N13, user ruling D13): a server fn nested in a function is supported
// like a top-level one when its handler reads no local of the function: the
// callers get an RPC, and the provider runs its handler under the id the
// callers use. (One whose handler reads a local may also be rejected:
// pinned in known-bugs-start-compiler.test.ts.) Today these are left
// untransformed, rejected or extracted into an invalid provider (pins in
// known-bugs-start-compiler.test.ts).
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
      const compiled = await compileEach(placementModule(importHead, code))
      expectNotLoaded(await moduleLoads(compiled.client), ['./db.server'])
      expect(
        await callServerFnThroughCallers(compiled, read!, dbStubs),
      ).toBe('inner')
    })
  },
)

// Goal (N13, user ruling D13): a server fn created in the handler of another
// one is supported. Callers get an RPC of the outer server fn, its handler
// runs in the provider under the id the callers use and calls the inner one
// there; how the inner one is compiled is left open. Today it is left
// untransformed or extracted into an invalid provider (pins in
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
    const compiled = await compileEach(
      placementModule(importHead, placement.code),
    )
    for (const output of outputs) {
      expect(await getModuleErrors(compiled[output]), output).toEqual([])
    }
    expectNotLoaded(await moduleLoads(compiled.client), ['./db.server'])
    expect(compiled.client, 'client').not.toContain('db.inner()')
    // The outer handler returns what the inner server fn returns.
    expect(
      await callServerFnThroughCallers(compiled, placement.read!, dbStubs),
    ).toBe('inner')
  },
)

// Goal (N13, user ruling D13): two functions of a module each declare a
// server fn under the same local name; each runs its own handler.
// Today they are left untransformed, rejected or extracted into an invalid
// provider (pins in known-bugs-start-compiler.test.ts, placement "a function
// body").
test.fails.each<PlacementHead>([
  'createServerFn alone',
  'another Start factory',
])(
  'with %s imported, supports server fns of the same name in two functions',
  async (importHead) => {
    const compiled = await compileEach(
      placementModule(
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
    )
    expect([
      await callServerFnThroughCallers(
        compiled,
        (module) => module.makeInner(),
        dbStubs,
      ),
      await callServerFnThroughCallers(
        compiled,
        (module) => module.makeTop(),
        dbStubs,
      ),
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
  const compiled = await compileAll(
    `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn({ method: 'GET' })${handler}`,
  )
  expect(Object.keys(compiled.serverFns)).toHaveLength(1)
  expect(compiled.client).not.toContain('SERVER_SECRET')
  expect(await callProvider(compiled, 'fn')).toEqual(
    handler.includes('secret:') ? { secret: 'SERVER_SECRET' } : 'SERVER_SECRET',
  )
})

// Bug: `.handler()` called through an optional chain
// (`createServerFn()?.handler(...)`) is not recognised: the module is left
// untransformed.
// Impact: the handler and its imports ship to the client, which calls it
// in the browser instead of through an RPC.
// Fix-agnostic: compiling it like a plain chain (an RPC on the client, the
// handler in the provider) or rejecting it with a clear error at the call,
// naming createServerFn, both pass.
// Source: #8504 declaration-sites.test.ts (red on main)
test.fails(
  'a server fn created through an optional call chain compiles like a plain chain or is rejected',
  async () => {
    const code = `${head}import { db } from './db.server'
export const fn = createServerFn()?.handler(async () => db.inner())`
    const client = await compileFor('client', code).catch((error: unknown) => ({
      error,
    }))
    if ('error' in client) {
      expectCompileError(client.error, {
        source: code,
        at: 'createServerFn()?.',
        names: ['createServerFn'],
      })
      return
    }
    const compiled = await compileAll(code)
    expectNotLoaded(await moduleLoads(compiled.client), ['./db.server'])
    expect(compiled.client).not.toContain('db.inner()')
    expect(
      await callServerFnThroughCallers(compiled, (module) => module.fn, {
        './db.server': { db: { inner: () => 'inner' } },
      }),
    ).toBe('inner')
  },
)

// Source: #8504 declaration-sites.test.ts
test('a .ts module in a directory whose name contains # compiles as TypeScript', async () => {
  const compiled = await compileAll(
    `${head}export const fn = createServerFn().handler(async ({ data }) => <string>(data ?? 'from the server'))`,
    { id: '/test/c#proj/src/module.ts' },
  )
  expect(compiled.client).not.toContain('from the server')
  expect(
    await callServerFnThroughCallers(compiled, (module) => module.fn),
  ).toBe('from the server')
})
