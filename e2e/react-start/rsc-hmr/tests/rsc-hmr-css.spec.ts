import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { waitForHydration } from './hydration'

type CssCase = {
  label: string
  route: string
  titleTestId: string
  cssFile: string
}

const cases: Array<CssCase> = [
  {
    label: '.module.css',
    route: '/rsc-hmr-css-modules',
    titleTestId: 'rsc-hmr-modules-title',
    cssFile: path.join(process.cwd(), 'src/utils/CssModulesCard.module.css'),
  },
  {
    label: 'global .css',
    route: '/rsc-hmr-global-css',
    titleTestId: 'rsc-hmr-global-title',
    cssFile: path.join(process.cwd(), 'src/utils/GlobalCssCard.css'),
  },
]

const originalContents: Record<string, string> = {}

async function captureOriginals() {
  for (const c of cases) {
    originalContents[c.cssFile] = await readFile(c.cssFile, 'utf8')
  }
}

const capturePromise = captureOriginals()

async function restoreOriginals() {
  for (const c of cases) {
    const original = originalContents[c.cssFile]
    if (original === undefined) continue
    const current = await readFile(c.cssFile, 'utf8')
    if (current !== original) {
      await writeFile(c.cssFile, original)
    }
  }
}

async function editCss(c: CssCase, updater: (source: string) => string) {
  const source = await readFile(c.cssFile, 'utf8')
  const updated = updater(source)
  if (updated === source) {
    throw new Error(`Expected ${c.cssFile} to change during edit`)
  }
  await writeFile(c.cssFile, updated)
}

test.describe('rsc css hmr', () => {
  test.beforeEach(async () => {
    await capturePromise
    await restoreOriginals()
  })

  test.afterAll(async () => {
    await capturePromise
    await restoreOriginals()
  })

  for (const c of cases) {
    test(`${c.label}: a css change hot-updates the style`, async ({ page }) => {
      await page.goto(c.route)
      await waitForHydration(page)

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
    })

    test(`${c.label}: removing a css property hot-updates the style`, async ({
      page,
    }) => {
      await page.goto(c.route)
      await waitForHydration(page)

      await expect(page.getByTestId(c.titleTestId)).toHaveCSS(
        'text-transform',
        'uppercase',
      )

      await editCss(c, (source) =>
        source.replace('text-transform: uppercase;', ''),
      )

      await expect(page.getByTestId(c.titleTestId)).toHaveCSS(
        'text-transform',
        'none',
      )
    })
  }
})
