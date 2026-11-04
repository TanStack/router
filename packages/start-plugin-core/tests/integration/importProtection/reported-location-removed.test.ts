/**
 * Where import protection reports a violation when the Start compiler
 * removes some uses of the denied import from an environment (SPEC J6.4,
 * J6.5): a use inside removed code is not reported, a use the environment
 * keeps is, at that use, on the client and on the server. Read from what a
 * real app reports (reported-location-app.ts), on every channel. Split from
 * reported-location.test.ts to keep each file of the slow tier short.
 */
import { describe, expect, test } from 'vitest'
import { buildStart } from '../../build-harness'
import {
  distinct,
  locationIn,
  reportedViolations,
  startProtectedDevServer,
} from '../../importProtection/start-apps'
import {
  channels,
  expectRelevantLocation,
  reportedLocations,
  timeout,
} from './reported-location-app'
import type { Recorded } from '../../importProtection/start-apps'
import type { StartBuildError } from '../../build-harness'

// A use inside code the Start compiler removes from the client (a safe
// boundary) is not reported: the client no longer imports the denied file.
// Source: review; moved from analysis.usage.test.ts, which decided "no
// violation" from the compiled code's imports.
describe('a use inside code the Start compiler removes from the client is not reported', () => {
  const safeUses = {
    'the server of a middleware variable': `import { createMiddleware } from '@tanstack/react-start'
import { secret } from './secret.server'
const authMiddleware = createMiddleware()
export const middleware = authMiddleware.server(({ next }) =>
  next({ context: { secret: secret() } }),
)
`,
    'a nested middleware server callback': `import { createMiddleware } from '@tanstack/react-start'
import { secret } from './secret.server'
export const middleware = createMiddleware().server(({ next }) => {
  const read = () => ({ nested: secret() })
  return next({ context: read() })
})
`,
    'the handler of a server fn builder variable': `import { createServerFn } from '@tanstack/react-start'
import { secret } from './secret.server'
const myServerFn = createServerFn({ method: 'GET' })
export const fn = myServerFn.handler(async () => secret())
`,
  }

  test.each(
    Object.entries(safeUses).flatMap(([name, code]) =>
      channels.map((channel) => ({ name, code, channel })),
    ),
  )(
    '$channel: $name',
    async ({ channel, code }) => {
      expect(await reportedLocations(channel, code)).toEqual([])
    },
    timeout,
  )
})

// The server side: a `.client` file (denied to the server by the default
// rules) used only inside code the Start compiler removes from the server
// (`createClientOnlyFn`) is not reported; a use the server keeps is reported
// on the server, at that use.
// Source: review (the compiler-removal rows of analysis.usage.test.ts had
// no server-side twin on a real adapter).
describe('the reported location of a server violation is the leaking use or the import', () => {
  type ServerChannel = 'vite dev' | 'vite build' | 'rsbuild build'
  const serverChannels: Array<ServerChannel> = [
    'vite dev',
    'vite build',
    'rsbuild build',
  ]

  const insideOnly = `import { createClientOnlyFn } from '@tanstack/react-start'
import { widget } from './widget.client'
export const fn = createClientOnlyFn(() => widget())
`
  const insideAndOutside = `${insideOnly}export const leak = () => widget()
`

  /**
   * `<environment> <importer>` of each violation reported for an app whose
   * `src/a.ts` is `code` (the server entry re-exports it) and imports the
   * client-only `src/widget.client.ts`.
   */
  async function serverReports(
    channel: ServerChannel,
    code: string,
  ): Promise<Array<string>> {
    const files = {
      'src/widget.client.ts': `export const widget = () => 'MARK_CLIENT'\n`,
      'src/a.ts': code,
      'src/entry.ts': `export * from './a'\n`,
      'src/client.ts': `export const read = () => 'client'\n`,
    }
    let output: Recorded
    if (channel === 'vite dev') {
      const server = await startProtectedDevServer(files)
      await server.load('/src/entry.ts', { environment: 'ssr' })
      output = server
    } else {
      const bundler = channel === 'vite build' ? 'vite' : 'rsbuild'
      output = await buildStart({
        bundler,
        files,
        entry: { client: 'src/client.ts', ssr: 'src/entry.ts' },
      }).then(
        (build) => build,
        (error: StartBuildError) => {
          if (reportedViolations(error).length === 0) {
            throw error
          }
          return error
        },
      )
    }
    return distinct(
      reportedViolations(output).map(
        ({ environment, importer }) => `${environment} ${importer}`,
      ),
    )
  }

  test.each(serverChannels)(
    '%s: a use outside createClientOnlyFn is reported on the server at the use or the import; the use inside is not',
    async (channel) => {
      const reports = await serverReports(channel, insideAndOutside)
      expect(reports.map((report) => report.split(' ')[0])).toEqual(['server'])
      expectRelevantLocation(
        reports.map((report) => report.split(' ')[1]!),
        [locationIn('src/a.ts', insideAndOutside, 4, 'widget()'), 'src/a.ts:2'],
      )
    },
    timeout,
  )

  test.each(serverChannels)(
    '%s: createIsomorphicFn client use is removed; its server use is located in the original source',
    async (channel) => {
      const code = `import { createIsomorphicFn } from '@tanstack/react-start'
import { widget } from './widget.client'
export const readClient = createIsomorphicFn().client(() => widget())
export const readServer = createIsomorphicFn().server(() => widget())
`
      const reports = await serverReports(channel, code)
      expect(reports.map((report) => report.split(' ')[0])).toEqual(['server'])
      expectRelevantLocation(
        reports.map((report) => report.split(' ')[1]!),
        [locationIn('src/a.ts', code, 4, 'widget()'), 'src/a.ts:2'],
      )
    },
    timeout,
  )

  test.each(serverChannels)(
    '%s: a use only inside createClientOnlyFn is not reported',
    async (channel) => {
      expect(await serverReports(channel, insideOnly)).toEqual([])
    },
    timeout,
  )
})
