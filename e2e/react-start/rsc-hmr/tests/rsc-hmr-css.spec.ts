import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'
import { createHmrFileEditor, test } from '@tanstack/router-e2e-utils'
import { waitForHydration } from './hydration'

declare global {
  interface Window {
    __cssHmrDocument?: boolean
  }
}

type CssCase = {
  label: string
  route: string
  titleTestId: string
  cssFile: 'modules' | 'global'
}

const cases: Array<CssCase> = [
  {
    label: '.module.css',
    route: '/rsc-hmr-css-modules',
    titleTestId: 'rsc-hmr-modules-title',
    cssFile: 'modules',
  },
  {
    label: 'global .css',
    route: '/rsc-hmr-global-css',
    titleTestId: 'rsc-hmr-global-title',
    cssFile: 'global',
  },
]

const editor = createHmrFileEditor({
  rootDir: fileURLToPath(new URL('..', import.meta.url)),
  files: {
    modules: 'src/utils/CssModulesCard.module.css',
    global: 'src/utils/GlobalCssCard.css',
  },
  normalizeSource: (_key, source) =>
    source
      .replace(/color: rgb\([^)]*\);/g, 'color: rgb(128, 0, 128);')
      .replace('/* removed text-transform */', 'text-transform: uppercase;'),
})

async function editCss(c: CssCase, updater: (source: string) => string) {
  await editor.rewriteFile(c.cssFile, updater)
}

test.describe('rsc css hmr', () => {
  test.beforeEach(async () => {
    await editor.capturePromise
    await editor.restoreFiles()
  })

  test.afterEach(async ({ page }) => {
    try {
      expect(await page.evaluate(() => window.__cssHmrDocument)).toBe(true)
    } finally {
      await editor.capturePromise
      await editor.restoreFiles()
    }
  })

  for (const c of cases) {
    test(`${c.label}: a css change hot-updates the style`, async ({ page }) => {
      await page.goto(c.route)
      await waitForHydration(page)
      await page.evaluate(() => {
        window.__cssHmrDocument = true
      })

      await expect(page.getByTestId(c.titleTestId)).toHaveCSS(
        'color',
        'rgb(128, 0, 128)',
      )

      await editCss(c, (source) =>
        source.replace('rgb(128, 0, 128)', 'rgb(255, 0, 0)'),
      )

      await expect(page.getByTestId(c.titleTestId)).toHaveCSS(
        'color',
        'rgb(255, 0, 0)',
      )
    })

    test(`${c.label}: a second css change in the same file hot-updates the style`, async ({
      page,
    }) => {
      await page.goto(c.route)
      await waitForHydration(page)
      await page.evaluate(() => {
        window.__cssHmrDocument = true
      })

      await expect(page.getByTestId(c.titleTestId)).toHaveCSS(
        'color',
        'rgb(128, 0, 128)',
      )
      const stylesheets = page.locator('link[rel="stylesheet"], style')
      const stylesheetCount = await stylesheets.count()

      await editCss(c, (source) =>
        source.replace('rgb(128, 0, 128)', 'rgb(255, 0, 0)'),
      )
      await expect(page.getByTestId(c.titleTestId)).toHaveCSS(
        'color',
        'rgb(255, 0, 0)',
      )

      await editCss(c, (source) =>
        source.replace('rgb(255, 0, 0)', 'rgb(0, 0, 255)'),
      )
      await expect(page.getByTestId(c.titleTestId)).toHaveCSS(
        'color',
        'rgb(0, 0, 255)',
      )
      await expect(stylesheets).toHaveCount(stylesheetCount)
    })

    test(`${c.label}: removing a css property hot-updates the style`, async ({
      page,
    }) => {
      await page.goto(c.route)
      await waitForHydration(page)
      await page.evaluate(() => {
        window.__cssHmrDocument = true
      })

      await expect(page.getByTestId(c.titleTestId)).toHaveCSS(
        'text-transform',
        'uppercase',
      )

      await editCss(c, (source) =>
        source.replace(
          'text-transform: uppercase;',
          '/* removed text-transform */',
        ),
      )

      await expect(page.getByTestId(c.titleTestId)).toHaveCSS(
        'text-transform',
        'none',
      )
    })
  }
})
