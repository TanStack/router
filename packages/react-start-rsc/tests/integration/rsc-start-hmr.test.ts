/**
 * Edits with a separate server function provider (SPEC J3.6, V2-13): a
 * React Start app with RSC enabled on a Vite dev server, or on an Rsbuild
 * dev server with React Refresh from `@rsbuild/plugin-react` (`rsc-app.ts`),
 * a route module that also declares the server function its loader and page
 * call, and a real page. Outcomes only: what the page shows, what the next
 * call answers, whether the page reloaded. A handler edit that also changes
 * what the loader shows on Rsbuild is in rsc-start-rsbuild.test.ts.
 */
import { describe, expect, test } from 'vitest'
import { describeHmr } from '@tanstack/compiler-test-utils/dev-server'
import { openRscPage, startRscDevServer, waitForHydration } from './rsc-app'
import { callFromPage } from './rsc-start-page'
import { route } from './rsc-start-hmr-page'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'

/** The HMR messages telling the client to reload the page. */
const fullReloads = (server: DevServer) =>
  describeHmr(
    server.hmr.filter(
      (message) =>
        message.environment === 'client' && message.type === 'full-reload',
    ),
  )

describe('Vite dev: edits with a separate RSC provider (SPEC J3.6)', () => {
  // A route module that also declares a server function: editing the
  // handler makes the next call run the new code; editing the component
  // hot-updates the page, keeping its state, and the server fn still
  // answers; no full reload either way (user ruling 2026-10-18).
  // Source: SPEC J3.6, V2-13 (#7618 as quoted), start S12 on Vite.
  test('a handler edit reaches the next call and a component edit hot-updates, without a full reload', async () => {
    const server = await startRscDevServer({
      browser: true,
      files: { 'src/routes/index.tsx': route('MARK_HANDLER_V1', 'Page v1') },
    })
    const browser = await openRscPage(server, '/')
    await browser.waitForText('Page v1 MARK_HANDLER_V1')
    await waitForHydration(browser)
    await browser.page.locator('[data-testid=count]').click()
    await browser.page.locator('[data-testid=count]').click()
    await browser.waitForText('count 2')
    await callFromPage(browser, 'called Page v1 MARK_HANDLER_V1')

    // The handler
    await server.write({
      'src/routes/index.tsx': route('MARK_HANDLER_V2', 'Page v1'),
    })
    await callFromPage(browser, 'called Page v1 MARK_HANDLER_V2')
    expect(fullReloads(server)).toEqual([])
    // The client's module of the route never has the handler (J4.12)
    expect(
      await server.transform('/src/routes/index.tsx', 'client'),
    ).not.toContain('MARK_HANDLER_V2')

    // The component
    await server.write({
      'src/routes/index.tsx': route('MARK_HANDLER_V2', 'Page v2'),
    })
    await browser.waitForText('Page v2', { selector: '[data-testid=text]' })
    expect(await browser.text('[data-testid=count]')).toBe('count 2')
    await callFromPage(browser, 'called Page v2 MARK_HANDLER_V2')

    expect(browser.loads()).toBe(1)
    expect(fullReloads(server)).toEqual([])
    expect(browser.errors).toEqual([])
  })
})
