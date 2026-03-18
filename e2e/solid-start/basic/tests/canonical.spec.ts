import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { isSpaMode } from './utils/isSpaMode'

test('Deduplicates child canonical links over parent', async ({ page }) => {
  test.skip(isSpaMode, 'Canonical link injection into <head> is not supported in SPA mode')

  await page.goto('/canonical/deep')
  await page.waitForURL('/canonical/deep')

  await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1)

  await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://example.com/canonical/deep',
  )
})
