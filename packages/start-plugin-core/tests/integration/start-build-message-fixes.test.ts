/**
 * Refusals of the Start compiler and the fixes their messages give (SPEC
 * §5.7, G5: the user's file and position; no wording is required), in
 * production builds of Vite and Rsbuild: a server fn created in a function
 * (R162: built on a local builder; anything else) and a builder the
 * compiler cannot follow (assigned after its
 * declaration; kept in an object; a middleware kept in an object that gets
 * its server code later). Each fix builds, the client calls the
 * server fn by the id it was given, and the server answers with its
 * handler, which is nowhere in the client. The fixes of the refusals of a
 * value passed where the compiler cannot follow it (an isomorphic fn
 * given its `.server()`, a start instance's `.createMiddleware()` called
 * directly, a builder's option read by name) build too, and run.
 */
import { describe, expect, test } from 'vitest'
import {
  diagnosticPosition,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  StartBuildError,
  callByIdExports,
  callByIdPrelude,
} from '../build-harness'
import { buildStart } from '../build-start'

const timeout = 90_000

const head = `import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { makeSchema } from './schema'
const auth = (role: string) =>
  createMiddleware({ type: 'function' }).server(({ next }) => {
    if (role !== 'admin') {
      throw new Error('denied')
    }
    return next()
  })
`

const schemaModule = `export const makeSchema = () => (data: string) => data\n`

/** Refused modules, with the text the refusal points at. */
const refused: Array<{
  name: string
  module: string
  at: string
}> = [
  {
    name: 'a nested server fn built on a local builder',
    module: `${head}export function make() {
  const base = createServerFn()
  return base.handler(async () => 'MARK_SECRET')
}
`,
    at: 'base.handler',
  },
  {
    name: 'a server fn created in a function',
    module: `${head}export function make() {
  return createServerFn().handler(async () => 'MARK_SECRET')
}
`,
    at: 'createServerFn().handler',
  },
  {
    name: 'a nested server fn reading a local',
    module: `${head}export function make(table: string) {
  return createServerFn().handler(async () => 'MARK_SECRET' + table)
}
`,
    at: 'table)\n}',
  },
  {
    name: 'a nested server fn using this',
    module: `${head}export class Svc {
  n = 1
  get() {
    return createServerFn().handler(async () => 'MARK_SECRET' + this.n)
  }
}
`,
    at: 'this.n',
  },
  {
    name: 'a nested server fn using await',
    module: `${head}export async function make() {
  return createServerFn({ method: 'POST' })
    .validator(await Promise.resolve((d: string) => d))
    .handler(async () => 'MARK_SECRET')
}
`,
    at: 'await Promise',
  },
  {
    name: 'a builder assigned after its declaration',
    module: `${head}let base
base = createServerFn()
export const make = () => base.handler(async () => 'MARK_SECRET')
`,
    at: 'createServerFn()\n',
  },
  // (the assignment's target in a cast or with `!`: the message names it,
  // and its fix is the same, the builder declared with its value)
  {
    name: 'a builder assigned after its declaration to a cast of the variable',
    module: `${head}let base: any
(base as any) = createServerFn()
export const make = () => base.handler(async () => 'MARK_SECRET')
`,
    at: 'createServerFn()\n',
  },
  {
    name: 'a builder assigned after its declaration to the variable with `!`',
    module: `${head}let base: any
base! = createServerFn()
export const make = () => base.handler(async () => 'MARK_SECRET')
`,
    at: 'createServerFn()\n',
  },
  {
    name: 'a builder kept in an object',
    module: `${head}export const builders = { authed: createServerFn().middleware([auth('admin')]) }
export const make = () => builders.authed.handler(async () => 'MARK_SECRET')
`,
    at: "createServerFn().middleware([auth('admin')]) }",
  },
  {
    name: 'a middleware kept in an object, its server code attached later',
    module: `${head}const mws = { open: createMiddleware({ type: 'function' }) }
const marked = mws.open.server(({ next }) => next({ context: { mark: 'MARK_SECRET' } }))
const fn = createServerFn().middleware([marked]).handler(async ({ context }) => context.mark)
export const make = () => fn
`,
    at: "createMiddleware({ type: 'function' }) }",
  },
]

