import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test('returns the correct user agent', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('p').nth(0)).toHaveText(
    'Running in Cloudflare-Workers',
  )
})

test('returns the correct value from a Cloudflare binding', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page.locator('p').nth(1)).toHaveText('Hello from Cloudflare')
})
