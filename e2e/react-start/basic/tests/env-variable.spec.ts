import { expect, test } from '@playwright/test'

test('Ability to access env variable', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('DATABASE_URL: test123')).toBeVisible()
})
