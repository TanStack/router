import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test('modules that use each other link in both directions', async ({
  page,
}) => {
  await page.goto('/account')
  await page.getByRole('link', { name: 'Last viewed product' }).click()
  await expect(page).toHaveURL('/shop/products/last-viewed?tab=reviews')
  await page.getByRole('link', { name: 'All products' }).click()
  await expect(page).toHaveURL('/shop/products')
  await page.getByRole('link', { name: 'My last order' }).click()
  await expect(page).toHaveURL('/account/orders/1')
})

test('a module links into the module that mounts it', async ({ page }) => {
  await page.goto('/shop/products')
  await page.getByRole('link', { name: 'Go to cart' }).click()
  await expect(page).toHaveURL('/shop/cart')
  await expect(page.getByRole('heading')).toHaveText('Cart')
})
