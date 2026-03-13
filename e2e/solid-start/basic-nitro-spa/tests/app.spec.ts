import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

test('SPA shell is prerendered during build with nitro', async ({ page }) => {
  const outputDir = join(process.cwd(), '.output', 'public')
  expect(existsSync(join(outputDir, 'index.html'))).toBe(true)

  await page.goto('/')
  await expect(page.getByTestId('home-heading')).toBeVisible()
})

test('server functions work with nitro', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('home-heading')).toHaveText('Welcome Home!')
  await expect(page.getByTestId('message')).toHaveText(
    'Hello from Nitro server!',
  )
})

test('client-side navigation works in SPA mode', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('home-heading')).toBeVisible()

  await page.click('a[href="/static"]')
  await expect(page.getByTestId('static-heading')).toBeVisible()

  await page.click('a[href="/"]')
  await expect(page.getByTestId('home-heading')).toBeVisible()
})
