import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'
import { createHmrFileEditor, test } from '@tanstack/router-e2e-utils'
import type { Page } from '@playwright/test'

declare global {
  interface Window {
    __hmrReloadSentinel?: string
  }
}

// HMR assertions get a generous ceiling: on a loaded CI box the client and rsc
// compilers finish on different ticks, so the DOM can lag the file write by
// seconds even when everything is working.
const hmrExpect = expect.configure({ timeout: 20_000 })

const MARKERS = {
  coLocated: 'co-located-baseline',
  cssModule: 'css-module-baseline',
  separateFile: 'separate-file-baseline',
} as const

const CSS_BASELINE_COLOR = 'rgb(10, 20, 200)'

const routeFileEditor = createHmrFileEditor({
  rootDir: fileURLToPath(new URL('..', import.meta.url)),
  files: {
    coLocated: 'src/routes/co-located.tsx',
    cssModuleRoute: 'src/routes/co-located-css-module.tsx',
    cssModuleStyles: 'src/routes/coLocatedCssModule.module.css',
    separateFile: 'src/routes/separate-file.tsx',
  },
  // A run killed mid-edit leaves a fixture dirty, which would otherwise cascade
  // into every later test. Rewrite each file back to its baseline on capture so
  // a crashed previous run is self-healing rather than poisonous.
  normalizeSource: (fileKey, source) => {
    switch (fileKey) {
      case 'coLocated':
        return source.replace(/co-located-[\w-]+</g, `${MARKERS.coLocated}<`)
      case 'cssModuleRoute':
        return source.replace(/css-module-[\w-]+</g, `${MARKERS.cssModule}<`)
      case 'separateFile':
        return source.replace(
          /separate-file-[\w-]+</g,
          `${MARKERS.separateFile}<`,
        )
      case 'cssModuleStyles':
        return source.replace(
          /color: rgb\([^)]*\);/g,
          `color: ${CSS_BASELINE_COLOR};`,
        )
      default:
        return source
    }
  },
})

test.use({
  whitelistErrors: [
    // Vite's dep optimizer can 504 a request that was in flight when it
    // re-optimizes; it retries transparently.
    'Failed to load resource: the server responded with a status of 504',
  ],
})

/**
 * Seed a client-only value that a full page reload would destroy. Asserting it
 * survives is what distinguishes Fast Refresh from a reload that merely happens
 * to render the new text.
 */
async function seedClientState(page: Page, testIdPrefix: string) {
  await page.getByTestId(`${testIdPrefix}-increment`).click()
  await page.getByTestId(`${testIdPrefix}-increment`).click()
  await expect(page.getByTestId(`${testIdPrefix}-count`)).toHaveText('Count: 2')

  await page.evaluate(() => {
    window.__hmrReloadSentinel = 'alive'
  })
}

async function expectNoReloadHappened(page: Page) {
  await expect
    .poll(() => page.evaluate(() => window.__hmrReloadSentinel), {
      timeout: 5_000,
    })
    .toBe('alive')
}

async function gotoAndWaitForHydration(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('hydrated').waitFor({ state: 'visible' })
}

test.beforeEach(async () => {
  await routeFileEditor.capturePromise
  await routeFileEditor.restoreFiles()
})

test.afterEach(async () => {
  await routeFileEditor.capturePromise
  await routeFileEditor.restoreFiles()
})

test.describe('RSC route component HMR with a co-located server function', () => {
  test('Fast Refreshes a co-located route component and preserves state', async ({
    page,
  }) => {
    await gotoAndWaitForHydration(page, '/co-located')
    await expect(page.getByTestId('co-located-server-content')).toHaveText(
      'server-rendered content',
    )
    await seedClientState(page, 'co-located')

    await routeFileEditor.replaceText(
      'coLocated',
      MARKERS.coLocated,
      'co-located-updated',
    )

    await hmrExpect(page.getByTestId('co-located-marker')).toHaveText(
      'co-located-updated',
    )
    await expect(page.getByTestId('co-located-count')).toHaveText('Count: 2')
    await expectNoReloadHappened(page)
  })

  test('Fast Refreshes when the route also imports a CSS module', async ({
    page,
  }) => {
    await gotoAndWaitForHydration(page, '/co-located-css-module')
    await seedClientState(page, 'css-module')

    await routeFileEditor.replaceText(
      'cssModuleRoute',
      MARKERS.cssModule,
      'css-module-updated',
    )

    await hmrExpect(page.getByTestId('css-module-marker')).toHaveText(
      'css-module-updated',
    )
    await expect(page.getByTestId('css-module-count')).toHaveText('Count: 2')
    await expectNoReloadHappened(page)
  })

  test('hot-swaps a CSS-module-only edit without reloading the page', async ({
    page,
  }) => {
    await gotoAndWaitForHydration(page, '/co-located-css-module')
    await expect(page.getByTestId('css-module-marker')).toHaveCSS(
      'color',
      CSS_BASELINE_COLOR,
    )
    await seedClientState(page, 'css-module')

    await routeFileEditor.replaceText(
      'cssModuleStyles',
      `color: ${CSS_BASELINE_COLOR};`,
      'color: rgb(220, 30, 40);',
    )

    await hmrExpect(page.getByTestId('css-module-marker')).toHaveCSS(
      'color',
      'rgb(220, 30, 40)',
    )
    await expect(page.getByTestId('css-module-count')).toHaveText('Count: 2')
    await expectNoReloadHappened(page)
  })

  test('Fast Refreshes a route whose server function lives in its own file', async ({
    page,
  }) => {
    await gotoAndWaitForHydration(page, '/separate-file')
    await expect(page.getByTestId('separate-file-server-content')).toHaveText(
      'server-rendered content',
    )
    await seedClientState(page, 'separate-file')

    await routeFileEditor.replaceText(
      'separateFile',
      MARKERS.separateFile,
      'separate-file-updated',
    )

    await hmrExpect(page.getByTestId('separate-file-marker')).toHaveText(
      'separate-file-updated',
    )
    await expect(page.getByTestId('separate-file-count')).toHaveText('Count: 2')
    await expectNoReloadHappened(page)
  })
})
