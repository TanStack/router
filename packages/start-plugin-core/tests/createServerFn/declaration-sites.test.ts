/**
 * Where a `createServerFn` can be written (SPEC J4.6):
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
// The rows: the four public make/pick usages below.
// Impact: client calls execute the server handler locally instead of using RPC.
test.each(literalPlacements)(
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
// to the client: each environment rejects the code with a compile error
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
      { rejection: 'unpositioned', read },
    )
  },
)

/**
 * A top-level server fn wrapped in two calls of a user helper. Its handler
 * holds the marker `MARK_INNER_HANDLER` (a fallback it never returns).
 */
const wrappedTwice = `const wrap = <T,>(fn: T) => fn
export const fn = wrap(wrap(createServerFn().handler(async () => db.inner() ?? 'MARK_INNER_HANDLER')))`

// Loosened regression of the goal below: wrapped in user helper calls,
// a top-level server fn never ships its handler to the client, whatever
// factories the module imports.
test.each<PlacementHead>(['createServerFn alone', 'another Start factory'])(
  'with %s imported, a server fn wrapped in two calls does not ship its handler to the client',
  async (importHead) => {
    await expectNoClientHandler(
      await host(),
      placementModule(importHead, wrappedTwice),
      { rejection: 'unpositioned', read: 'module.fn' },
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
// Source: declaration-sites "wrapped in two calls".
test.each<PlacementHead>(['createServerFn alone', 'another Start factory'])(
  'with %s imported, a server fn wrapped in two calls works like an unwrapped one',
  async (importHead) => {
    const served = await serveCase(await host(), {
      'module.tsx': placementModule(importHead, wrappedTwice),
      ...dbFiles,
    })
    expectNotLoaded(await served.loads(), ['./db.server'])
    expect(served.code.client).not.toContain('MARK_INNER_HANDLER')
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('inner')
  },
)

// SPEC J4.6: a server fn nested in a function is hoisted only when its
// whole chain captures nothing of the enclosing function. A capture (by the
// handler, the options, the middleware or the validator) is a positioned
// compile error naming the binding, in every environment: never a silent
// leak or a handler running with another closure.
describe('a nested server fn capturing a binding of its function', () => {
  const captures = [
    {
      name: 'a parameter in the handler',
      code: `export function make(id: string) {
  const fn = createServerFn().handler(async () => db.inner(id))
  return fn
}`,
      at: 'id))',
    },
    {
      name: 'a local const in the handler',
      code: `export function make() {
  const scope = 'a'
  const fn = createServerFn().handler(async () => db.inner(scope))
  return fn
}`,
      at: 'scope))',
    },
    {
      name: 'a hook result in the handler',
      code: `export function Comp() {
  const [count] = useState(1)
  const fn = createServerFn().handler(async () => db.inner(String(count)))
  return fn
}`,
      at: 'count)))',
    },
    {
      name: 'a parameter in the options',
      code: `export function make(method: 'GET' | 'POST') {
  const fn = createServerFn({ method }).handler(async () => db.inner('a'))
  return fn
}`,
      at: 'method }',
    },
  ]

  test.each(captures)(
    'is a compile error at the capture in every environment: $name',
    async ({ code, at }) => {
      const source = `${head}import { useState } from 'react'\nimport { db } from './db.server'\n${code}`
      const startCase = await (
        await host()
      ).case({ 'module.tsx': source, ...dbFiles })
      for (const environment of ['client', 'ssr'] as const) {
        const failure = await compileError(startCase, environment)
        expect(failure, `${environment} serves the module`).toBeDefined()
        expectCompileError(failure, { source, at, column: true })
      }
    },
  )

  test('is hoisted, and runs on the server, when it captures nothing', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `${head}import { db } from './db.server'
export function make() {
  const fn = createServerFn().handler(async () => db.inner())
  return fn
}`,
      ...dbFiles,
    })
    expectNotLoaded(await served.loads(), ['./db.server'])
    expect(await callServerFnThroughCallers(served, 'module.make()')).toBe(
      'inner',
    )
  })
})

// Malformed-input diagnostic control (SPEC §8, G5): `.validator()` without
// a validator is a type error (tsc against the real declarations: TS2554
// "Expected 1 arguments, but got 0"). It only has to fail; a position is
// not required of input the types reject.
test('rejects a validator call without a validator', async () => {
  const source = `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
export const fn = createServerFn().validator().handler(async () => 1)`
  const startCase = await (await host()).case({ 'module.tsx': source })
  for (const environment of ['client', 'ssr'] as const) {
    expectCompileError(await compileError(startCase, environment), {
      source,
      at: undefined,
    })
  }
})

