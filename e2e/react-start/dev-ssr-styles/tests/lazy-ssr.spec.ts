import { expect } from '@playwright/test'
import { createHmrFileEditor, test } from '@tanstack/router-e2e-utils'
import { ssrStylesMode, viteBundledDev } from '../env'

const whitelistErrors = [
  'Failed to load resource: net::ERR_NAME_NOT_RESOLVED',
  'Failed to load resource: the server responded with a status of 504',
]

test.describe('dev styles for a React.lazy component rendered during SSR', () => {
  test.skip(ssrStylesMode !== 'default', 'Requires the default dev stylesheet')
  test.use({ whitelistErrors })

  test('stay applied after hydration while the lazy module is still loading', async ({
    page,
  }) => {
    // Bundled dev runs the same HeadContent code path, but the lazy module is
    // part of the client bundle, so its request cannot be held back here.
    test.skip(viteBundledDev, 'Cannot block the lazy chunk in bundled dev')

    let releaseModule!: () => void
    const moduleReleased = new Promise<void>((resolve) => {
      releaseModule = resolve
    })
    await page.route(/\/src\/components\/LazySsrPanel\.tsx/, async (route) => {
      await moduleReleased
      await route.continue()
    })

    await page.goto('/lazy-ssr')
    await expect(page.getByTestId('lazy-ssr-hydrated')).toHaveAttribute(
      'data-hydrated',
      'true',
    )
    // Let the post-hydration render settle before sampling the style.
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    )

    // The lazy module is still blocked, so only the SSR dev stylesheet can
    // style the server-rendered markup. #10b981 is rgb(16, 185, 129).
    const panel = page.getByTestId('lazy-ssr-panel')
    expect(
      await panel.evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe('rgb(16, 185, 129)')

    releaseModule()
    await expect(panel).toHaveCSS('background-color', 'rgb(16, 185, 129)')
  })

  test('do not leave stale rules behind after an HMR update', async ({
    page,
  }) => {
    const editor = createHmrFileEditor({
      rootDir: import.meta.dirname,
      files: { css: '../src/styles/lazy-ssr-panel.module.css' },
    })
    await editor.capturePromise
    try {
      await page.goto('/lazy-ssr')
      const panel = page.getByTestId('lazy-ssr-panel')
      // Wait for the lazy module itself to load on the client; the SSR dev
      // stylesheet alone already satisfies the CSS assertion below.
      await expect(panel).toHaveAttribute('data-hydrated', 'true')
      await expect(panel).toHaveCSS('border-top-width', '4px')

      // Removing a declaration must take effect without a reload, i.e. the
      // SSR snapshot of the old rule must not outlive the HMR update.
      await editor.replaceText(
        'css',
        '  border-top: 4px solid rgb(0, 0, 0);\n',
        '',
      )
      await expect(panel).toHaveCSS('border-top-width', '0px')
    } finally {
      await editor.restoreFiles()
    }
  })
})
