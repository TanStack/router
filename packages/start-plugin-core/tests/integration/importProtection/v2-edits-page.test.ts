/**
 * The edits of v2-edits.test.ts (FIX-PLAN V2-14; SPEC J6.13, G10) seen by a
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
import { afterAll, describe, expect, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { startDevServer } from '../../dev-server'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import {
  pageApp,
  pageSteps,
  pageWidget,
  reportedImporters,
  secretServerModule,
} from './v2-hosts'

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
  /** Page loads so far (1: no full reload). */
  loads: number
  /** Full reloads the server sent to the client since the step's edit. */
  fullReloads: number
  /** Whether a module the client loads contains the secret. */
  servedSecret: boolean
  /** The importers reported for the client since the step's edit. */
  reported: Array<string>
}

/** The server and page close after the last test. */
const cleanups: Array<() => Promise<void>> = []
afterAll(async () => {
  for (const cleanup of cleanups.reverse()) {
    await cleanup()
  }
})
const registerCleanup = (cleanup: () => Promise<void>) => {
  cleanups.push(cleanup)
}

/** Runs every step once, shared by the tests. */
let outcomes: Promise<Array<StepOutcome>> | undefined
const run = () =>
  (outcomes ??= (async () => {
    const server = await startDevServer({
      start: {},
      browser: true,
      config,
      plugins: [react()],
      files: pageApp,
      registerCleanup,
    })
    const browser = await openPage(new URL('/', server.url).href, {
      registerCleanup,
    })
    const result: Array<StepOutcome> = []
    for (const { step, live } of pageSteps) {
      let since = { logs: 0, hmr: 0 }
      if (step > 1) {
        await server.edit({ 'src/secret.server.ts': null })
        await server.edit({ 'src/secret.server.ts': secretServerModule })
        await server.idle()
        since = { logs: server.logs.length, hmr: server.hmr.length }
        await server.edit({ 'src/widget.tsx': pageWidget(step, live) })
      }
      await browser.waitForText(`step-${step}`, {
        selector: '[data-testid=widget]',
      })
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
        fullReloads: server.hmr
          .slice(since.hmr)
          .filter(
            (message) =>
              message.environment === 'client' &&
              message.type === 'full-reload',
          ).length,
        servedSecret: Object.values(served).some((code) =>
          code.includes('MARK_SECRET'),
        ),
        reported: reportedImporters(server.logs.slice(since.logs), 'client'),
      })
    }
    return result
  })())

describe.each(pageSteps)('step $step (live use: $live)', ({ step, live }) => {
  const outcome = async () => (await run())[step - 1]!

  test(
    'the page shows the edit without a full reload, and never the secret',
    async () => {
      const { text, loads, fullReloads } = await outcome()
      expect({
        clientBranch: text.includes('MARK_CLIENT_BRANCH'),
        secret: text.includes('MARK_SECRET'),
        loads,
        fullReloads,
      }).toEqual({
        clientBranch: true,
        secret: false,
        loads: 1,
        fullReloads: 0,
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

  // Bug (step 2): the violation the edit adds is never logged. When a module
  // changes, dev import protection drops the import graph edges that point
  // to it (`hotUpdate` -> `ImportGraph.invalidate`, import-protection/
  // trace.ts), its importer (the split route component) is not transformed
  // again, and the violation found in the edited `src/widget.tsx` is
  // unreachable from Start's entries, so `processPendingViolations`
  // (vite/import-protection-plugin/plugin.ts) discards it. The page twin of
  // the dev.test.ts pin "added by an edit of the importer is logged at the
  // use"; a scratch run keeping the incoming edges passes this pin.
  // Impact: a server-only import a developer adds to a component while the
  // dev server runs is mocked in the page without any warning.
  // Source: FIX-PLAN V2-14.
  ;(live ? test.fails : test)(
    'the step reports its violations, and only those',
    async () => {
      expect((await outcome()).reported).toEqual(live ? ['src/widget.tsx'] : [])
    },
    timeout,
  )
})
