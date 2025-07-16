import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test.describe('Unicode route rendering', () => {
  test('should render non-latin route correctly', async ({ page, baseURL }) => {
    await page.goto('/대한민국')

    await expect(page.locator('body')).toContainText('Hello "/대한민국"!')

    expect(page.url()).toBe(`${baseURL}/%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD`)
  })
})