// Goal (SPEC J4.6): a server fn nested in a function is supported
// like a top-level one when its handler reads no local of the function: the
// client gets an RPC, and the server runs its handler under the id the
// client uses. (One whose handler reads a local may also be rejected:
// pinned in known-bugs-start-compiler.test.ts.) Today these are left
// untransformed, rejected or extracted into an invalid server module (pins
// in known-bugs-start-compiler.test.ts).
describe.each<PlacementHead>(['createServerFn alone', 'another Start factory'])(
  'with %s imported',
  (importHead) => {
    test.each(
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

// Goal (SPEC J4.6): a server fn created in the handler of another
// one is supported. The client gets an RPC of the outer server fn, its
// handler runs on the server under the id the client uses and calls the
// inner one there; how the inner one is compiled is left open. Today it is
// left untransformed or extracted into an invalid server module (pins in
// known-bugs-start-compiler.test.ts).
// Source: SolidStart compile.spec.ts "keeps client and server ids aligned
// around nested server functions"; #8504 declaration-sites.test.ts
test.each<PlacementHead>(['createServerFn alone', 'another Start factory'])(
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
    expect(served.code.client, 'client').not.toContain('MARK_INNER_HANDLER')
    // The outer handler returns what the inner server fn returns.
    expect(await callServerFnThroughCallers(served, placement.read!)).toBe(
      'inner',
    )
  },
)

// Goal (SPEC J4.6): two functions of a module each declare a
// server fn under the same local name; each runs its own handler.
// Today they are left untransformed, rejected or extracted into an invalid
// server module (pins in known-bugs-start-compiler.test.ts, placement "a
// function body").
test.each<PlacementHead>(['createServerFn alone', 'another Start factory'])(
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
test('a server fn created through an optional call chain compiles like a plain chain or is rejected', async () => {
  const code = `${head}import { db } from './db.server'
export const fn = createServerFn()?.handler(async () => db.inner() ?? 'MARK_INNER_HANDLER')`
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
    })
    return
  }
  const served = await serveCase(await host(), {
    'module.tsx': code,
    ...dbFiles,
  })
  expectNotLoaded(await served.loads(), ['./db.server'])
  expect(served.code.client).not.toContain('MARK_INNER_HANDLER')
  expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('inner')
})

// Moved: "a .ts module in a directory whose name contains # compiles as
// TypeScript" is in integration/start-compiler-build-ids.test.ts: Vite's dev
// server serves no module under a `#` directory (a plain Vite app fails the
// same way), so a production build is where the input is reachable.

