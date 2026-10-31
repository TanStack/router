/**
 * Builder shapes in a real client build, on each bundler (SPEC J4.5, J4.12,
 * G5): a shape either compiles, with its server code out of the client, or
 * fails the build at the use.
 */
import { describe, expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { StartBuildError, buildStart, startBundlers } from '../build-harness'

const timeout = 60_000

/** A module holding an open builder, and a server fn finished on it. */
const fooModule = `import { createMiddleware, createServerFn } from '@tanstack/react-start'
const auth = createMiddleware({ type: 'function' }).server(async ({ next }) => next())
export const authed = createServerFn().middleware([auth])
`

interface Compiled {
  name: string
  files: Record<string, string>
}

interface Refused extends Compiled {
  /** Where the build fails. */
  file: string
  line: number
}

const compiled: Array<Compiled> = [
  {
    name: '`export * as` of a project module',
    files: {
      'src/foo.ts': fooModule,
      'src/middle.ts': `export * as middle from './foo'\n`,
      'src/entry.ts': `import { middle } from './middle'
export const fn = middle.authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a namespace re-exported by name',
    files: {
      'src/foo.ts': fooModule,
      'src/middle.ts': `import * as middle from './foo'\nexport { middle }\n`,
      'src/entry.ts': `import { middle } from './middle'
export const fn = middle.authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a namespace as a default export',
    files: {
      'src/foo.ts': fooModule,
      'src/middle.ts': `import * as middle from './foo'\nexport default middle\n`,
      'src/entry.ts': `import middle from './middle'
export const fn = middle.authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a re-exported namespace destructured',
    files: {
      'src/foo.ts': fooModule,
      'src/middle.ts': `export * as inner from './foo'\n`,
      'src/entry.ts': `import { inner } from './middle'
const { authed } = inner
export const fn = authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a namespace read through a cast',
    files: {
      'src/foo.ts': fooModule,
      'src/entry.ts': `import * as foo from './foo'
export const fn = (foo as any).authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
]

compiled.push(
  ...[
    ['a type', `export type base = string`],
    ['an interface', `export interface base {\n  a: string\n}`],
    ['a type-only namespace', `export namespace base {\n  export type E = string\n}`],
    ['a `declare var`', `export declare var base: any`],
  ].map(([what, before]) => ({
    name: `${what} of the same name before a builder`,
    files: {
      'src/b.ts': `import { createServerFn } from '@tanstack/react-start'
${before}
export const base = createServerFn().middleware([])
`,
      'src/entry.ts': `import { base } from './b'
export const fn = base.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  })),
  {
    name: 'a type-only namespace after a builder of the same name',
    files: {
      'src/b.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn().middleware([])
export namespace base {
  export type E = string
}
`,
      'src/entry.ts': `import { base } from './b'
export const fn = base.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a type of the same name before an isomorphic builder',
    files: {
      'src/entry.ts': `import { createIsomorphicFn } from '@tanstack/react-start'
type iso = string
const iso = createIsomorphicFn()
export const f = iso.server(() => 'MARK_SERVER_SECRET').client(() => 'client')
export type { iso }
`,
    },
  },
  {
    name: '`var` declared twice, the builder in the second',
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
var base: any
var base: any = createServerFn()
export const fn = base.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'an overloaded factory',
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
function make(a: 'x'): any
function make(a: string): any
function make(a: string) {
  return createServerFn()
}
export const fn = make('x').handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a type-only namespace merged with a factory',
    files: {
      'src/b.ts': `import { createServerFn } from '@tanstack/react-start'
export namespace make {
  export type E = string
}
export function make() {
  return createServerFn()
}
`,
      'src/entry.ts': `import { make } from './b'
export const fn = make().handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
)

const refused: Array<Refused> = [
  {
    name: '`var` redeclared with a builder after another value',
    file: 'src/entry.ts',
    line: 3,
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
var base: any = 1
var base: any = createServerFn()
export const fn = base.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a namespace behind a ternary in an object',
    file: 'src/middle.ts',
    line: 3,
    files: {
      'src/foo.ts': fooModule,
      'src/middle.ts': `import * as middle from './foo'
const flag = Math.random() > 2
export const bar = { middle: flag ? {} : middle }
`,
      'src/entry.ts': `import { bar } from './middle'
export const fn = (bar.middle as any).authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a namespace in an object, in the same module',
    file: 'src/entry.ts',
    line: 2,
    files: {
      'src/foo.ts': fooModule,
      'src/entry.ts': `import * as middle from './foo'
const bar = { middle }
export const fn = bar.middle.authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a function returning a namespace',
    file: 'src/middle.ts',
    line: 2,
    files: {
      'src/foo.ts': fooModule,
      'src/middle.ts': `import * as middle from './foo'
export const get = () => middle
`,
      'src/entry.ts': `import { get } from './middle'
export const fn = get().authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a namespace spread into an object',
    file: 'src/middle.ts',
    line: 2,
    files: {
      'src/foo.ts': fooModule,
      'src/middle.ts': `import * as middle from './foo'
export const bar = { ...middle }
`,
      'src/entry.ts': `import { bar } from './middle'
export const fn = bar.authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a namespace destructured with a rest element',
    file: 'src/entry.ts',
    line: 2,
    files: {
      'src/foo.ts': fooModule,
      'src/entry.ts': `import * as foo from './foo'
const { ...rest } = foo
export const fn = rest.authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a namespace destructured with a default',
    file: 'src/entry.ts',
    line: 2,
    files: {
      'src/foo.ts': fooModule,
      'src/entry.ts': `import * as foo from './foo'
const { authed = null as any } = foo
export const fn = authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a re-exported namespace passed to a function',
    file: 'src/entry.ts',
    line: 3,
    files: {
      'src/foo.ts': fooModule,
      'src/middle.ts': `export * as inner from './foo'\n`,
      'src/entry.ts': `import { inner } from './middle'
const pass = (x: any) => x
export const fn = pass(inner).authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a namespace read through another namespace',
    file: 'src/entry.ts',
    line: 2,
    files: {
      'src/foo.ts': fooModule,
      'src/middle.ts': `export * as inner from './foo'\n`,
      'src/entry.ts': `import * as m from './middle'
export const fn = m.inner.authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a namespace of a module whose builder comes through `export *`',
    file: 'src/entry.ts',
    line: 2,
    files: {
      'src/foo.ts': fooModule,
      'src/barrel.ts': `export * from './foo'\n`,
      'src/entry.ts': `import * as barrel from './barrel'
const bar = [barrel]
export const fn = bar[0]!.authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
]

refused.push(
  {
    name: 'a builder through an identity helper',
    file: 'src/entry.ts',
    line: 3,
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
const id = <T,>(x: T) => x
export const fn = id(createServerFn()).handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a builder through an identity helper that also stores it',
    file: 'src/entry.ts',
    line: 7,
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
const reg: any = {}
const register = <T,>(b: T): T => {
  reg.base = b
  return b
}
register(createServerFn())
export const fn = reg.base.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
)

refused.push(
  {
    name: 'a parameter passed to `.validator()`',
    file: 'src/entry.ts',
    line: 2,
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
const withInput = (schema: any) => createServerFn().validator(schema)
export const fn = withInput((d: unknown) => {
  console.log('MARK_SERVER_SECRET')
  return d
}).handler(async () => 'x')
`,
    },
  },
  {
    name: 'a parameter passed to `.inputValidator()`',
    file: 'src/entry.ts',
    line: 2,
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
const withInput = (schema: any) => (createServerFn() as any).inputValidator(schema)
export const fn = withInput((d: unknown) => {
  console.log('MARK_SERVER_SECRET')
  return d
}).handler(async () => 'x')
`,
    },
  },
  {
    name: 'a parameter passed to a middleware’s `.validator()`',
    file: 'src/entry.ts',
    line: 2,
    files: {
      'src/entry.ts': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
const withInput = (schema: any) => createMiddleware({ type: 'function' }).validator(schema)
const m = withInput((d: unknown) => {
  console.log('MARK_SERVER_SECRET')
  return d
})
export const fn = createServerFn().middleware([m]).handler(async () => 'x')
`,
    },
  },
)

compiled.push(
  {
    name: 'a method called on a server fn where it is created',
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'MARK_SERVER_SECRET').bind(null)
export const called = createServerFn().handler(async () => 'MARK_SERVER_SECRET').call
`,
    },
  },
)

describe.each(startBundlers)('%s build', (bundler) => {
  test.each(compiled)(
    '$name compiles',
    async ({ files }) => {
      const build = await buildStart({ bundler, files, entry: 'src/entry.ts' })
      expect(build.client.where('MARK_SERVER_SECRET')).toBe('nowhere')
    },
    timeout,
  )

  test.each(refused)(
    '$name fails the build at the use',
    async ({ files, file, line }) => {
      const error: unknown = await buildStart({
        bundler,
        files,
        entry: 'src/entry.ts',
      }).then(
        (build) =>
          expect.fail(
            `the build succeeded; the handler's text is ${build.client.where('MARK_SERVER_SECRET')} in the client bundle`,
          ),
        (e: unknown) => e,
      )
      if (!(error instanceof StartBuildError)) {
        throw error
      }
      expectDiagnostic(error.diagnostics, {
        severity: 'error',
        file,
        root: error.root,
        position: { line },
      })
    },
    timeout,
  )
})
