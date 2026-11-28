// Slow-tier half of this suite: the builds. Its in-process tests are in
// ../start-compiler-reassigned-server-code.test.ts (fast tier).
/**
 * Server code passed by a name the module assigns elsewhere fails the
 * build at the argument, on each bundler (SPEC J4.5; decision of
 * 2026-11-24): the client output can keep the assignments with what they
 * read (R154). On main the build accepts it. Here a server-only fn
 * (`createServerOnlyFn(impl)`) and a route's server handler
 * (`server: { handlers: { GET: get } }`); the handler rows are in
 * start-build-server-fn-cases.test.ts. Only the argument is reported: the
 * same module's `const` and in-place forms beside it are not, and on their
 * own they build and keep the server code off the client.
 */
import { describe, expect, test } from 'vitest'
import {
  diagnosticPosition,
  expectDiagnostic,
  expectNoDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { StartBuildError, startBundlers } from '../build-harness'
import { buildStart } from '../build-start'
import {
  pageEntries,
  rootDocument,
  routerFile,
  startPageEntries,
} from './start-compose-app'

const timeout = 60_000

const routeHead = `import { createFileRoute } from '@tanstack/react-router'
import { createServerOnlyFn } from '@tanstack/react-start'
`

/** In place and by one `const`: accepted beside the refused name. */
const controls = `const kept = () => 'MARK_SERVER_KEPT'
export const keptOnly = createServerOnlyFn(kept)
export const inPlace = createServerOnlyFn(() => 'MARK_SERVER_IN_PLACE')
`

const refused: Array<{ name: string; route: string; at: string }> = [
  {
    name: 'a server-only fn',
    route: `${routeHead}let impl = () => 'MARK_SERVER_FIRST'
export const readOnly = createServerOnlyFn(impl)
impl = () => 'MARK_SERVER_SECOND'
${controls}export const Route = createFileRoute('/')({
  component: () => <p>MARK_HOME</p>,
})
`,
    at: 'impl)',
  },
  {
    name: "a route's server handler",
    route: `${routeHead}let get = () => new Response('MARK_SERVER_FIRST')
get = () => new Response('MARK_SERVER_SECOND')
${controls}export const Route = createFileRoute('/')({
  server: { handlers: { GET: get, POST: () => new Response('MARK_SERVER_POST') } },
  component: () => <p>MARK_HOME</p>,
})
`,
    at: 'GET: get',
  },
]

/** A Start app whose index route is `route`. */
const appWith = (route: string) => ({
  ...startPageEntries,
  ...pageEntries,
  'src/router.ts': routerFile,
  'src/routes/__root.tsx': rootDocument(['/']),
  'src/routes/index.tsx': route,
})

describe.each(startBundlers)('%s build', (bundler) => {
  test.each(refused)(
    '$name by a name the module assigns elsewhere fails the build at the argument, and only there',
    async ({ route, at }) => {
      const error = await buildStart({
        bundler,
        files: appWith(route),
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      }).then(
        () => expect.fail('the build succeeded'),
        (e: unknown) => e,
      )
      if (!(error instanceof StartBuildError)) {
        throw error
      }
      const refusal = {
        severity: 'error',
        file: 'src/routes/index.tsx',
        root: error.root,
      } as const
      const position = { line: diagnosticPosition(route, at).line }
      expectDiagnostic(error.diagnostics, { ...refusal, position })
      // (none at the accepted forms)
      const atArgument = new Set(
        findDiagnostics(error.diagnostics, { ...refusal, position }),
      )
      expectNoDiagnostic(
        error.diagnostics.filter((d) => !atArgument.has(d)),
        refusal,
      )
    },
    timeout,
  )

  test(
    'the same by one `const` builds, and no server code reaches the client',
    async () => {
      const build = await buildStart({
        bundler,
        files: appWith(`${routeHead}const get = import.meta.env.DEV
  ? () => new Response('MARK_SERVER_FIRST')
  : () => new Response('MARK_SERVER_SECOND')
${controls}export const Route = createFileRoute('/')({
  server: { handlers: { GET: get } },
  component: () => <p>MARK_HOME</p>,
})
`),
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      expect({
        first: build.client.where('MARK_SERVER_FIRST'),
        second: build.client.where('MARK_SERVER_SECOND'),
        kept: build.client.where('MARK_SERVER_KEPT'),
        inPlace: build.client.where('MARK_SERVER_IN_PLACE'),
        page: build.client.where('MARK_HOME') === 'nowhere',
      }).toEqual({
        first: 'nowhere',
        second: 'nowhere',
        kept: 'nowhere',
        inPlace: 'nowhere',
        page: false,
      })
    },
    timeout,
  )
})
