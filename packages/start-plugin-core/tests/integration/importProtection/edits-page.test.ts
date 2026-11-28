/**
 * The edits of edits.test.ts (SPEC J6.13, G10) seen by a
 * real browser page of a Start app on Vite's dev server: a component uses
 * the server-only `src/secret.server.ts` only in
 * `createIsomorphicFn().server()` (allowed), then also live (denied), then
 * only in `.server()` again; the target is deleted and recreated between
 * the steps. After each step the page shows the edited component through a
 * hot update (no full reload: the component module accepts it), never the
 * secret, the live use reads a safe mock, and the step reports its
 * violations and only those.
 */
import react from '@vitejs/plugin-react'
import { describe, expect, test } from 'vitest'
import {
  hmrSyncModule,
  settlePage,
  trackRequests,
} from '@tanstack/compiler-test-utils/hmr-sync'
import { openTestPage } from '../../test-page'
import { startDevServer } from '../../dev-server'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import { violationRecorder } from '../../importProtection/start-apps'
import {
  importersIn,
  pageApp,
  pageSteps,
  pageWidget,
  recordedSince,
  secretServerModule,
} from './hosts'

const timeout = 30_000

/** Pre-bundled up front, as Vite does for an app that installed them. */
const config = {
  optimizeDeps: {
    include: [
      'react',
      'react/jsx-dev-runtime',
      'react-dom',
      'react-dom/client',
      '@tanstack/react-router',
      '@tanstack/react-router > @tanstack/router-core > seroval',
      '@tanstack/react-router > @tanstack/router-core > seroval-plugins/web',
    ],
  },
}

interface StepOutcome {
  /** The widget's text. */
  text: string
  /** `window.liveSecret()`, described, when the step uses it. */
  live?: string
  /**
   * Page loads so far (1: no full reload), once the page took in what the
   * server sent it for the step (`settlePage`).
   */
  loads: number
  /** Whether a module the client loads contains the secret. */
  servedSecret: boolean
  /** The importers reported for the client since the step's edit. */
  reported: Array<string>
}

/** Runs every step once, shared by the tests. */
let outcomes: Promise<Array<StepOutcome>> | undefined
const run = () =>
  (outcomes ??= (async () => {
    const recorder = violationRecorder({ log: 'always' })
    const server = await startDevServer({
      start: { importProtection: recorder.importProtection },
      browser: true,
      config,
      plugins: [react()],
      // The router module loads `src/hmr-sync.ts` (`settlePage`)
      files: {
        ...pageApp,
        'src/router.ts': `${pageApp['src/router.ts']}import './hmr-sync'\n`,
        'src/hmr-sync.ts': hmrSyncModule,
      },
    })
    const browser = await openTestPage(new URL('/', server.url).href)
    const inFlight = trackRequests(browser)
    const result: Array<StepOutcome> = []
    for (const { step, live } of pageSteps) {
      let since = 0
      if (step > 1) {
        await server.edit({ 'src/secret.server.ts': null })
        await server.edit({ 'src/secret.server.ts': secretServerModule })
        await server.idle()
        since = recorder.violations.length
        await server.edit({ 'src/widget.tsx': pageWidget(step, live) })
      }
      await browser.waitForText(`step-${step}`, {
        selector: '[data-testid=widget]',
      })
      await settlePage(server, browser, inFlight)
      const served = await server.load('/src/widget.tsx')
      await server.idle()
      result.push({
        text: await browser.text('[data-testid=widget]'),
        ...(live && {
          live: await browser.page.evaluate(`(() => {
${describeValuePrelude}
return describeValue(window.liveSecret(), 'MARK_SECRET')
})()`),
        }),
        loads: browser.loads(),
        servedSecret: Object.values(served).some((code) =>
          code.includes('MARK_SECRET'),
        ),
        reported: importersIn(
          recordedSince({ root: server.root, ...recorder }, since),
          'client',
        ),
      })
    }
    return result
  })())

describe.each(pageSteps)('step $step (live use: $live)', ({ step, live }) => {
  const outcome = async () => (await run())[step - 1]!

  test(
    'the page shows the edit without a full reload, and never the secret',
    async () => {
      const { text, loads } = await outcome()
      expect({
        clientBranch: text.includes('MARK_CLIENT_BRANCH'),
        secret: text.includes('MARK_SECRET'),
        loads,
      }).toEqual({
        clientBranch: true,
        secret: false,
        loads: 1,
      })
    },
    timeout,
  )

  test(
    'no module the client loads contains the secret',
    async () => {
      expect((await outcome()).servedSecret).toBe(false)
    },
    timeout,
  )

  if (live) {
    test(
      'the live use reads a safe mock',
      async () => {
        expect((await outcome()).live).toBe('a safe mock')
      },
      timeout,
    )
  }

  // On main, a server-only import a developer adds to a component while the dev
  // server runs is mocked in the page without any warning.
  test(
    'the step reports its violations, and only those',
    async () => {
      expect((await outcome()).reported).toEqual(live ? ['src/widget.tsx'] : [])
    },
    timeout,
  )
})
