import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { isSpaMode } from './utils/isSpaMode'

for (const navigation of ['direct', 'client'] as const) {
  test(`loader values retain their types after ${navigation} navigation`, async ({
    page,
    request,
  }) => {
    if (navigation === 'direct') {
      const response = await request.get('/loader-serialization')
      expect(response.status()).toBe(200)
      if (!isSpaMode) {
        const html = await response.text()
        expect(html).toContain('Serializable loader data')
        expect(html).toContain('9007199254740994')
        expect(html).toContain('2026-01-02T03:04:05.000Z')
      }
      await page.goto('/loader-serialization')
    } else {
      await page.goto('/')
      await page.evaluate(() => {
        document.documentElement.dataset.navigationTest = 'same-document'
      })
      await page
        .getByRole('link', { name: 'Loader serialization', exact: true })
        .click()
      await expect(page.locator('html')).toHaveAttribute(
        'data-navigation-test',
        'same-document',
      )
    }
    await expect(page.getByTestId('date')).toHaveText(
      '2026-01-02T03:04:05.000Z',
    )
    await expect(page.getByTestId('map')).toHaveText('TypeScript')
    await expect(page.getByTestId('set')).toHaveText('react, start')
    await expect(page.getByTestId('bigint')).toHaveText('9007199254740994')
    await expect(page.getByTestId('optional')).toHaveText('absent')
    await page.getByRole('button', { name: 'Count: 0', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Count: 1', exact: true }),
    ).toBeVisible()
  })
}
