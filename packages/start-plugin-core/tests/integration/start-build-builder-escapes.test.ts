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
