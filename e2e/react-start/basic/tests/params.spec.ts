import { expect } from '@playwright/test'

import { test } from '@tanstack/router-e2e-utils'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test.use({
  whitelistErrors: [
    /Failed to load resource: the server responded with a status of 404/,
  ],
})
test.describe('Unicode route rendering', () => {
  test('should render non-latin route correctly', async ({ page, baseURL }) => {
    await page.goto('/대한민국')

    await expect(page.locator('body')).toContainText('Hello "/대한민국"!')

    expect(page.url()).toBe(`${baseURL}/%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD`)
  })
})
