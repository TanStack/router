import { expect } from '@playwright/test'
import { collectBrowserErrors, test } from '@tanstack/router-e2e-utils'

test.describe('pending component hydration', () => {
  test('data-only route hydrates from pending element to loaded state on first load', async ({
    page,
  }) => {
    const browserErrors = collectBrowserErrors(page)

    await page.goto('/mre-data-only')

    await expect(page).toHaveURL(/mre-data-only/)

    await expect(page.getByTestId('mre-data-only-pending')).toBeAttached()

    await expect(page.getByTestId('mre-data-only-ready-label')).toHaveText(
      'OK - loader finished',
      { timeout: 10_000 },
    )

    expect(browserErrors).toEqual([])
    expect(browserErrors).not.toContainEqual(
      expect.stringContaining('template is not a function'),
    )
    expect(browserErrors).not.toContainEqual(
      expect.stringContaining('Hydration Mismatch'),
    )
  })
})
