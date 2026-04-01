import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test.describe('pending component hydration', () => {
  test('data-only route hydrates from pending element to loaded state on first load', async ({
    page,
  }) => {
    const browserErrors: string[] = []

    page.on('pageerror', (error) => {
      browserErrors.push(error.message)
    })

    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        browserErrors.push(message.text())
      }
    })

    await page.goto('/mre-data-only')

    await expect(page.getByTestId('mre-data-only-ready-label')).toHaveText(
      'OK — loader finished',
      { timeout: 5_000 },
    )

    expect(browserErrors).not.toContainEqual(
      expect.stringContaining('template is not a function'),
    )
    expect(browserErrors).not.toContainEqual(
      expect.stringContaining('Hydration Mismatch'),
    )
  })
})
