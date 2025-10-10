import { expect } from '@playwright/test'

import { test } from '@tanstack/router-e2e-utils'

test.use({
  whitelistErrors: [
    /Failed to load resource: the server responded with a status of 404/,
  ],
})

test('Custom identifier prefix', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('tested-element')).toContainText('myapp')
})
