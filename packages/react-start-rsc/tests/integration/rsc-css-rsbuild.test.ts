/**
 * RSC CSS delivery (SPEC J7) through the real transport on Rsbuild: a React
 * Start app with RSC enabled on an Rsbuild dev server and in an Rsbuild
 * production build served by `rsbuild preview` (`rsc-app.ts`, Start's RSC
 * layer with `react-server-dom-rspack`), whose server functions render
 * server components with the RSC helpers, and a real page that shows what
 * the browser makes of the Flight payload, including a render call in a
 * helper module the server function calls. The Vite counterpart, with the
 * whole matrix, is rsc-css.test.ts.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  computedStyle,
  openRscPage,
  startRscRsbuildDevServer,
  startRscRsbuildPreviewServer,
  waitForHydration,
  waitForStyle,
} from './rsc-app'
import {
  CARD_BACKGROUND,
  HELPER_CARD_BACKGROUND,
  appFiles,
  helperRow,
  rows,
  show,
} from './rsc-css-rsbuild-app'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'

describe.each(['dev', 'build'] as const)(
  'RSC CSS through the real transport (Rsbuild %s)',
  (mode) => {
    let server: Pick<RsbuildDevServer, 'url' | 'errors'>
    const cleanups: Array<() => Promise<void>> = []

    beforeAll(async () => {
      const registerCleanup = (cleanup: () => Promise<void>) => {
        cleanups.push(cleanup)
      }
      server =
        mode === 'dev'
          ? await startRscRsbuildDevServer({
              browser: true,
              registerCleanup,
              files: appFiles,
            })
          : await startRscRsbuildPreviewServer({
              registerCleanup,
              files: appFiles,
            })
    })
    afterAll(async () => {
      for (const cleanup of cleanups.reverse()) {
        await cleanup()
      }
    })

    test('loading only the client callers does not supply the server stylesheet', async () => {
      const page = await openRscPage(server, '/control')
      await page.waitForText('caller', { selector: '[data-testid=control]' })
      await waitForHydration(page)
      const css = await page.page.evaluate(() =>
        [...document.styleSheets]
          .flatMap((sheet) => {
            try {
              return [...sheet.cssRules].map((rule) => rule.cssText)
            } catch {
              return []
            }
          })
          .join('\n'),
      )
      expect(css).not.toMatch(/254, 243, 199|#fef3c7/i)
      expect(page.errors).toEqual([])
    })

    test.each(rows)(
      '$api in a server function module styles the server component',
      async ({ path }) => {
        expect(server.errors).toEqual([])
        const page = await show(server, path)
        await waitForStyle(
          page,
          '[data-testid=card]',
          'background-color',
          CARD_BACKGROUND,
          5_000,
        )
        expect(
          await computedStyle(page, '[data-testid=card]', 'background-color'),
        ).toBe(CARD_BACKGROUND)
        expect(page.errors).toEqual([])
      },
    )

    // Bug: on Rsbuild, the RSC CSS transform only rewrites server function
    // provider modules (`serverFnProviderOnly: true`, react-start
    // src/plugin/rsbuild.ts; react-start-rsc src/plugin/rscCssTransform.ts), so
    // a render call in a helper module that a server function calls gets no CSS.
    // Impact: the server component renders unstyled; Vite styles it
    // (rsc-css.test.ts, "two render helpers in one module each carry their
    // component CSS").
    // Source: SPEC J7.1, J7.2 (CSS is delivered wherever the render executes).
    test.fails(
      'a render call in a helper module styles the server component',
      async () => {
        expect(server.errors).toEqual([])
        const page = await show(server, helperRow.path, helperRow.marker)
        await waitForStyle(
          page,
          '[data-testid=helper-card]',
          'background-color',
          HELPER_CARD_BACKGROUND,
          5_000,
        )
        expect(
          await computedStyle(
            page,
            '[data-testid=helper-card]',
            'background-color',
          ),
        ).toBe(HELPER_CARD_BACKGROUND)
        expect(page.errors).toEqual([])
      },
    )
  },
)
