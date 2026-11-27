import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import type { Page } from '@playwright/test'

/**
 * Loads an address and reports everything the page threw while getting there.
 * A hydration mismatch surfaces as an uncaught React error, so the count of
 * uncaught errors is the assertion.
 */
async function uncaughtErrorsOnLoad(page: Page, path: string) {
  const errors: Array<string> = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(path)
  await expect(page.getByTestId('root-heading')).toContainText('root')
  return errors
}

test.describe('SPA mode hydration', () => {
  test(`a prerendered page hydrates without throwing`, async ({
    page,
  }: {
    page: Page
  }) => {
    expect(await uncaughtErrorsOnLoad(page, '/posts/1')).toEqual([])
  })

  // The next two fail today: the shell leaves the route area empty inside a
  // resolved suspense boundary, and the browser draws into it on its first
  // pass whenever the route's component is already available, so React throws
  // the document away and renders it again.
  // https://github.com/TanStack/router/issues/8473
  test.fail(
    `the shell hydrates without throwing at the address it was prerendered for`,
    async ({ page }: { page: Page }) => {
      expect(await uncaughtErrorsOnLoad(page, '/')).toEqual([])
    },
  )

  test.fail(
    `the shell hydrates without throwing at an address it was not prerendered for`,
    async ({ page }: { page: Page }) => {
      expect(await uncaughtErrorsOnLoad(page, '/no-such-address')).toEqual([])
    },
  )
})
