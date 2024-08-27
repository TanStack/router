import { expect, test } from '@playwright/test'

test('Smoke - Renders home', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Welcome Home!' }),
  ).toBeVisible()
})
