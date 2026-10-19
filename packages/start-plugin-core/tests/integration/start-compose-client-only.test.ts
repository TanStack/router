/**
 * `<ClientOnly>` children importing a `*.client.*` module in a route
 * component, in a default-config Start build (FIX-PLAN V2-06; SPEC J4.11,
 * ruling "server-side `*.client.*` imports" 2026-10-18): the module is one
 * import protection denies on the server, and only the children use it, so
 * the server build must not load it: a default-config build reports no
 * import-protection violation, the server bundle holds none of its code,
 * Start's real server entry renders the fallback (the module reads `window`
 * at its top level, so loading it on the server would throw), and the page
 * renders the children once hydrated. The route component is split by
 * Start's code splitter, so the Start compiler, the splitter and import
 * protection all touch the module (G11). Built with Start's Vite and
 * Rsbuild plugins and served like a deployed app (start-compose-app.ts).
 */
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  onTestFinished,
  test,
} from 'vitest'
import { BuildError } from '@tanstack/compiler-test-utils/build-harness'
import { buildStart, startBundlers } from '../build-harness'
import { reportedViolations } from '../importProtection/start-apps'
import {
  openAppPage,
  pageEntries,
  rootDocument,
  routerFile,
  serveStartBuild,
  startPageEntries,
} from './start-compose-app'
import type { StartBuild } from '../build-harness'

const timeout = 60_000

const files = {
  ...startPageEntries,
  'src/chart.client.tsx': `// A browser-only module: evaluating it anywhere else throws.
const width = window.innerWidth
export function Chart() {
  return <p data-testid="chart">MARK_CHART {width > 0 ? 'wide' : 'narrow'}</p>
}
`,
  'src/routes/__root.tsx': rootDocument(),
  'src/routes/index.tsx': `import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { Chart } from '../chart.client'
function Page() {
  return (
    <main>
      <h1>MARK_INDEX</h1>
      <ClientOnly fallback={<p data-testid="chart">MARK_LOADING</p>}>
        <Chart />
      </ClientOnly>
    </main>
  )
}
export const Route = createFileRoute('/')({ component: Page })
`,
  'src/router.ts': routerFile,
  ...pageEntries,
}

describe.each(startBundlers)(
  '%s build with the default configuration',
  (bundler) => {
    let build: StartBuild | undefined
    let failure: BuildError | undefined
    const cleanups: Array<() => Promise<void>> = []

    beforeAll(async () => {
      try {
        build = await buildStart({
          bundler,
          files,
          entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
          registerCleanup: (cleanup) => cleanups.push(cleanup),
        })
      } catch (error) {
        if (!(error instanceof BuildError)) {
          throw error
        }
        failure = error
      }
    }, timeout)

    afterAll(async () => {
      await Promise.all(cleanups.map((cleanup) => cleanup()))
    })

    const built = () => {
      if (!build) {
        throw failure
      }
      return build
    }

    test('builds, and reports no import-protection violation', () => {
      expect(failure).toBeUndefined()
      expect(
        reportedViolations([
          ...built().client.warnings,
          ...built().ssr.warnings,
          ...built().ssr.consoleMessages,
        ]),
      ).toEqual([])
    })

    test('the server bundle holds none of the client-only module', () => {
      expect(built().ssr.where('MARK_CHART')).toBe('nowhere')
    })

    test(
      'the server renders the fallback, and the page renders the children once hydrated',
      async () => {
        const served = await serveStartBuild(built(), {
          registerCleanup: onTestFinished,
        })
        const response = await served.fetch('/')
        const html = await response.text()
        expect({ status: response.status, html }).toEqual({
          status: 200,
          html: expect.stringContaining('MARK_LOADING'),
        })
        expect(html).not.toContain('MARK_CHART')
        const page = await openAppPage(served, '/', {
          registerCleanup: onTestFinished,
        })
        await page.waitForText('MARK_CHART wide', {
          selector: '[data-testid=chart]',
        })
        expect(page.errors).toEqual([])
      },
      timeout,
    )
  },
)
