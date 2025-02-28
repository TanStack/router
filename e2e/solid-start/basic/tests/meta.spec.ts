import { expect, test } from '@playwright/test'

test('Should change title on client side navigation', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('link', { name: 'Posts' }).click()

  await expect(page).toHaveTitle('Posts page')
})
