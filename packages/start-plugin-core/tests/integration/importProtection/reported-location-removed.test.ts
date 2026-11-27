/**
 * Where import protection reports a violation when the Start compiler
 * removes some uses of the denied import from an environment (SPEC J6.4,
 * J6.5): a use inside removed code is not reported, a use the environment
 * keeps is, at that use, on the client and on the server. Read from what a
 * real app reports (reported-location-app.ts), on every channel, each case
 * a module of one app per channel.
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
  reportedLocationsOfCases,
  timeout,
} from './reported-location-app'
import type { Channel } from './reported-location-app'
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

  /** What each channel reports for every use, in one app per channel. */
  const names = Object.keys(safeUses)
  const reportsOn = new Map<
    Channel,
    ReturnType<typeof reportedLocationsOfCases>
  >()
  const reportsOf = (channel: Channel) => {
    let reports = reportsOn.get(channel)
    if (!reports) {
      reports = reportedLocationsOfCases(
        channel,
        Object.fromEntries(
          Object.values(safeUses).map((code, i) => [`c${i}`, code]),
        ),
      )
      reportsOn.set(channel, reports)
    }
    return reports
  }

  test.each(
    Object.entries(safeUses).flatMap(([name, code]) =>
      channels.map((channel) => ({ name, code, channel })),
    ),
  )(
    '$channel: $name',
    async ({ channel, name }) => {
      const reports = await reportsOf(channel)
      expect(reports.of(`c${names.indexOf(name)}`)).toEqual([])
      expect(reports.otherErrors).toEqual([])
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

  const cases = {
    insideAndOutside,
    isomorphic: `import { createIsomorphicFn } from '@tanstack/react-start'
import { widget } from './widget.client'
export const readClient = createIsomorphicFn().client(() => widget())
export const readServer = createIsomorphicFn().server(() => widget())
`,
    insideOnly,
  }
  type CaseName = keyof typeof cases

  /**
   * `<environment> <importer>` of each violation reported for an app in
   * which each case `name` is `src/<name>/a.ts` (the server entry
   * re-exports each as a namespace) and imports a client-only
   * `src/<name>/widget.client.ts` of its own, by case: one app per channel.
   */
  async function serverReportsOfCases(
    channel: ServerChannel,
  ): Promise<(name: CaseName) => Array<string>> {
    const names = Object.keys(cases) as Array<CaseName>
    const files = {
      ...Object.fromEntries(
        names.flatMap((name) => [
          [
            `src/${name}/widget.client.ts`,
            `export const widget = () => 'MARK_CLIENT'\n`,
          ],
          [`src/${name}/a.ts`, cases[name]],
        ]),
      ),
      'src/entry.ts': names
        .map((name) => `export * as ${name} from './${name}/a'\n`)
        .join(''),
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
    const reports = distinct(
      reportedViolations(output).map(
        ({ environment, importer }) => `${environment} ${importer}`,
      ),
    )
    return (name) =>
      reports.filter((report) =>
        report.split(' ')[1]!.startsWith(`src/${name}/a.ts`),
      )
  }
  const serverReportsOn = new Map<
    ServerChannel,
    ReturnType<typeof serverReportsOfCases>
  >()
  /** The reports of `name` on `channel` (the channel's app is built once). */
  async function serverReports(channel: ServerChannel, name: CaseName) {
    let reports = serverReportsOn.get(channel)
    if (!reports) {
      reports = serverReportsOfCases(channel)
      serverReportsOn.set(channel, reports)
    }
    return (await reports)(name)
  }

  test.each(serverChannels)(
    '%s: a use outside createClientOnlyFn is reported on the server at the use or the import; the use inside is not',
    async (channel) => {
      const reports = await serverReports(channel, 'insideAndOutside')
      expect(reports.map((report) => report.split(' ')[0])).toEqual(['server'])
      expectRelevantLocation(
        reports.map((report) => report.split(' ')[1]!),
        [
          locationIn(
            'src/insideAndOutside/a.ts',
            insideAndOutside,
            4,
            'widget()',
          ),
          'src/insideAndOutside/a.ts:2',
        ],
      )
    },
    timeout,
  )

  test.each(serverChannels)(
    '%s: createIsomorphicFn client use is removed; its server use is located in the original source',
    async (channel) => {
      const reports = await serverReports(channel, 'isomorphic')
      expect(reports.map((report) => report.split(' ')[0])).toEqual(['server'])
      expectRelevantLocation(
        reports.map((report) => report.split(' ')[1]!),
        [
          locationIn('src/isomorphic/a.ts', cases.isomorphic, 4, 'widget()'),
          'src/isomorphic/a.ts:2',
        ],
      )
    },
    timeout,
  )

  test.each(serverChannels)(
    '%s: a use only inside createClientOnlyFn is not reported',
    async (channel) => {
      expect(await serverReports(channel, 'insideOnly')).toEqual([])
    },
    timeout,
  )
})
