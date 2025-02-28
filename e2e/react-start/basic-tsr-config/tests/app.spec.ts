import { expect, test } from '@playwright/test'

test('opening the app', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('Add 1 to 0?')).toContainText('Add 1 to 0?')
  await page.click('button')
  await expect(page.getByText('Add 1 to 1?')).toContainText('Add 1 to 1?')
})
