/**
 * A Start builder the client compile cannot follow fails the client build
 * at the use, on each bundler (SPEC J4.5, J4.12, G5): server code attached
 * to it would otherwise ship. A use in code the client erases (a handler, a
 * server-only fn, a route's server handlers, a declaration only those read)
 * is no use: such an app builds, and no server code reaches the client.
 */
import { describe, expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { StartBuildError, buildStart, startBundlers } from '../build-harness'
import {
  pageEntries,
  rootDocument,
  routerFile,
  startPageEntries,
} from './start-compose-app'

const timeout = 60_000

/** Builds the app; the diagnostics of the failed build, or a test failure naming what the client holds. */
async function failedBuild(
  bundler: (typeof startBundlers)[number],
  files: Record<string, string>,
) {
  return buildStart({ bundler, files, entry: 'src/entry.ts' }).then(
    (build) =>
      expect.fail(
        `the build succeeded; the handler's text is ${build.client.where('MARK_SERVER_SECRET')} in the client bundle`,
      ),
    (error: unknown) => {
      if (!(error instanceof StartBuildError)) {
        throw error
      }
      return { diagnostics: error.diagnostics, root: error.root }
    },
  )
}

const builderModule = `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn({ method: 'POST' })
`

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    'a builder passed to unknown code fails the client build at the use',
    async () => {
      const outcome = await buildStart({
        bundler,
        files: {
          'src/wrap.ts': `export function wrap(builder: any) {
  return Object.assign(builder, {})
}
`,
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { wrap } from './wrap'
export const reveal = wrap(createServerFn()).handler(async () => 'MARK_SERVER_SECRET')
`,
          'src/entry.ts': `export { reveal } from './fns'\n`,
        },
        entry: 'src/entry.ts',
      }).then(
        (build) => ({
          built: true as const,
          secret: build.client.where('MARK_SERVER_SECRET'),
        }),
        (error: unknown) => {
          if (!(error instanceof StartBuildError)) {
            throw error
          }
          return {
            built: false as const,
            diagnostics: error.diagnostics,
            root: error.root,
          }
        },
      )
      if (outcome.built) {
        expect.fail(
          `the build succeeded; the handler's text is ${outcome.secret} in the client bundle`,
        )
      }
      expectDiagnostic(outcome.diagnostics, {
        severity: 'error',
        file: 'src/fns.ts',
        root: outcome.root,
        position: { line: 3 },
      })
    },
    timeout,
  )

  test.each<{
    name: string
    importer: string
    exporter: string
    files: Record<string, string>
  }>([
    {
      name: 'a module loading it with import()',
      importer: 'src/lazy.ts',
      exporter: 'src/b.ts',
      files: {
        'src/lazy.ts': `export const load = () =>
  import('./b').then((m) => m.base.handler(async () => 'MARK_SERVER_SECRET'))
`,
        'src/entry.ts': `export { load } from './lazy'\n`,
      },
    },
    {
      name: 'a module passing its namespace object to unknown code',
      importer: 'src/ns.ts',
      exporter: 'src/b.ts',
      files: {
        'src/wrap.ts': `export function attach(ns: any) {
  return ns.base.handler(async () => 'MARK_SERVER_SECRET')
}
`,
        'src/ns.ts': `import * as builders from './b'
import { attach } from './wrap'
export const fn = attach(builders)
`,
        'src/entry.ts': `export { fn } from './ns'\n`,
      },
    },
    {
      name: 'a module loading a barrel that re-exports it with import()',
      importer: 'src/lazy.ts',
      exporter: 'src/barrel.ts',
      files: {
        'src/barrel.ts': `export * from './b'\n`,
        'src/lazy.ts': `export const load = () =>
  import('./barrel').then((m) => m.base.handler(async () => 'MARK_SERVER_SECRET'))
`,
        'src/entry.ts': `export { load } from './lazy'\n`,
      },
    },
  ])(
    'a module exporting a builder, and $name: the client build fails naming both',
    async ({ importer, exporter, files }) => {
      const { diagnostics, root } = await failedBuild(bundler, {
        'src/b.ts': builderModule,
        ...files,
      })
      for (const file of [importer, exporter]) {
        expectDiagnostic(diagnostics, { severity: 'error', file, root })
      }
    },
    timeout,
  )

  test(
    'a parameter passed as server code fails the client build at that use',
    async () => {
      const { diagnostics, root } = await failedBuild(bundler, {
        'src/wrap.ts': `import { createServerOnlyFn } from '@tanstack/react-start'
export const serverOnly = (fn: () => string) => createServerOnlyFn(fn)
`,
        'src/entry.ts': `import { serverOnly } from './wrap'
export const read = serverOnly(() => 'MARK_SERVER_SECRET')
`,
      })
      expectDiagnostic(diagnostics, {
        severity: 'error',
        file: 'src/wrap.ts',
        root,
      })
    },
    timeout,
  )

  test(
    'a parameter only server code reads builds with one warning, and the server code does not ship',
    async () => {
      const build = await buildStart({
        bundler,
        files: {
          'src/guard.ts': `import { createMiddleware } from '@tanstack/react-start'
export const requireRole = (role: string) =>
  createMiddleware({ type: 'function' }).server(async ({ next }) => {
    if (role === 'MARK_SERVER_SECRET') {
      throw new Error('no')
    }
    return next()
  })
`,
          'src/entry.ts': `import { requireRole } from './guard'
console.log(requireRole('MARK_ARGUMENT'))
`,
        },
        entry: 'src/entry.ts',
      })
      expect({
        server: build.client.where('MARK_SERVER_SECRET'),
        // (Rsbuild also prints what the bundler reports)
        warnings: build.diagnostics.filter(
          (d) =>
            d.source === 'bundler' &&
            d.text.includes('`role` is read only by server-only code'),
        ).length,
      }).toEqual({ server: 'nowhere', warnings: 1 })
    },
    timeout,
  )

  test(
    'a module exporting a builder, imported statically by compiled modules, builds',
    async () => {
      const build = await buildStart({
        bundler,
        files: {
          'src/b.ts': builderModule,
          'src/barrel.ts': `export * from './b'\n`,
          'src/fns.ts': `import { base } from './barrel'
import * as builders from './b'
export const a = base.handler(async () => 'MARK_SERVER_SECRET')
export const b = builders.base.handler(async () => 'MARK_SERVER_SECRET_2')
`,
          'src/entry.ts': `export { a, b } from './fns'\n`,
        },
        entry: 'src/entry.ts',
      })
      expect({
        a: build.client.where('MARK_SERVER_SECRET'),
        b: build.client.where('MARK_SERVER_SECRET_2'),
      }).toEqual({ a: 'nowhere', b: 'nowhere' })
    },
    timeout,
  )

  test(
    'builders used only in code the client erases build, and no server code reaches the client',
    async () => {
      const head = `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { wrap } from '../wrap'
`
      const build = await buildStart({
        bundler,
        files: {
          ...startPageEntries,
          ...pageEntries,
          'src/router.ts': routerFile,
          'src/wrap.ts': `export function wrap(builder: any) {
  return Object.assign(builder, {})
}
`,
          'src/routes/__root.tsx': rootDocument(['/']),
          'src/routes/index.tsx': `${head}const registry = { builder: createServerFn() }
export const getMark = createServerFn().handler(async () =>
  wrap(createServerFn()) && registry.builder ? 'MARK_HANDLER' : '',
)
export const readMark = createServerOnlyFn(() =>
  wrap(createServerFn()) ? 'MARK_SERVER_ONLY' : '',
)
export const Route = createFileRoute('/')({
  server: {
    handlers: {
      POST: () => new Response(wrap(createServerFn()) && 'MARK_ROUTE_HANDLER'),
    },
  },
  component: () => <p>MARK_HOME</p>,
})
`,
        },
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      expect({
        handler: build.client.where('MARK_HANDLER'),
        serverOnly: build.client.where('MARK_SERVER_ONLY'),
        routeHandler: build.client.where('MARK_ROUTE_HANDLER'),
        page: build.client.where('MARK_HOME') === 'nowhere',
      }).toEqual({
        handler: 'nowhere',
        serverOnly: 'nowhere',
        routeHandler: 'nowhere',
        page: false,
      })
    },
    timeout,
  )
})
