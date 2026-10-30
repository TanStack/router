/**
 * The edits of v2-edits-page.test.ts (SPEC J6.13, G10) seen
 * by a real browser page of a Start app on Rsbuild's dev server (Start's
 * whole Rsbuild plugin, `@rsbuild/plugin-react` for React Refresh, as the
 * hydrate-dev Rsbuild rows): the component uses the server-only
 * `src/secret.server.ts` only in `createIsomorphicFn().server()` (allowed),
 * then also live (denied), then only in `.server()` again; the target is
 * deleted and recreated between the steps. After each step the page shows
 * the edited component through a hot update (no page load), never the
 * secret, the live use reads a safe mock, and the step reports its
 * violations and only those.
 */
import { pluginReact } from '@rsbuild/plugin-react'
import { afterAll, describe, expect, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'
import { violationRecorder } from '../../importProtection/start-apps'
import {
  importersIn,
  pageApp,
  pageSteps,
  pageWidget,
  recordedSince,
  secretServerModule,
  settledAcrossTurn,
} from './v2-hosts'

const timeout = 60_000
const compileTimeout = timeout

interface StepOutcome {
  /** The widget's text. */
  text: string
  /** `window.liveSecret()`, described, when the step uses it. */
  live?: string
  /** Page loads so far (1: no full reload). */
  loads: number
  /** Whether the client's code (its chunks or the step's hot updates) contains the secret. */
  servedSecret: boolean
  /** The importers reported for the client by the compile of the step. */
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
    const recorder = violationRecorder({ log: 'always' })
    const server = await startRsbuildStartDevServer({
      compileTimeout,
      hmr: true,
      browser: true,
      // Start serves the pages, not an HTML template.
      config: { tools: { htmlPlugin: false }, plugins: [pluginReact()] },
      // `log: 'always'`: each compile reports what it finds, so a stale
      // violation shows in the compile of the step that removed it.
      start: { importProtection: recorder.importProtection },
      files: pageApp,
      registerCleanup,
    })
    const browser = await openPage(server.url!, { registerCleanup })
    const result: Array<StepOutcome> = []
    for (const { step, live } of pageSteps) {
      let since = 0
      if (step > 1) {
        // The deletion and the recreation each in their own edit, settled:
        // a removal landing while Rspack compiles is lost (watchpack 2.5.2
        // vendored by Rspack; KNOWN-BUGS.md, upstream issues).
        // Merge the steps back once Rspack bundles watchpack >= 2.6.
        // (Settled first too: a compile the previous step still has
        // pending would pause the watcher while the removal lands.)
        await settledAcrossTurn(server)
        await server.edit({ 'src/secret.server.ts': null })
        await settledAcrossTurn(server)
        await server.edit({ 'src/secret.server.ts': secretServerModule })
        await settledAcrossTurn(server)
        since = recorder.violations.length
        await server.edit({ 'src/widget.tsx': pageWidget(step, live) })
      }
      await browser.waitForText(`step-${step}`, {
        selector: '[data-testid=widget]',
      })
      await settledAcrossTurn(server)
      const client = [
        ...Object.values(await server.outputs('client')),
        ...Object.values(await server.hotUpdates('client')),
      ]
      result.push({
        text: await browser.text('[data-testid=widget]'),
        ...(live && {
          live: await browser.page.evaluate(`(() => {
${describeValuePrelude}
return describeValue(window.liveSecret(), 'MARK_SECRET')
})()`),
        }),
        loads: browser.loads(),
        servedSecret: client.some((code) => code.includes('MARK_SECRET')),
        // Every compile in this state, excluding target-missing intermediates.
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
    'the page shows the edit without a page load, and never the secret',
    async () => {
      const { text, loads } = await outcome()
      expect({
        clientBranch: text.includes('MARK_CLIENT_BRANCH'),
        secret: text.includes('MARK_SECRET'),
        loads,
      }).toEqual({ clientBranch: true, secret: false, loads: 1 })
    },
    timeout,
  )

  test(
    'no code the client gets contains the secret',
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

  test(
    'the step reports its violations, and only those',
    async () => {
      expect((await outcome()).reported).toEqual(live ? ['src/widget.tsx'] : [])
    },
    timeout,
  )
})
