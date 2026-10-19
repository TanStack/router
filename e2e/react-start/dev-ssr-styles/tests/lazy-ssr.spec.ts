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
      // A full reload would also serve the edited CSS; this must stay one document.
      await page.evaluate(() => {
        ;(window as { sameDocument?: boolean }).sameDocument = true
      })

      // Removing a declaration must take effect without a reload, i.e. the
      // SSR snapshot of the old rule must not outlive the HMR update.
      await editor.replaceText(
        'css',
        '  border-top: 4px solid rgb(0, 0, 0);\n',
        '',
      )
      await expect(panel).toHaveCSS('border-top-width', '0px')
      expect(
        await page.evaluate(
          () => (window as { sameDocument?: boolean }).sameDocument,
        ),
      ).toBe(true)
    } finally {
      await editor.restoreFiles()
    }
  })

  test('are dropped when an HMR update lands before hydration finishes', async ({
    page,
  }) => {
    test.skip(viteBundledDev, 'Cannot block the route chunk in bundled dev')
    const editor = createHmrFileEditor({
      rootDir: import.meta.dirname,
      files: { css: '../src/styles/app.css' },
    })
    await editor.capturePromise

    let releaseRoute!: () => void
    const routeReleased = new Promise<void>((resolve) => {
      releaseRoute = resolve
    })
    let routeRequested!: () => void
    const routeRequestedPromise = new Promise<void>((resolve) => {
      routeRequested = resolve
    })
    // The client runtime (and its HMR listener) is up once it asks for the
    // route chunk; holding the chunk keeps HeadContent from mounting.
    await page.route(
      /\/src\/routes\/lazy-ssr\.tsx\?(?:.*&)?tsr-split=component/,
      async (route) => {
        routeRequested()
        await routeReleased
        await route.continue()
      },
    )

    try {
      await page.goto('/lazy-ssr', { waitUntil: 'domcontentloaded' })
      await routeRequestedPromise
      await page.evaluate(() => {
        ;(window as { sameDocument?: boolean }).sameDocument = true
      })
      const probe = page.getByTestId('lazy-ssr-hmr-probe')
      await expect(probe).toHaveCSS('border-top-width', '5px')

      await editor.replaceText(
        'css',
        '  border-top: 5px solid rgb(0, 0, 0);\n',
        '',
      )
      // Wait until Vite applied the update to the injected app.css.
      await expect
        .poll(() =>
          page.evaluate(() =>
            [...document.querySelectorAll('style[data-vite-dev-id]')].some(
              (style) => style.textContent?.includes('5px solid'),
            ),
          ),
        )
        .toBe(false)

      releaseRoute()
      await expect(page.getByTestId('lazy-ssr-hydrated')).toHaveAttribute(
        'data-hydrated',
        'true',
      )
      // Only the SSR snapshot still holds the removed declaration.
      await expect(probe).toHaveCSS('border-top-width', '0px')
      expect(
        await page.evaluate(
          () => (window as { sameDocument?: boolean }).sameDocument,
        ),
      ).toBe(true)
    } finally {
      releaseRoute()
      await editor.restoreFiles()
    }
  })
})
