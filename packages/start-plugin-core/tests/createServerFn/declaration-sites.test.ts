/**
 * Where a `createServerFn` can be written (SPEC J4.6, R162):
 * top-level server fns work everywhere; any other position works or is
 * rejected with a clear error at the call, and never ships its handler to
 * the client (the positions themselves: load-positions.test.ts). Observed through the public Start
 * host: what each environment serves or rejects, what a page loads, and
 * calls of the server fns from the client (by id, through Start's server
 * entry) and from server code.
 */
import { beforeAll, describe, expect, test } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  callFromClient,
  callOnServer,
  callServerFnThroughCallers,
  compileError,
  createStartHost,
  expectCompileError,
  inPage,
  serveCase,
  serverFnUrls,
} from '../regression-helpers'
import { placementModule } from './placements'
import type { StartHost } from '../start-host'
import type { PlacementHead } from './placements'

let host: StartHost
beforeAll(async () => {
  host = await createStartHost()
  return () => host.close()
}, 60_000)

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
    const startCase = await host.case({ 'module.tsx': source })
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

/**
 * A top-level server fn wrapped in two calls of a user helper. Its handler
 * holds the marker `MARK_INNER_HANDLER` (a fallback it never returns).
 */
const wrappedTwice = `const wrap = <T,>(fn: T) => fn
export const fn = wrap(wrap(createServerFn().handler(async () => db.inner() ?? 'MARK_INNER_HANDLER')))`

// On main, the build fails for a module whose server fn the user can only write
// unwrapped.
// Source: declaration-sites "wrapped in two calls".
test.each<PlacementHead>(['createServerFn alone', 'another Start factory'])(
  'with %s imported, a server fn wrapped in two calls works like an unwrapped one',
  async (importHead) => {
    const served = await serveCase(host, {
      'module.tsx': placementModule(importHead, wrappedTwice),
      ...dbFiles,
    })
    expectNotLoaded(await served.loads(), ['./db.server'])
    expect(served.code.client).not.toContain('MARK_INNER_HANDLER')
    expect(served.code.client).not.toContain('db.inner()')
    expect(await callServerFnThroughCallers(served, 'module.fn')).toBe('inner')
  },
)

// SPEC J4.6: a server fn nested in a function is a compile error; when its
// chain reads a binding of the enclosing function (in the handler, the
// options, the middleware or the validator), the error is at the binding and
// names it, in every environment: never a silent leak or a handler running
// with another closure.
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
      const startCase = await host.case({ 'module.tsx': source, ...dbFiles })
      for (const environment of ['client', 'ssr'] as const) {
        const failure = await compileError(startCase, environment)
        expect(failure, `${environment} serves the module`).toBeDefined()
        expectCompileError(failure, { source, at, column: true })
      }
    },
  )
})

// Malformed-input diagnostic control (SPEC §8, G5): `.validator()` without
// a validator is a type error (tsc against the real declarations: TS2554
// "Expected 1 arguments, but got 0"). It only has to fail; a position is
// not required of input the types reject.
test('rejects a validator call without a validator', async () => {
  const source = `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
export const fn = createServerFn().validator().handler(async () => 1)`
  const startCase = await host.case({ 'module.tsx': source })
  for (const environment of ['client', 'ssr'] as const) {
    expectCompileError(await compileError(startCase, environment), {
      source,
      at: undefined,
    })
  }
})

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
  const served = await serveCase(host, {
    'module.tsx': `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn({ method: 'GET' })${handler}`,
  })
  expect(await serverFnUrls(served)).toHaveLength(1)
  expect(served.code.client).not.toContain('SERVER_SECRET')
  expect(await callFromClient(served, 'module.fn')).toEqual(
    handler.includes('secret:') ? { secret: 'SERVER_SECRET' } : 'SERVER_SECRET',
  )
})

