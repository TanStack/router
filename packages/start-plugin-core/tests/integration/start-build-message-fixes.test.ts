/**
 * Refusals of the Start compiler and the fixes their messages give (SPEC
 * §5.7, G5: the user's file and position; no wording is required), in
 * production builds of Vite and Rsbuild: a nested server fn the compiler
 * cannot hoist (built on a local builder; an option with a call; a local
 * it reads) and a builder the compiler cannot follow (assigned after its
 * declaration; kept in an object; a middleware kept in an object that gets
 * its server code later). Each fix builds, the client calls the
 * server fn by the id it was given, and the server answers with its
 * handler, which is nowhere in the client.
 */
import { describe, expect, test } from 'vitest'
import {
  diagnosticPosition,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  StartBuildError,
  buildStart,
  callByIdExports,
  callByIdPrelude,
} from '../build-harness'

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
const refused = [
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
    name: 'a nested server fn whose validator is a call',
    module: `${head}export function make() {
  return createServerFn({ method: 'POST' }).validator(makeSchema()).handler(async ({ data }) => 'MARK_SECRET' + data)
}
`,
    at: 'makeSchema()).handler',
  },
  {
    name: 'a nested server fn whose middleware list makes a middleware',
    module: `${head}export function make() {
  return createServerFn().middleware([auth('admin')]).handler(async () => 'MARK_SECRET')
}
`,
    at: "[auth('admin')]",
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
    name: 'the builder at the module top level',
    module: `${head}const base = createServerFn()
export function make() {
  return base.handler(async () => 'MARK_FIX_TOP')
}
`,
    mark: 'MARK_FIX_TOP',
  },
  {
    name: 'one chain',
    module: `${head}export function make() {
  return createServerFn().handler(async () => 'MARK_FIX_CHAIN')
}
`,
    mark: 'MARK_FIX_CHAIN',
  },
  {
    name: 'the validator call in a module-level const',
    module: `${head}const schema = makeSchema()
export function make() {
  return createServerFn({ method: 'POST' }).validator(schema).handler(async ({ data }) => 'MARK_FIX_SCHEMA:' + data)
}
`,
    mark: 'MARK_FIX_SCHEMA:x',
    data: 'x',
  },
  {
    name: 'the middleware in a module-level const',
    module: `${head}const adminAuth = auth('admin')
export function make() {
  return createServerFn().middleware([adminAuth]).handler(async () => 'MARK_FIX_MW')
}
`,
    mark: 'MARK_FIX_MW',
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
})
