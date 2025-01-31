import { expect } from '@playwright/test'

import { test } from './fixture'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('should load', async ({ page }) => {
  await expect(page.getByRole('heading')).toContainText('Welcome Home!')
})