// On main, the handler and its imports ship to the client, which calls it in
// the browser instead of through an RPC.
// Fix-agnostic: compiling it like a plain chain (an RPC on the client, the
// handler on the server) or rejecting it with a clear error at the call, naming
// createServerFn, both pass.
// Source: #8504 declaration-sites.test.ts (red on main)
test('a server fn created through an optional call chain compiles like a plain chain or is rejected', async () => {
  const code = `${head}import { db } from './db.server'
export const fn = createServerFn()?.handler(async () => db.inner() ?? 'MARK_INNER_HANDLER')`
  const startCase = await host.case({
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
  const served = await serveCase(host, {
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
// `new.target`, an `await` of it), or that sits in a top-level block above
// a declaration its chain reads, either keeps its semantics (the client
// gets an RPC, server code and the client get the enclosing call's result)
// or is a compile error at that code, in every environment. Never a handler
// that ships to the client or runs with other values.
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
      const startCase = await host.case({ 'module.tsx': source })
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
        const served = await serveCase(host, { 'module.tsx': source })
        expect(await callServerFnThroughCallers(served, read)).toEqual(result)
      } else if (failures.client === undefined) {
        // The server refuses the module, so no call reaches a handler: the
        // client still gives the page a server fn (an RPC), not the handler
        expect(
          await inPage(
            startCase,
            `const fn = ${read}\nreturn typeof fn === 'function' && typeof fn.url`,
          ),
        ).toBe('string')
      } else if (failures.ssr === undefined) {
        // The client refuses the module: server code still runs the handler
        expect(await callOnServer(startCase, read)).toEqual(result)
      }
    },
  )
})

// SPEC J4.6, G1: server fns at many declaration sites of one module (object
// properties, nested and quoted, an array, a class static field, a default
// export, two calls of one statement kind, two objects with the same key)
// each get their own id: every call, from the client (an RPC) and from
// server code, runs its own handler, and no handler reaches the client.
test('server fns at many declaration sites of one module each run their own handler', async () => {
  const sites = {
    object: `export const object = {
  method: createServerFn().handler(async () => 'SITE_method'),
  nested: { property: createServerFn().handler(async () => 'SITE_property') },
}`,
    array: `export const callbacks = [createServerFn().handler(async () => 'SITE_named')]`,
    static: `export class Api {
  static make = createServerFn().handler(async () => 'SITE_static')
}`,
    default: `export default createServerFn().handler(async () => 'SITE_default')`,
    calls: `export const made: Array<unknown> = []
made.push(createServerFn().handler(async () => 'SITE_first'))
made.push(createServerFn().handler(async () => 'SITE_second'))`,
    keys: `export const a = { get: createServerFn().handler(async () => 'SITE_a') }
export const b = { get: createServerFn().handler(async () => 'SITE_b') }
export const quoted = { 'get-it': createServerFn().handler(async () => 'SITE_quoted') }`,
  }
  const reads = {
    'module.object.method': 'SITE_method',
    'module.object.nested.property': 'SITE_property',
    'module.callbacks[0]': 'SITE_named',
    'module.Api.make': 'SITE_static',
    'module.default': 'SITE_default',
    'module.made[0]': 'SITE_first',
    'module.made[1]': 'SITE_second',
    'module.a.get': 'SITE_a',
    'module.b.get': 'SITE_b',
    "module.quoted['get-it']": 'SITE_quoted',
  }
  const served = await serveCase(host, {
    'module.tsx': `${head}${Object.values(sites).join('\n')}\n`,
  })
  expect(served.code.client).not.toContain('SITE_')
  const results: Record<string, unknown> = {}
  for (const read of Object.keys(reads)) {
    results[read] = await callServerFnThroughCallers(served, read)
  }
  expect(results).toEqual(reads)
})

// The second `x` of a module and a property named `'x#1'` are distinct
// server fns: each call runs its own handler, also where their dev ids are
// built from the module and a per-module key.
test("a property named 'x#1' beside two server fns named x: each runs its own handler", async () => {
  const served = await serveCase(host, {
    'module.tsx': `${head}export const one = { x: createServerFn().handler(async () => 'one.x') }
export const two = {
  x: createServerFn().handler(async () => 'two.x'),
  'x#1': createServerFn().handler(async () => "two['x#1']"),
}
`,
  })
  const reads = ['module.one.x', 'module.two.x', "module.two['x#1']"]
  const results: Record<string, unknown> = {}
  for (const read of reads) {
    results[read] = await callServerFnThroughCallers(served, read)
  }
  expect(results).toEqual({
    'module.one.x': 'one.x',
    'module.two.x': 'two.x',
    "module.two['x#1']": "two['x#1']",
  })
})
