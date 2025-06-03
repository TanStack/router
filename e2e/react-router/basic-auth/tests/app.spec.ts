import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
})

test('Navigate immediately before invalidating context, multiple times', async ({ page }) => {
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('heading')).toContainText('Dashboard')
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page.getByRole('heading')).toContainText('Login')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('heading')).toContainText('Dashboard')
})
