/**
 * `<Hydrate>` on Start's Vite dev server, seen from a real browser page: the
 * app is a Start app (Start's whole Vite plugin, its dev middleware
 * rendering the page with the app's server entry, `StartClient` hydrating
 * it), the page is headless Chromium with Vite's HMR client and React
 * Refresh (`@vitejs/plugin-react`) or Solid's (`vite-plugin-solid`), and
 * the edits are files written to disk, which Vite's watcher reports.
 *
 * - A loaded child hot-updates in place, and a sibling whose code had not
 *   loaded yet shows the edited version when it opens (SPEC J5.2, G10),
 *   React and Solid.
 * - Route code splitting and `<Hydrate>` in one route module: the split
 *   route component's boundaries hydrate the server's HTML (splitter
 *   composition).
 *
 * The Rsbuild counterparts of the edit rows: hydrate-dev-rsbuild.test.ts.
 */
import react from '@vitejs/plugin-react'
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { describeHmr } from '@tanstack/compiler-test-utils/dev-server'
import { startDevServer } from '../dev-server'
import {
  editLoadedChild,
  expectEditsReached,
  reactApp,
  reactWidgets,
} from './hydrate-dev-edits'

const timeout = 60_000

/** Pre-bundled up front, as Vite does for an app that installed them. */
const reactOptimizeDeps = {
  include: [
    'react',
    'react/jsx-dev-runtime',
    'react-dom',
    'react-dom/client',
    '@tanstack/react-router',
    '@tanstack/react-router > @tanstack/router-core > seroval',
    '@tanstack/react-router > @tanstack/router-core > seroval-plugins/web',
  ],
}

describe('Vite dev, React', () => {
  test(
    'a loaded child hot-updates in place, and a sibling opened later shows the edited version',
    async () => {
      const server = await startDevServer({
        start: {},
        browser: true,
        config: { optimizeDeps: reactOptimizeDeps },
        plugins: [react()],
        files: {
          ...reactApp,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { Widgets } from '../widgets'
export const Route = createFileRoute('/')({ component: Widgets })
`,
          'src/widgets.tsx': reactWidgets('<i>v1</i>', 'capture-v1'),
        },
      })
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await browser.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      await server.idle()
      expectEditsReached(await editLoadedChild(server, browser, reactWidgets))
      expect(browser.loads()).toBe(1)
      expect(
        describeHmr(
          server.hmr.filter(
            (message) =>
              message.environment === 'client' &&
              message.type === 'full-reload',
          ),
        ),
      ).toEqual([])
      expect(browser.errors).toEqual([])
    },
    timeout,
  )

  // The router splits the route component into its own module, which the
  // Hydrate plugin splits again: the page hydrates the server's HTML with
  // both, the deferred child loading its code on its interaction.
  test(
    'boundaries of a split route component hydrate the server HTML',
    async () => {
      const server = await startDevServer({
        start: {},
        browser: true,
        config: { optimizeDeps: reactOptimizeDeps },
        plugins: [react()],
        files: {
          ...reactApp,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { Hydrate } from '@tanstack/react-start'
import { idle, interaction } from '@tanstack/react-start/hydration'
import { Counter } from '../counter'
export const Route = createFileRoute('/')({ component: Page })
function Page() {
  return (
    <main>
      <Counter label="route" />
      <Hydrate when={interaction()}><Counter label="deferred" /></Hydrate>
      <Hydrate when={idle()}><Counter label="idle" /></Hydrate>
    </main>
  )
}
`,
        },
      })
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await browser.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      expect(await browser.text('#app')).toBe('route:0deferred:0idle:0')
      /** How many resources the page requested so far. */
      const requested = () =>
        browser.page.evaluate(
          () => performance.getEntriesByType('resource').length,
        )
      /** Clicks the counter `label` until it counts. */
      const count = async (label: string) => {
        const deadline = Date.now() + 10_000
        while (!(await browser.text('#app')).includes(`${label}:1`)) {
          if (Date.now() > deadline) {
            throw new Error(
              `${label} never counted: ${await browser.text('#app')}`,
            )
          }
          await browser.page.locator(`[data-label=${label}]`).click()
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      }
      await count('route')
      await count('idle')
      await server.idle()
      // The deferred child's code loads when it hydrates.
      const beforeDeferred = await requested()
      await count('deferred')
      expect(await requested()).toBeGreaterThan(beforeDeferred)
      expect(await browser.text('#app')).toBe('route:1deferred:1idle:1')
      expect(
        await browser.page.evaluate(
          () => (globalThis as any).__recoverable ?? [],
        ),
      ).toEqual([])
      expect(browser.errors).toEqual([])
    },
    timeout,
  )
})
