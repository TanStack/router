import { expect } from '@playwright/test'

import { test } from '@tanstack/router-e2e-utils'

test('encodes pipe character in href for param link', async ({ page }) => {
  await page.goto('/pipe/hello|world')

  await expect(page.locator('body')).toContainText('Hello hello|world!')
})

test('direct navigation keeps encoded url after reload', async ({
  page,
  baseURL,
}) => {
  await page.goto('/pipe/hello|world')

  await expect(page.locator('body')).toContainText('Hello hello|world!')
  expect(page.url()).toBe(`${baseURL}/pipe/hello%7Cworld`)

  await page.reload()

  await expect(page.locator('body')).toContainText('Hello hello|world!')
  expect(page.url()).toBe(`${baseURL}/pipe/hello%7Cworld`)
})
