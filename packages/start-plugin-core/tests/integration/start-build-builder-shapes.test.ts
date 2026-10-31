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

const refused: Array<Refused> = [
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
