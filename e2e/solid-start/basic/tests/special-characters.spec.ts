import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { isPrerender } from './utils/isPrerender'

test.use({
  whitelistErrors: [
    /Failed to load resource: the server responded with a status of 404/,
  ],
})
test.describe('Unicode route rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/specialChars')
  })

  test('should render non-latin route correctly with direct navigation', async ({
    page,
    baseURL,
  }) => {
    await page.goto('/specialChars/대한민국')
    await page.waitForURL(
      `${baseURL}/specialChars/%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD${isPrerender ? '/' : ''}`,
    )

    await expect(page.getByTestId('special-non-latin-heading')).toBeInViewport()
  })

  test('should render non-latin route correctly during router navigation', async ({
    page,
    baseURL,
  }) => {
    const nonLatinLink = page.getByTestId('special-non-latin-link')

    await nonLatinLink.click()
    await page.waitForURL(
      `${baseURL}/specialChars/%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD`,
    )

    await expect(page.getByTestId('special-non-latin-heading')).toBeInViewport()
  })

  test.describe('Special characters in path params', () => {
    test('should render route correctly on direct navigation', async ({
      page,
      baseURL,
    }) => {
      await page.goto('/specialChars/대|')
      await page.waitForURL(`${baseURL}/specialChars/%EB%8C%80%7C`)

      const param = await page.getByTestId('special-param').textContent()

      expect(param).toBe('대|')
    })

    test('should render route correctly on router navigation', async ({
      page,
      baseURL,
    }) => {
      const link = page.getByTestId('special-param-link')

      await link.click()
      await page.waitForURL(`${baseURL}/specialChars/%EB%8C%80%7C`)

      const param = await page.getByTestId('special-param').textContent()

      expect(param).toBe('대|')
    })
  })

  test.describe('Special characters in search params', () => {
    test('should render route correctly on direct navigation', async ({
      page,
      baseURL,
    }) => {
      await page.goto('/specialChars/search?searchParam=대|')

      await page.waitForURL(
        `${baseURL}/specialChars/search?searchParam=%EB%8C%80|`,
      )

      const searchParam = await page
        .getByTestId('special-search-param')
        .textContent()

      expect(searchParam).toBe('대|')
    })

    test('should render route correctly on router navigation', async ({
      page,
      baseURL,
    }) => {
      const link = page.getByTestId('special-searchParam-link')

      await link.click()
      await page.waitForURL(
        `${baseURL}/specialChars/search?searchParam=%EB%8C%80%7C`,
      )

      const searchParam = await page
        .getByTestId('special-search-param')
        .textContent()

      expect(searchParam).toBe('대|')
    })
  })
})
