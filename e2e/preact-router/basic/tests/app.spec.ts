import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('shows suspense fallback and then resolved content', async ({ page }) => {
  await expect(page.getByTestId('home')).toBeVisible()

  await page.getByRole('link', { name: 'Slow' }).click()
  await expect(page.getByTestId('slow-title')).toBeVisible()
  await expect(page.getByTestId('suspense-fallback')).toBeVisible()
  await expect(page.getByTestId('suspense-content')).toHaveText('Loaded!')
})
