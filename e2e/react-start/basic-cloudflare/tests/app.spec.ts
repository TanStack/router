import { expect } from '@playwright/test'

import { test } from '@tanstack/router-e2e-utils'

test('returns correct user agent', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('paragraph')).toContainText('Running in Node.js')
})
