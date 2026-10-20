import { pluginReact } from '@rsbuild/plugin-react'
import { describe, expect, test } from 'vitest'
import {
  openRscPage,
  startRscRsbuildDevServer,
  waitForHydration,
} from './rsc-app'
import { callFromPage } from './rsc-start-page'
import { route } from './rsc-start-hmr-page'

describe('Rsbuild dev: edits with a separate RSC provider (SPEC J3.6)', () => {
  // The Vite test above on Start's Rsbuild RSC layer, with React Refresh
  // from `@rsbuild/plugin-react`, in the same order in one session: editing
  // the handler makes the next call run the new code and the client output
  // never has it; editing the component then hot-updates the page, keeping
  // its state; no full reload either way, and the server fn still answers.
  // Source: SPEC J3.6, V2-13 (#7618 as quoted), Rsbuild row (DECISIONS
  // 2026-10-19, `@rsbuild/plugin-react`).
  test('a handler edit reaches the next call and a component edit hot-updates, keeping the state, without a full reload', async () => {
    const server = await startRscRsbuildDevServer({
      browser: true,
      hmr: true,
      config: { plugins: [pluginReact()] },
      files: { 'src/routes/index.tsx': route('MARK_HANDLER_V1', 'Page v1') },
    })
    expect(server.errors).toEqual([])
    const browser = await openRscPage(server, '/')
    await browser.waitForText('Page v1 MARK_HANDLER_V1')
    await waitForHydration(browser)
    await browser.page.locator('[data-testid=count]').click()
    await browser.page.locator('[data-testid=count]').click()
    await browser.waitForText('count 2')
    await callFromPage(browser, 'called Page v1 MARK_HANDLER_V1')

    // The handler
    await server.edit({
      'src/routes/index.tsx': route('MARK_HANDLER_V2', 'Page v1'),
    })
    expect(server.errors).toEqual([])
    await callFromPage(browser, 'called Page v1 MARK_HANDLER_V2')
    expect(browser.loads()).toBe(1)
    // The client's output of the route never has the handler (J4.12)
    const client = [
      ...Object.values(await server.outputs('client')),
      ...Object.values(await server.hotUpdates('client')),
    ].join('\n')
    expect(client).not.toContain('MARK_HANDLER_V2')

    // The component
    await server.edit({
      'src/routes/index.tsx': route('MARK_HANDLER_V2', 'Page v2'),
    })
    expect(server.errors).toEqual([])
    await browser.waitForText('Page v2', { selector: '[data-testid=text]' })
    expect(await browser.text('[data-testid=count]')).toBe('count 2')
    await callFromPage(browser, 'called Page v2 MARK_HANDLER_V2')

    expect(browser.loads()).toBe(1)
    expect(browser.errors).toEqual([])
  })
})
