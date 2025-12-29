import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { isSpaMode } from './utils/isSpaMode'
import { isPreview } from './utils/isPreview'

// Skip SPA and preview modes - routes with ssr:false don't execute head() in these modes
test.skip(
  isSpaMode || isPreview,
  "Head function tests require SSR (ssr:false routes don't execute head() in SPA/preview)",
)

test.describe('head() function with async loaders', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
  })

  test('head() receives fresh loaderData after async loader completes', async ({
    page,
  }) => {
    // Navigate to home and login
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('auth', 'good'))

    // Navigate to article 1
    await page.goto('/article/1')

    // Wait for loader to complete and check title
    await page.waitForTimeout(1500) // Wait for 1s loader + buffer
    await expect(page).toHaveTitle('Article Title for 1')

    // Verify content is shown
    await expect(page.locator('text=Article content for 1')).toBeVisible()
  })

  test('stale head re-run aborts when navigation to different article happens', async ({
    page,
  }) => {
    // Login first
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('auth', 'good'))

    // Navigate to article 1 (async loader starts)
    const nav1 = page.goto('/article/1')

    // Immediately navigate to article 2 before article 1 loader completes
    await page.waitForTimeout(100) // Small delay to ensure first nav started
    await page.goto('/article/2')

    // Wait for navigation to complete
    await nav1.catch(() => {}) // First navigation might be cancelled

    // Wait for article 2 loader to complete
    await page.waitForTimeout(1500)

    // Verify we're on article 2 with correct title (not polluted by article 1)
    await expect(page).toHaveTitle('Article Title for 2')
    await expect(page.locator('text=Article content for 2')).toBeVisible()

    // Ensure article 1 content is not present
    await expect(page.locator('text=Article content for 1')).not.toBeVisible()
  })

  test('stale head re-run aborts when route invalidation happens', async ({
    page,
  }) => {
    // Login and navigate to article 1
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('auth', 'good'))
    await page.goto('/article/1')

    // Wait for initial load to complete
    await page.waitForTimeout(1500)
    await expect(page).toHaveTitle('Article Title for 1')

    // Logout (triggers invalidation)
    await page.click('button:has-text("Log out")')

    // Small delay
    await page.waitForTimeout(100)

    // Login again immediately (triggers another invalidation before first completes)
    await page.click('button:has-text("Log in")')

    // Wait for loaders to complete
    await page.waitForTimeout(1500)

    // Should show logged-in state with correct title (not "title n/a" from logout state)
    await expect(page).toHaveTitle('Article Title for 1')
    await expect(page.locator('text=Article content for 1')).toBeVisible()

    // Should not show "not accessible" state
    await expect(page.locator('text=Article Not Accessible')).not.toBeVisible()
  })

  test('head() shows fallback title when not authenticated', async ({
    page,
  }) => {
    // Navigate without logging in
    await page.goto('/article/1')

    // Wait for loader to complete
    await page.waitForTimeout(1500)

    // Should show fallback title since loader returns null
    await expect(page).toHaveTitle('title n/a')

    // Should show not accessible message
    await expect(page.locator('text=Article Not Accessible')).toBeVisible()
  })

  test('rapid navigation between articles shows correct final title', async ({
    page,
  }) => {
    // Login
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('auth', 'good'))

    // Rapidly navigate: 1 -> 2 -> 1 -> 2
    await page.goto('/article/1')
    await page.waitForTimeout(100)

    await page.goto('/article/2')
    await page.waitForTimeout(100)

    await page.goto('/article/1')
    await page.waitForTimeout(100)

    await page.goto('/article/2')

    // Wait for final loader to complete
    await page.waitForTimeout(1500)

    // Should show article 2 title (final navigation)
    await expect(page).toHaveTitle('Article Title for 2')
    await expect(page.locator('text=Article content for 2')).toBeVisible()
  })

  test('head() updates when using navigation links', async ({ page }) => {
    // Login
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('auth', 'good'))

    // Click Article 1 link
    await page.click('a:has-text("Article 1")')
    await page.waitForTimeout(1500)
    await expect(page).toHaveTitle('Article Title for 1')

    // Click Article 2 link
    await page.click('a:has-text("Article 2")')
    await page.waitForTimeout(1500)
    await expect(page).toHaveTitle('Article Title for 2')

    // Click Home link
    await page.click('a:has-text("Home")')
    await expect(page).toHaveTitle('TanStack Router Head Function Test')
  })
})
