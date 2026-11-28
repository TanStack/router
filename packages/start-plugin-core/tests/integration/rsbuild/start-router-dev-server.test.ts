/**
 * Start's router wiring on a running Rsbuild dev server, seen from a real
 * browser page served by Start's own dev middleware: the client route
 * tree, which leaves out server-only routes, follows edits that turn a
 * route into a page or into a server-only route
 * (`../start-router-server-only-switch.ts`; the Vite counterpart:
 * start-router-dev-server.test.ts). Its own file so that each bundler's dev
 * servers run in a worker of their own.
 */
import { describe, expect, test } from 'vitest'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import {
  reportedErrors,
  startRsbuildStartDevServer,
} from '../../rsbuild-dev-server'
import {
  pageBeforeTheClientLoadedTheTree,
  serverOnlySwitchApp,
  switchBetweenServerOnlyAndPage,
} from '../start-router-server-only-switch'
// (React Refresh as in an installed app: the tab gets a new route set by
// Start's reload, not by Rsbuild's for an update nothing accepts)
import { installedReact } from './route-set-reload-app'
import type { ServerOnlySwitchServer } from '../start-router-server-only-switch'
import type { RsbuildPlugin } from '@rsbuild/core'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'

const timeout = 60_000

/**
 * `src/hmr-sync.ts`: the hash of the compile whose modules the page runs
 * (Rspack's `__webpack_hash__`, which a hot update moves forward).
 */
const hashModule = `declare const __webpack_hash__: string
if (typeof window !== 'undefined') {
  ;(window as any).__harnessHash = () => __webpack_hash__
}
`

/**
 * Start's Rsbuild dev server on the scenarios' app. A page took in what the
 * server sent once it runs the client's last compile (a hot update, or the
 * document of a reload) with nothing in flight.
 */
async function startPageServer(): Promise<{
  server: RsbuildDevServer
  scenario: ServerOnlySwitchServer
}> {
  let clientHash: string | undefined
  const recordClientHash: RsbuildPlugin = {
    name: 'test:client-hash',
    setup(api) {
      api.onAfterEnvironmentCompile(({ stats, environment }) => {
        if (environment.name === 'client' && stats) {
          clientHash = stats.hash ?? undefined
        }
      })
    },
  }
  const server = await startRsbuildStartDevServer({
    hmr: true,
    browser: true,
    // Start serves the pages, not an HTML template.
    config: {
      tools: { htmlPlugin: false },
      plugins: [installedReact(), recordClientHash],
    },
    files: { ...serverOnlySwitchApp, 'src/hmr-sync.ts': hashModule },
  })
  const pageState = (page: BrowserPage) =>
    page.page
      .evaluate(() => [
        (window as any).__harnessHash?.() as string | undefined,
        document.readyState,
      ])
      // The page is between two documents
      .catch(() => [undefined, 'loading'])
  return {
    server,
    scenario: {
      url: server.url,
      edit: (files) => server.edit(files),
      settled: () => server.settle(),
      settlePage: (page, inFlight) =>
        waitForOutcome({
          timeout: 10_000,
          applied: async () => {
            const [hash, readyState] = await pageState(page)
            return hash === clientHash && readyState === 'complete'
          },
          quiet: () => inFlight() === 0,
          describe: async () =>
            `the page did not run the client's last compile ${clientHash}: ${JSON.stringify(await pageState(page))}`,
        }),
    },
  }
}

describe('Rsbuild dev: a route switching between page and server-only', () => {
  // Source: research on review round 4 (the client did not compile again
  // when a server-only route became a page: no client module depended on
  // the route's file, and the route tree file did not change).
  test(
    'the page follows a route that becomes a page, loses its handlers and becomes server-only again',
    async () => {
      const { server, scenario } = await startPageServer()
      await switchBetweenServerOnlyAndPage(scenario)
      expect(reportedErrors(server)).toEqual([])
    },
    timeout,
  )

  test(
    'a route that becomes a page before the client loaded the route tree is in the client route tree',
    async () => {
      const { server, scenario } = await startPageServer()
      await pageBeforeTheClientLoadedTheTree(scenario)
      expect(reportedErrors(server)).toEqual([])
    },
    timeout,
  )
})
