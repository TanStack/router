import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { isSpaMode } from './utils/isSpaMode'

test.describe('hydrate false route behavior', () => {
  test.skip(isSpaMode, 'hydrate false is SSR-only behavior')

  test('excludes hydration payload and client entry assets', async ({
    page,
  }) => {
    await page.goto('/hydrate-false')

    await expect(page.getByTestId('hydrate-false-heading')).toBeVisible()

    const html = await page.content()

    expect(html).not.toContain('window.$_TSR')
    expect(html).not.toContain('data-tsr-client-entry')
    expect(html).not.toContain('virtual:tanstack-start-client-entry')
    expect(html).not.toContain('rel="modulepreload"')
    expect(html).toContain('hydrate false route rendered on server')

    await expect(page).toHaveTitle('Hydrate False Route')

    const description = await page
      .locator('meta[name="description"]')
      .getAttribute('content')
    expect(description).toBe('hydrate false e2e route')

    expect(await page.evaluate('window.HYDRATE_FALSE_INLINE_SCRIPT')).toBe(true)
  })

  test('keeps hydrated control route interactive', async ({ page }) => {
    await page.goto('/hydrate-true')

    await expect(page.getByTestId('hydrate-true-heading')).toBeVisible()
    await expect(page.getByTestId('hydrate-true-count')).toHaveText('0')

    await page.getByTestId('hydrate-true-increment').click()
    await expect(page.getByTestId('hydrate-true-count')).toHaveText('1')
  })
})
