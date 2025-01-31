import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('should load', async ({ page }) => {
  await expect(page.getByRole('heading')).toContainText('Welcome Home!')
})