/** The fixes the messages give: `make()` returns a server fn, called with `data`. */
const fixes = [
  {
    name: 'the server fn and its builder at the module top level',
    module: `${head}const base = createServerFn()
const fn = base.handler(async () => 'MARK_FIX_TOP')
export function make() {
  return fn
}
`,
    mark: 'MARK_FIX_TOP',
  },
  {
    name: 'one chain at the module top level',
    module: `${head}export const fn = createServerFn().handler(async () => 'MARK_FIX_CHAIN')
export function make() {
  return fn
}
`,
    mark: 'MARK_FIX_CHAIN',
  },
  {
    name: 'a local passed in the input',
    module: `${head}const getter = createServerFn({ method: 'POST' }).validator((table: string) => table).handler(async ({ data }) => 'MARK_FIX_INPUT:' + data)
export function make() {
  return getter
}
`,
    mark: 'MARK_FIX_INPUT:t',
    data: 't',
  },
  {
    name: 'the builder declared with its value',
    module: `${head}const base = createServerFn()
export const make = () => fn
const fn = base.handler(async () => 'MARK_FIX_CONST')
`,
    mark: 'MARK_FIX_CONST',
  },
  {
    name: 'the builder in its own exported const',
    module: `${head}export const authed = createServerFn().middleware([auth('admin')])
const fn = authed.handler(async () => 'MARK_FIX_PARTIAL')
export const make = () => fn
`,
    mark: 'MARK_FIX_PARTIAL',
  },
  {
    name: 'the middleware in its own const, its server code attached on it',
    module: `${head}const open = createMiddleware({ type: 'function' })
const marked = open.server(({ next }) => next({ context: { mark: 'MARK_FIX_MW_LATER' } }))
const fn = createServerFn().middleware([marked]).handler(async ({ context }) => context.mark)
export const make = () => fn
`,
    mark: 'MARK_FIX_MW_LATER',
  },
]

/** The fixes of values passed where the compiler cannot follow them (the refused shapes: start-compiler-builder-shapes.test.ts). */
const flowFixes = `import { createIsomorphicFn, createServerFn, createStart } from '@tanstack/react-start'
export const tick = createIsomorphicFn().client(() => 'MARK_TICK_CLIENT').server(() => undefined)
setTimeout(tick, 0)
const si = createStart(() => ({}))
const mw = si.createMiddleware().server(({ next }) => next({ context: { mark: 'MARK_SI_SECRET' } }))
const base = createServerFn({ method: 'POST' })
export const method = base.options.method
export const fn = base.middleware([mw]).handler(async ({ context }) => context.mark)
`

describe.each(['vite', 'rsbuild'] as const)('%s build', (bundler) => {
  test.each(refused)(
    '$name fails the build at its position',
    async ({ module, at }) => {
      const error = await buildStart({
        bundler,
        files: { 'src/schema.ts': schemaModule, 'src/fns.ts': module },
        entry: 'src/fns.ts',
      }).then(
        () => expect.fail('the build succeeded'),
        (e: unknown) => e,
      )
      if (!(error instanceof StartBuildError)) {
        throw error
      }
      const position = diagnosticPosition(module, at)
      expectDiagnostic(error.diagnostics, {
        severity: 'error',
        file: 'src/fns.ts',
        root: error.root,
        position,
      })
      // the column the user reads is 1-based (R101): the matcher above also
      // takes a 0-based one, which a bundler's own location field may print
      expect(error.diagnostics.map((d) => d.text).join('\n')).toContain(
        `src/fns.ts:${position.line}:${position.column}`,
      )
    },
    timeout,
  )

  test(
    'the fixes build, and each server fn answers with its handler',
    async () => {
      const build = await buildStart({
        bundler,
        files: {
          'src/schema.ts': schemaModule,
          ...Object.fromEntries(
            fixes.map((fix, i) => [`src/fix${i}.ts`, fix.module]),
          ),
          'src/entry.ts': fixes
            .map((_, i) => `export { make as make${i} } from './fix${i}'\n`)
            .join(''),
          'src/ssr-entry.ts': `export * from './entry'\n${callByIdExports}`,
        },
        entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      for (const [i, { mark, data }] of fixes.entries()) {
        expect(build.client.where(mark.split(':')[0]!), mark).toBe('nowhere')
        const url = (await build.client.run(`return entry.make${i}().url`))
          .result
        const { result } = await build.ssr.run(
          `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}), ${JSON.stringify(data ?? null)}, '${data === undefined ? 'GET' : 'POST'}')`,
        )
        expect(result, mark).toBe(mark)
      }
    },
    timeout,
  )

  test(
    'the fixes of a value the compiler cannot follow build, and each runs',
    async () => {
      const build = await buildStart({
        bundler,
        files: {
          'src/entry.ts': flowFixes,
          'src/ssr-entry.ts': `export * from './entry'\n${callByIdExports}`,
        },
        entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      expect(build.client.where('MARK_SI_SECRET')).toBe('nowhere')
      const { result } = await build.client.run(
        `return [entry.tick(), entry.method, entry.fn.url]`,
      )
      const [tick, method, url] = result as [string, string, string]
      expect([tick, method]).toEqual(['MARK_TICK_CLIENT', 'POST'])
      expect(
        (
          await build.ssr.run(
            `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}), null, 'POST')`,
          )
        ).result,
      ).toBe('MARK_SI_SECRET')
    },
    timeout,
  )
})
