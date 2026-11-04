import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test('account and products link to each other', async ({ page }) => {
  await page.goto('/account')
  await page.getByRole('link', { name: 'Last viewed product' }).click()
  await expect(page).toHaveURL('/shop/products/last-viewed?tab=reviews')
  await page.getByRole('link', { name: 'All products' }).click()
  await page.getByRole('link', { name: 'My last order' }).click()
  await expect(page).toHaveURL('/account/orders/1')
})
