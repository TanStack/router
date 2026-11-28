/**
 * The suite of rsc-css-rsbuild.test.ts and rsc-css-rsbuild-build.test.ts
 * (serial files): the rows of `rsc-css-rsbuild-app.ts` on a shared server.
 */
import { aroundAll, describe, expect, test } from 'vitest'
import {
  computedStyle,
  errorsOf,
  openRscRsbuildDevServer,
  openRscRsbuildPreviewServer,
  visit,
  waitForHydration,
  waitForStyle,
} from './rsc-app'
import {
  CARD_BACKGROUND,
  HELPER_CARD_BACKGROUND,
  appFiles,
  cycleRows,
  helperRow,
  rows,
  show,
  unexportedRow,
} from './rsc-css-rsbuild-app'
import { blankPage } from './rsc-serial'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'

/**
 * The rows of rsc-css-rsbuild.test.ts (`dev`: an Rsbuild dev server) and
 * rsc-css-rsbuild-build.test.ts (`build`: a production build served by
 * `rsbuild preview`), one file per mode so the two run in parallel.
 */
export function describeRscCssRows(mode: 'dev' | 'build') {
  describe(`RSC CSS through the real transport (Rsbuild ${mode})`, () => {
    let server: Pick<RsbuildDevServer, 'url' | 'errors' | 'close'>

    aroundAll(async (runSuite) => {
      server =
        mode === 'dev'
          ? await openRscRsbuildDevServer({
              browser: true,
              files: appFiles,
            })
          : await openRscRsbuildPreviewServer({ files: appFiles })
      try {
        await runSuite()
      } finally {
        await server.close()
      }
    })

    test('loading only the client callers does not supply the server stylesheet', async () => {
      const page = await blankPage()
      await visit(page, server, '/control')
      await page
        .locator('[data-testid=control]', { hasText: /caller/ })
        .waitFor()
      await waitForHydration(page)
      const css = await page.evaluate(() =>
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
      expect(errorsOf(page)).toEqual([])
    })

    test.for(rows)(
      '$api in a server function module styles the server component',
      async ({ path }) => {
        const page = await blankPage()
        expect(server.errors).toEqual([])
        await show(page, server, path)
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
        expect(errorsOf(page)).toEqual([])
      },
    )

    test('an unexported server function the loader calls styles the server component (the control row above: not through the entry)', async () => {
      const page = await blankPage()
      expect(server.errors).toEqual([])
      await show(page, server, unexportedRow.path)
      await waitForStyle(
        page,
        '[data-testid=card]',
        'background-color',
        CARD_BACKGROUND,
        5_000,
      )
      expect(errorsOf(page)).toEqual([])
    })

    test.for(cycleRows)(
      'exports that read each other, $name, keep the server component styled',
      async ({ path }) => {
        const page = await blankPage()
        expect(server.errors).toEqual([])
        await show(page, server, path, /MARK_CYCLE/)
        await waitForStyle(
          page,
          '[data-testid=card]',
          'background-color',
          CARD_BACKGROUND,
          5_000,
        )
        expect(errorsOf(page)).toEqual([])
      },
    )

    // Bug on main: on Rsbuild, the RSC CSS transform only rewrote server function
    // provider modules (`serverFnProviderOnly: true`, react-start
    // src/plugin/rsbuild.ts; react-start-rsc src/plugin/rscCssTransform.ts), so
    // a render call in a helper module that a server function calls gets no CSS.
    // Impact: the server component renders unstyled; Vite styles it
    // (rsc-css.test.ts, "two render helpers in one module each carry their
    // component CSS").
    // Source: SPEC J7.1, J7.2 (CSS is delivered wherever the render executes).
    test('a render call in a helper module styles the server component', async () => {
      const page = await blankPage()
      expect(server.errors).toEqual([])
      await show(page, server, helperRow.path, helperRow.marker)
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
      expect(errorsOf(page)).toEqual([])
    })
  })
}
