/**
 * Start's router options on its Rsbuild dev server: the client always has
 * route HMR, whatever `codeSplittingOptions.addHmr` says (as Start on Vite,
 * `start-router-dev-server.test.ts`, and as main on both bundlers).
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import { pluginReact } from '@rsbuild/plugin-react'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import {
  reportedErrors,
  startRsbuildStartDevServer,
} from '../../rsbuild-dev-server'
import { loaderRoute, treeRebuildApp } from '../route-edits-after-tree-rebuild'

const timeout = 60_000

describe('Rsbuild dev: route HMR and the router options', () => {
  test(
    'with addHmr: false, a loader edit shows on the open page without a full reload',
    async () => {
      const server = await startRsbuildStartDevServer({
        hmr: true,
        browser: true,
        // Start serves the pages, not an HTML template.
        config: { tools: { htmlPlugin: false }, plugins: [pluginReact()] },
        files: treeRebuildApp,
        start: { router: { codeSplittingOptions: { addHmr: false } } },
      })
      expect(reportedErrors(server)).toEqual([])
      const page = await openPage(`${server.url}/with-loader`, {
        registerCleanup: onTestFinished,
      })
      await page.waitForText('hydrated', { selector: '[data-testid=hydrated]' })
      await page.waitForText('probe-loader-v0', {
        selector: '[data-probe=loader]',
      })

      await server.edit({
        'src/routes/with-loader.tsx': loaderRoute('probe-loader-v1'),
      })
      await page.waitForText('probe-loader-v1', {
        selector: '[data-probe=loader]',
        timeout: 20_000,
      })
      expect(page.loads()).toBe(1)
      expect(page.errors).toEqual([])
      expect(reportedErrors(server)).toEqual([])
    },
    timeout,
  )
})
