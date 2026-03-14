import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test('Deduplicates child canonical links over parent', async ({ page }) => {
  await page.goto('/canonical/deep')
  await page.waitForURL('/canonical/deep')

  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)

  // Get all canonical links
  const links = await page.locator('link[rel="canonical"]').all()
  expect(links).toHaveLength(1)

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://example.com/canonical/deep',
  )
})