// SPEC J4.6: a server fn nested in a function whose chain needs what only
// the enclosing function's call provides (its `this`, `arguments`,
// `new.target`, an `await` of it), whose options run code with effects,
// that reads a module binding other code reassigns, or that sits in a
// top-level block above a declaration its chain reads, either keeps its
// semantics (the client gets an RPC, server code and the client get the
// enclosing call's result) or is a compile error at that code, in every
// environment. Never a handler that ships to the client or runs with
// other values.
describe('a nested server fn whose chain cannot move out of its function', () => {
  const cases = [
    {
      name: '`this` of the function',
      code: `export function make(this: { label: string }) {
  const fn = createServerFn().handler(async () => this.label)
  return fn
}`,
      at: 'this.label',
      read: "module.make.call({ label: 'this' })",
      result: 'this',
    },
    {
      name: '`arguments` of the function',
      code: `export function make(..._labels: Array<string>) {
  const fn = createServerFn().handler(async () => arguments.length)
  return fn
}`,
      at: 'arguments.length',
      read: "module.make('a', 'b')",
      result: 2,
    },
    {
      name: '`new.target` of the function',
      code: `export function make() {
  const fn = createServerFn().handler(async () => new.target === undefined)
  return fn
}`,
      at: 'new.target',
      read: 'module.make()',
      result: true,
    },
    {
      name: 'an `await` of the function in its options',
      code: `const pick = async () => 'GET' as const
export async function make() {
  const fn = createServerFn({ method: await pick() }).handler(async () => 'awaited')
  return fn
}`,
      at: 'await pick()',
      read: 'await module.make()',
      result: 'awaited',
    },
    {
      name: 'options calling a function with effects',
      code: `export let picked = 0
const pick = () => {
  picked++
  return 'GET' as const
}
export function make() {
  const fn = createServerFn({ method: pick() }).handler(async () => 'effect')
  return fn
}`,
      at: '{ method: pick() }',
      read: 'module.make()',
      result: 'effect',
    },
    {
      name: 'options reading a module binding other code reassigns',
      code: `let method: 'GET' | 'POST' = 'GET'
export const usePost = () => {
  method = 'POST'
}
export function make() {
  const fn = createServerFn({ method }).handler(async () => 'reassigned')
  return fn
}`,
      at: 'method }',
      read: 'module.make()',
      result: 'reassigned',
    },
    {
      name: 'a top-level block above a declaration its chain reads',
      code: `export const registry: Array<unknown> = []
{
  const inner = createServerFn()
    .validator(check)
    .handler(async ({ data }) => \`checked \${data}\`)
  registry.push(inner)
}
function check(value: unknown) {
  return String(value)
}`,
      at: 'createServerFn()\n',
      read: 'module.registry[0]',
      result: 'checked undefined',
    },
  ]

  test.each(cases)(
    'works or is a compile error at it in every environment: $name',
    async ({ code, at, read, result }) => {
      const source = `${head}${code}`
      const startCase = await (await host()).case({ 'module.tsx': source })
      const failures = {
        client: await compileError(startCase, 'client'),
        ssr: await compileError(startCase, 'ssr'),
      }
      for (const failure of Object.values(failures)) {
        if (failure !== undefined) {
          expectCompileError(failure, { source, at, column: true })
        }
      }
      if (failures.client === undefined && failures.ssr === undefined) {
        const served = await serveCase(await host(), { 'module.tsx': source })
        expect(await callServerFnThroughCallers(served, read)).toEqual(result)
      }
    },
  )
})

// SPEC J4.6, G1: server fns at many declaration sites of one module (in
// arrow functions, object methods and properties, function expressions,
// class methods, default exports, two blocks of one function, two objects
// with the same key) each get their own id: every call, from the client
// (an RPC) and from server code, runs its own handler, and no handler
// reaches the client.
test('server fns at many declaration sites of one module each run their own handler', async () => {
  const sites = {
    arrow: `export const arrow = () => {
  const fn = createServerFn().handler(async () => 'SITE_arrow')
  return fn
}`,
    method: `export const object = {
  method() {
    const fn = createServerFn().handler(async () => 'SITE_method')
    return fn
  },
  property: () => {
    const fn = createServerFn().handler(async () => 'SITE_property')
    return fn
  },
}`,
    named: `export const callbacks = [
  function named() {
    const fn = createServerFn().handler(async () => 'SITE_named')
    return fn
  },
]`,
    static: `export class Api {
  static make() {
    const fn = createServerFn().handler(async () => 'SITE_static')
    return fn
  }
}`,
    default: `export default function () {
  const fn = createServerFn().handler(async () => 'SITE_default')
  return fn
}`,
    blocks: `export function both() {
  const made: Array<unknown> = []
  {
    const fn = createServerFn().handler(async () => 'SITE_first')
    made.push(fn)
  }
  {
    const fn = createServerFn().handler(async () => 'SITE_second')
    made.push(fn)
  }
  return made
}`,
    keys: `export const a = { get: createServerFn().handler(async () => 'SITE_a') }
export const b = { get: createServerFn().handler(async () => 'SITE_b') }
export const quoted = { 'get-it': createServerFn().handler(async () => 'SITE_quoted') }`,
  }
  const reads = {
    'module.arrow()': 'SITE_arrow',
    'module.object.method()': 'SITE_method',
    'module.object.property()': 'SITE_property',
    'module.callbacks[0]()': 'SITE_named',
    'module.Api.make()': 'SITE_static',
    'module.default()': 'SITE_default',
    'module.both()[0]': 'SITE_first',
    'module.both()[1]': 'SITE_second',
    'module.a.get': 'SITE_a',
    'module.b.get': 'SITE_b',
    "module.quoted['get-it']": 'SITE_quoted',
  }
  const served = await serveCase(await host(), {
    'module.tsx': `${head}${Object.values(sites).join('\n')}\n`,
  })
  expect(served.code.client).not.toContain('SITE_')
  const results: Record<string, unknown> = {}
  for (const read of Object.keys(reads)) {
    results[read] = await callServerFnThroughCallers(served, read)
  }
  expect(results).toEqual(reads)
})
