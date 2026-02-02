import { expect } from '@playwright/test'
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
  // This prevents "optimized dependencies changed. reloading" during actual tests
  // We use a real browser context since dep optimization happens on JS load, not HTTP requests
  test.beforeAll(async ({ browser, baseURL }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      // Load both pages to trigger dependency optimization
      await page.goto(baseURL!)
      await page.waitForTimeout(2000) // Wait for deps to optimize
      await page.goto(`${baseURL}/modules`)
      await page.waitForTimeout(2000)
      // Load again after optimization completes
      await page.goto(baseURL!)
      await page.waitForTimeout(1000)
    } catch {
      // Ignore errors during warmup
    } finally {
      await context.close()
    }
  })

  // Helper to build full URL from baseURL and path
  // Playwright's goto with absolute paths (like '/modules') ignores baseURL's path portion
  // So we need to manually construct the full URL
  const buildUrl = (baseURL: string, path: string) => {
    return baseURL.replace(/\/$/, '') + path
  }

  test.describe('with JavaScript disabled', () => {
    test.use({ javaScriptEnabled: false, whitelistErrors })

    test('global CSS is applied on initial page load', async ({
      page,
      baseURL,
    }) => {
      await page.goto(buildUrl(baseURL!, '/'))

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

    test('CSS modules are applied on initial page load', async ({
      page,
      baseURL,
    }) => {
      await page.goto(buildUrl(baseURL!, '/modules'))

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

    test('global CSS class names are NOT scoped', async ({ page, baseURL }) => {
      await page.goto(buildUrl(baseURL!, '/'))

      const element = page.getByTestId('global-styled')
      await expect(element).toBeVisible()

      // Get the class attribute - it should be the plain class name (not hashed)
      const className = await element.getAttribute('class')
      expect(className).toBe('global-container')
    })

    test('Sass mixin styles are applied on initial page load', async ({
      page,
      baseURL,
    }) => {
      await page.goto(buildUrl(baseURL!, '/sass-mixin'))

      const element = page.getByTestId('mixin-styled')
      await expect(element).toBeVisible()

      // Verify the mixin is applied (display: flex from center-mixin)
      const display = await element.evaluate(
        (el) => getComputedStyle(el).display,
      )
      expect(display).toBe('flex')

      const justifyContent = await element.evaluate(
        (el) => getComputedStyle(el).justifyContent,
      )
      expect(justifyContent).toBe('center')

      const alignItems = await element.evaluate(
        (el) => getComputedStyle(el).alignItems,
      )
      expect(alignItems).toBe('center')

      // Verify other styles from mixin-consumer.scss
      // #a855f7 (purple-500) in RGB is rgb(168, 85, 247)
      const backgroundColor = await element.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      )
      expect(backgroundColor).toBe('rgb(168, 85, 247)')

      const padding = await element.evaluate(
        (el) => getComputedStyle(el).padding,
      )
      expect(padding).toBe('24px')
    })

    test('CSS with quoted content is fully extracted', async ({
      page,
      baseURL,
    }) => {
      await page.goto(buildUrl(baseURL!, '/quotes'))

      // Verify the element using CSS with content:"..." is styled
      const quoteElement = page.getByTestId('quote-styled')
      await expect(quoteElement).toBeVisible()

      // #ef4444 (red-500) in RGB is rgb(239, 68, 68)
      const quoteBackgroundColor = await quoteElement.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      )
      expect(quoteBackgroundColor).toBe('rgb(239, 68, 68)')

      // Verify styles AFTER the quoted content are also extracted
      // This is the key test - the regex bug would cut off CSS at the first quote
      const afterQuoteElement = page.getByTestId('after-quote-styled')
      await expect(afterQuoteElement).toBeVisible()

      // #f59e0b (amber-500) in RGB is rgb(245, 158, 11)
      const afterQuoteBackgroundColor = await afterQuoteElement.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      )
      expect(afterQuoteBackgroundColor).toBe('rgb(245, 158, 11)')
    })
  })

  test('styles persist after hydration', async ({ page, baseURL }) => {
    await page.goto(buildUrl(baseURL!, '/'))

    // Wait for hydration and styles to be applied
    const element = page.getByTestId('global-styled')
    await expect(element).toBeVisible()

    // Wait for CSS to be applied (background color should not be transparent)
    await expect(async () => {
      const backgroundColor = await element.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      )
      expect(backgroundColor).toBe('rgb(59, 130, 246)')
    }).toPass({ timeout: 5000 })
  })

  test('CSS modules styles persist after hydration', async ({
    page,
    baseURL,
  }) => {
    await page.goto(buildUrl(baseURL!, '/modules'))

    // Wait for hydration and styles to be applied
    const card = page.getByTestId('module-card')
    await expect(card).toBeVisible()

    // Wait for CSS to be applied (background color should not be transparent)
    await expect(async () => {
      const backgroundColor = await card.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      )
      expect(backgroundColor).toBe('rgb(240, 253, 244)')
    }).toPass({ timeout: 5000 })
  })

  test('styles work correctly after client-side navigation', async ({
    page,
    baseURL,
  }) => {
    // Start from home
    await page.goto(buildUrl(baseURL!, '/'))

    // Verify initial styles with retry to handle potential Vite dep optimization reload
    const globalElement = page.getByTestId('global-styled')
    await expect(async () => {
      await expect(globalElement).toBeVisible()
      const backgroundColor = await globalElement.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      )
      expect(backgroundColor).toBe('rgb(59, 130, 246)')
    }).toPass({ timeout: 10000 })

    // Navigate to modules page
    await page.getByTestId('nav-modules').click()
    // Use glob pattern to match with or without basepath
    await page.waitForURL('**/modules')

    // Verify CSS modules styles with retry to handle potential Vite dep optimization reload
    const card = page.getByTestId('module-card')
    await expect(async () => {
      await expect(card).toBeVisible()
      const backgroundColor = await card.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      )
      expect(backgroundColor).toBe('rgb(240, 253, 244)')
    }).toPass({ timeout: 10000 })

    // Navigate back to home
    await page.getByTestId('nav-home').click()
    // Match home URL with or without trailing slash and optional query string
    // Matches: /, /?, /my-app, /my-app/, /my-app?foo=bar
    await page.waitForURL(/\/([^/]*)(\/)?($|\?)/)

    // Verify global styles still work with retry
    await expect(async () => {
      await expect(globalElement).toBeVisible()
      const backgroundColor = await globalElement.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      )
      expect(backgroundColor).toBe('rgb(59, 130, 246)')
    }).toPass({ timeout: 10000 })
  })
})
