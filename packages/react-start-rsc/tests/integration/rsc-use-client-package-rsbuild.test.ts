/**
 * A package's `'use client'` widget that only a server component renders,
 * using a server-only-marked module of its package, on Rsbuild with RSC
 * (rsc-use-client-app.ts, `packageWidgetApp`). Rspack's RSC client
 * references are the widget's only importer: the widget is in the app
 * through them, as an entry's module is, so its import of the marked
 * module is judged like any import the app reaches: `allowImport` and an
 * exemption give the real module, a mock is reported at the widget (also
 * next to another importer of the same mock), in builds and in dev.
 * Source: the reviews of the node_modules policy implementation (Gemini
 * F1 `case6a`, `rsbuild-rsc-dev`; Astra 3 `head-rsbuild-rsc-mixed`).
 */
import { describe, expect, test } from 'vitest'
import {
  openRscPage,
  startRscRsbuildDevServer,
  startRscRsbuildPreviewServer,
} from './rsc-app'
import {
  packageWidgetApp,
  packageWidgetMixedApp,
  summary,
} from './rsc-use-client-app'
import type { Violation } from './rsc-use-client-app'

const timeout = 60_000

/** Start's import protection with `options` and a recorder of `onViolation`. */
function protection(options: Record<string, unknown>) {
  const violations: Array<Violation> = []
  return {
    violations,
    start: {
      importProtection: {
        ...options,
        onViolation: (info: Violation) => {
          violations.push(info)
        },
      },
    },
  }
}

describe('Rsbuild build with RSC', () => {
  test.each<[string, Record<string, unknown>]>([
    [
      'allowImport on the marked file',
      {
        allowImport: ({ resolved }: { resolved?: string }) =>
          resolved?.endsWith('/audit-lib/secret.js') === true,
      },
    ],
    [
      'ignoreImporters on the widget',
      { ignoreImporters: ['**/audit-lib/widget.jsx'] },
    ],
  ])(
    '%s gives the widget the real module, nothing reported',
    async (_, options) => {
      const { violations, start } = protection({
        behavior: 'error',
        ...options,
      })
      const server = await startRscRsbuildPreviewServer({
        start,
        files: packageWidgetApp,
      })
      const page = await openRscPage(server, '/c')
      await page.waitForText('MARK_SECRET', {
        selector: '[data-testid=widget]',
      })
      expect(summary(violations)).toEqual([])
    },
    timeout,
  )

  test(
    'mock: the widget and a route component reading the mock through a package barrel are both reported',
    async () => {
      const { violations, start } = protection({
        behavior: 'mock',
        mockAccess: 'off',
      })
      await startRscRsbuildPreviewServer({
        start,
        files: packageWidgetMixedApp,
      })
      expect(summary(violations)).toEqual([
        'client marker title.js -> ./secret.js',
        'client marker widget.jsx -> ./secret.js',
      ])
    },
    timeout,
  )
})

describe('Rsbuild dev with RSC', () => {
  test(
    'the widget is served the mock, and the marked file is reported',
    async () => {
      const { violations, start } = protection({ mockAccess: 'off' })
      const server = await startRscRsbuildDevServer({
        browser: true,
        start,
        files: packageWidgetApp,
      })
      const page = await openRscPage(server, '/c')
      await page.waitForText('SERVER_ROOT', { selector: '[data-testid=root]' })
      // (a dev server names the denied file of an importer it does not
      // compile: it serves the file before it knows who imports it)
      expect(summary(violations)).toEqual([
        'client marker secret.js -> node_modules/audit-lib/secret.js',
      ])
    },
    timeout,
  )
})
