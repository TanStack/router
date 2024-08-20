import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

test('loads', async ({ page }) => {
  await page.goto('http://localhost:3000')
})
