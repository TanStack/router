import solid from 'vite-plugin-solid'
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { startDevServer } from '../dev-server'
import {
  editLoadedChild,
  expectEditsReached,
  solidApp,
  solidWidgets,
} from './hydrate-dev-edits'

const timeout = 60_000

describe('Vite dev, Solid', () => {
  // A Solid boundary is served with the Solid packages, its chunk renders,
  // and an edit reaches it (the stand-in row deleted in wave 2, on the real
  // packages, with Solid's hot updates).
  // Source: FIX-PLAN V2-20 (Solid half); W2-h-2 hand-over (gaps H21/H22)
  test(
    'a loaded child hot-updates in place, and a sibling opened later shows the edited version',
    async () => {
      const server = await startDevServer({
        start: {},
        framework: 'solid',
        browser: true,
        plugins: [solid({ ssr: true })],
        files: {
          ...solidApp,
          'src/widgets.tsx': solidWidgets('<i>v1</i>', 'capture-v1'),
        },
      })
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await browser.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      await server.idle()
      expectEditsReached(await editLoadedChild(server, browser, solidWidgets))
      expect(browser.loads()).toBe(1)
      expect(browser.errors).toEqual([])
    },
    timeout,
  )
})
