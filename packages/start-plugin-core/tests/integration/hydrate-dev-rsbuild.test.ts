/**
 * The edit rows of hydrate-dev.test.ts (FIX-PLAN V2-20, SPEC J5.2, G10) on
 * Start's Rsbuild dev server, seen from a real browser page: React Refresh
 * from `@rsbuild/plugin-react`, Solid's hot updates from
 * `@rsbuild/plugin-solid` (with `@rsbuild/plugin-babel`, configured like a
 * Solid Start app, `solidAppConfig`). Its own file so that each bundler's
 * dev servers run in a worker of their own.
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { pluginReact } from '@rsbuild/plugin-react'
import { startRsbuildStartDevServer } from '../rsbuild-dev-server'
import {
  editLoadedChild,
  expectEditsReached,
  reactApp,
  reactWidgets,
  solidApp,
  solidWidgets,
} from './hydrate-dev-edits'
import { solidAppConfig } from './hydrate-pages'

const timeout = 60_000

describe('Rsbuild dev', () => {
  // Source: FIX-PLAN V2-20 (Rsbuild, React)
  test(
    'React: a loaded child hot-updates in place, and a sibling opened later shows the edited version',
    async () => {
      const server = await startRsbuildStartDevServer({
        hmr: true,
        browser: true,
        // Start serves the pages, not an HTML template.
        config: { tools: { htmlPlugin: false }, plugins: [pluginReact()] },
        files: {
          ...reactApp,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { Widgets } from '../widgets'
export const Route = createFileRoute('/')({ component: Widgets })
`,
          'src/widgets.tsx': reactWidgets('<i>v1</i>', 'capture-v1'),
        },
      })
      expect(server.errors).toEqual([])
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await browser.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      expectEditsReached(await editLoadedChild(server, browser, reactWidgets))
      expect(server.errors).toEqual([])
      expect(browser.loads()).toBe(1)
      expect(browser.errors).toEqual([])
    },
    timeout,
  )

  // Source: FIX-PLAN V2-20 (Rsbuild, Solid)
  test(
    'Solid: a loaded child hot-updates in place, and a sibling opened later shows the edited version',
    async () => {
      const server = await startRsbuildStartDevServer({
        framework: 'solid',
        hmr: true,
        browser: true,
        config: {
          ...solidAppConfig.rsbuildConfig,
          // Start serves the pages, not an HTML template.
          tools: { htmlPlugin: false },
        },
        files: {
          ...solidApp,
          'src/widgets.tsx': solidWidgets('<i>v1</i>', 'capture-v1'),
        },
      })
      expect(server.errors).toEqual([])
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await browser.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      expectEditsReached(await editLoadedChild(server, browser, solidWidgets))
      expect(server.errors).toEqual([])
      expect(browser.loads()).toBe(1)
      expect(browser.errors).toEqual([])
    },
    timeout,
  )
})
