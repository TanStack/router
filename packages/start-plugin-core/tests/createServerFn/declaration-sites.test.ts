import { describe, expect, test } from 'vitest'
import {
  callProvider,
  callServerFnThroughCallers,
  compileAll,
  compileFor,
  evaluateModule,
  expectNoClientHandler,
  outputs,
} from '../regression-helpers'
import { placementModule, placements } from './placements'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
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

// A `createServerFn` declared below the module top level must not produce an
// invalid module (the statement-list crash), and top-level server fns next
// to it are still extracted. Rejecting it with a compile error is valid too.
// Which nested server fns are extracted is left open here: the handler
// leaking to the client is pinned in known-bugs-start-compiler.test.ts, and
// supporting them is a goal pin below.
test.each([
  { name: 'a function', code: inFunction, hasTop: false },
  {
    name: 'a switch case inside a function',
    code: inSwitchCase,
    hasTop: false,
  },
  {
    name: 'a function next to a top-level one',
    code: `${top}${inFunction}`,
    hasTop: true,
  },
  {
    name: 'a switch case next to a top-level one',
    code: `${top}${inSwitchCase}`,
    hasTop: true,
  },
])(
  'a server fn declared in $name compiles to valid modules or is rejected',
  async ({ code, hasTop }) => {
    const source = `${head}${code}`
    const compiled: Partial<Record<(typeof outputs)[number], string>> = {}
    for (const output of outputs) {
      let result: Awaited<ReturnType<typeof compileFor>>
      try {
        result = await compileFor(output, source)
      } catch (error) {
        expect((error as Error).message, output).not.toMatch(
          /Expected createServerFn declaration in a statement list/,
        )
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
  },
)

// A server fn initializes a top-level variable. Next to another Start
// factory, these other placements never ship the handler to the client:
// each output rejects the code with a clear error or keeps the handler in
// the provider only. With createServerFn alone, and for declarators nested
// below the top level, they are pinned in known-bugs-start-compiler.test.ts.
test.each(placements.filter((placement) => !placement.declarator))(
  'next to another Start factory, a server fn in $name does not ship its handler to the client',
  async ({ code }) => {
    await expectNoClientHandler(placementModule('another Start factory', code))
  },
)

// A user error, reported as such.
test('rejects a validator call without a validator', async () => {
  for (const output of outputs) {
    await expect(
      compileFor(
        output,
        `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
export const fn = createServerFn().validator().handler(async () => 1)`,
      ),
      output,
    ).rejects.toThrow(
      'createServerFn().validator() must be called with a validator!',
    )
  }
})

// Goal (N13, user ruling D13): a server fn is supported wherever it is
// created, like a top-level one: the callers get an RPC, and the provider
// runs its handler under the id the callers use. A nested server fn whose
// handler reads no local of its function can run on its own in the provider
// (one whose handler reads a local must be rejected: pinned in
// known-bugs-start-compiler.test.ts). Today these are left untransformed,
// rejected or extracted into an invalid provider (pins in
// known-bugs-start-compiler.test.ts).
describe.each<PlacementHead>(['createServerFn alone', 'another Start factory'])(
  'with %s imported',
  (importHead) => {
    test.fails.each(placements.filter((placement) => placement.read))(
      'supports a server fn in $name',
      async ({ code, read }) => {
        const source = placementModule(importHead, code)
        const compiled = {} as Awaited<ReturnType<typeof compileAll>>
        let serverFns: Record<string, ServerFn> = {}
        for (const output of outputs) {
          const result = await compileFor(output, source)
          compiled[output] = result.code ?? source
          if (output === 'client') {
            serverFns = result.serverFns
          }
        }
        compiled.serverFns = serverFns
        expect(
          await callServerFnThroughCallers(compiled, read!, {
            './db.server': { db: { inner: () => 'inner', top: () => 'top' } },
          }),
        ).toBe('inner')
      },
    )
  },
)

// Goal (N13, user ruling D13): a server fn created in the handler of another
// one is supported. Callers get an RPC of the outer server fn, its handler
// runs in the provider under the id the callers use and creates the inner
// one there; how the inner one is compiled is left open. Today it is left
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
    const source = placementModule(importHead, placement.code)
    const compiled = {} as Awaited<ReturnType<typeof compileAll>>
    let serverFns: Record<string, ServerFn> = {}
    for (const output of outputs) {
      const result = await compileFor(output, source)
      compiled[output] = result.code ?? source
      expect(await getModuleErrors(compiled[output]), output).toEqual([])
      if (output !== 'provider') {
        serverFns = { ...serverFns, ...result.serverFns }
      }
    }
    compiled.serverFns = serverFns
    expect(compiled.client, 'client').not.toContain('db.inner()')
    expect(
      typeof (await callServerFnThroughCallers(
        compiled,
        (module) => module.outer,
        { './db.server': { db: { inner: () => 'inner', top: () => 'top' } } },
      )),
    ).toBe('string')
  },
)

// Sources: TanStack/router#5496 and #5892, where `.handler<T>(...)` was not
// recognized as a server fn and its body reached the client.
test.each([
  { name: 'a type argument', handler: `.handler<number>(() => 1)` },
  {
    name: 'a Promise type argument',
    handler: `.handler<Promise<{ secret: number }>>(async () => ({ secret: 1 }))`,
  },
])('extracts a server fn whose handler has $name', async ({ handler }) => {
  const compiled = await compileAll(
    `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn({ method: 'GET' })${handler}`,
  )
  expect(Object.keys(compiled.serverFns)).toHaveLength(1)
  expect(compiled.client).not.toMatch(/=>\s*(1|\(\{ secret: 1 \}\))/)
  expect(await callProvider(compiled, 'fn')).toEqual(
    handler.includes('secret') ? { secret: 1 } : 1,
  )
})

// Bug: `.handler()` called through an optional chain
// (`createServerFn()?.handler(...)`) is not recognised: the module is left
// untransformed.
// Impact: the handler and its imports ship to the client, which calls it
// in the browser instead of through an RPC.
// Source: #8504 declaration-sites.test.ts (red on main)
test.fails(
  'a server fn created through an optional call chain compiles like a plain chain',
  async () => {
    const compiled = await compileAll(
      `${head}export const fn = createServerFn()?.handler(async () => 'from the server')`,
    )
    expect(compiled.client).not.toContain('from the server')
    expect((await evaluateModule(compiled.client)).fn).toEqual({
      rpc: { client: Object.keys(compiled.serverFns)[0] },
    })
    expect(await callProvider(compiled, 'fn')).toBe('from the server')
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
