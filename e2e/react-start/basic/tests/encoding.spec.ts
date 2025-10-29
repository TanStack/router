import { expect } from '@playwright/test'

import { test } from '@tanstack/router-e2e-utils'
import combinateImport from 'combinate'

// somehow playwright does not correctly import default exports
const combinate = (combinateImport as any).default as typeof combinateImport

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test.use({
  whitelistErrors: [
    /Failed to load resource: the server responded with a status of 404/,
  ],
})

combinate
test.describe('link active', () => {
  const testMatrix = combinate({
    target: ['ê', 'hello'] as const,
    search: [undefined, { foo: 'bar' }, { foo: 'ö' }] as const,
  })

  testMatrix.forEach(({ target, search }) => {
    test(`should correctly highlight active link for $target=${target} and search=${JSON.stringify(search)}`, async ({
      page,
    }) => {
      const url = new URL(
        `/encoding/link-active/${target}`,
        'http://localhost:3000',
      )
      if (search) {
        Object.entries(search).forEach(([key, value]) => {
          url.searchParams.set(key, value)
        })
      }
      const hrefWithoutOrigin = url.href.replace(url.origin, '')
      await page.goto(hrefWithoutOrigin)
      const link = page.getByTestId('self-link')
      await expect(link).toBeInViewport()
      await expect(link).toHaveAttribute('class', 'font-bold')
      await expect(link).toHaveAttribute('data-status', 'active')
    })
  })
})
