import { expect, request } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

// Whitelist errors that can occur in CI:
// - net::ERR_NAME_NOT_RESOLVED: transient network issues
// - 504 (Outdated Optimize Dep): Vite dependency optimization reload
const whitelistErrors = [
  'Failed to load resource: net::ERR_NAME_NOT_RESOLVED',
  'Failed to load resource: the server responded with a status of 504',
]

test.describe('CSS styles in SSR (dev mode)', () => {
  test.use({ whitelistErrors })

  // Warmup: trigger Vite's dependency optimization before running tests
  // This prevents "504 (Outdated Optimize Dep)" errors during actual tests
  test.beforeAll(async ({ baseURL }) => {
    const context = await request.newContext()
    try {
      // Hit both pages to trigger any dependency optimization
      await context.get(baseURL!)
      await context.get(`${baseURL}/modules`)
      // Give Vite time to complete optimization
      await new Promise((resolve) => setTimeout(resolve, 1000))
      // Hit again after optimization
      await context.get(baseURL!)
    } catch {
      // Ignore errors during warmup
    } finally {
      await context.dispose()
    }
  })

  test.describe('with JavaScript disabled', () => {
    test.use({ javaScriptEnabled: false, whitelistErrors })

    test('global CSS is applied on initial page load', async ({ page }) => {
      await page.goto('/')

      const element = page.getByTestId('global-styled')
      await expect(element).toBeVisible()

      // Verify the CSS is applied by checking computed styles
      // #3b82f6 (blue-500) in RGB is rgb(59, 130, 246)
      const backgroundColor = await element.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      )
      expect(backgroundColor).toBe('rgb(59, 130, 246)')

      const padding = await element.evaluate(
        (el) => getComputedStyle(el).padding,
      )
      expect(padding).toBe('24px')

      const borderRadius = await element.evaluate(
        (el) => getComputedStyle(el).borderRadius,
      )
      expect(borderRadius).toBe('12px')
    })

    test('CSS modules are applied on initial page load', async ({ page }) => {
      await page.goto('/modules')

      const card = page.getByTestId('module-card')
      await expect(card).toBeVisible()

      // Verify class is scoped (hashed)
      const className = await card.getAttribute('class')
      expect(className).toBeTruthy()
      expect(className).not.toBe('card')
      // The class should contain some hash characters (CSS modules add a hash)
      expect(className!.length).toBeGreaterThan(5)

      // Verify computed styles from card.module.css
      // #f0fdf4 (green-50) in RGB is rgb(240, 253, 244)
      const backgroundColor = await card.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      )
      expect(backgroundColor).toBe('rgb(240, 253, 244)')

      const padding = await card.evaluate((el) => getComputedStyle(el).padding)
      expect(padding).toBe('16px')

      const borderRadius = await card.evaluate(
        (el) => getComputedStyle(el).borderRadius,
      )
      expect(borderRadius).toBe('8px')
    })

    test('global CSS class names are NOT scoped', async ({ page }) => {
      await page.goto('/')

      const element = page.getByTestId('global-styled')
      await expect(element).toBeVisible()

      // Get the class attribute - it should be the plain class name (not hashed)
      const className = await element.getAttribute('class')
      expect(className).toBe('global-container')
    })
  })

  test('styles persist after hydration', async ({ page }) => {
    await page.goto('/')

    // Wait for hydration
    await page.waitForTimeout(1000)

    const element = page.getByTestId('global-styled')
    const backgroundColor = await element.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    )
    expect(backgroundColor).toBe('rgb(59, 130, 246)')
  })

  test('CSS modules styles persist after hydration', async ({ page }) => {
    await page.goto('/modules')

    // Wait for hydration
    await page.waitForTimeout(1000)

    const card = page.getByTestId('module-card')
    const backgroundColor = await card.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    )
    expect(backgroundColor).toBe('rgb(240, 253, 244)')
  })

  test('styles work correctly after client-side navigation', async ({
    page,
  }) => {
    // Start from home
    await page.goto('/')
    await page.waitForTimeout(1000)

    // Verify initial styles
    const globalElement = page.getByTestId('global-styled')
    await expect(globalElement).toBeVisible()
    let backgroundColor = await globalElement.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    )
    expect(backgroundColor).toBe('rgb(59, 130, 246)')

    // Navigate to modules page
    await page.getByTestId('nav-modules').click()
    await page.waitForURL('/modules')

    // Verify CSS modules styles
    const card = page.getByTestId('module-card')
    await expect(card).toBeVisible()
    backgroundColor = await card.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    )
    expect(backgroundColor).toBe('rgb(240, 253, 244)')

    // Navigate back to home
    await page.getByTestId('nav-home').click()
    // Match home URL with or without trailing slash and optional query string
    // Matches: /, /?, /my-app, /my-app/, /my-app?foo=bar
    await page.waitForURL(/\/([^/]*)(\/)?($|\?)/)

    // Verify global styles still work
    await expect(globalElement).toBeVisible()
    backgroundColor = await globalElement.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    )
    expect(backgroundColor).toBe('rgb(59, 130, 246)')
  })
})
