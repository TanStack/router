import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { isPreview } from './utils/isPreview'
import { isSpaMode } from './utils/isSpaMode'

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
    // Capture head() execution logs to verify abort behavior
    const headLogs: Array<string> = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('[head] Setting title:')) {
        headLogs.push(text)
      }
    })

    // Setup: Login first
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('auth', 'good'))

    // CRITICAL: Wait for network idle before proceeding
    // Without this wait, clicking links immediately causes a race condition where
    // Article 2's loader runs without auth, creating stale null data that triggers
    // stale-while-revalidate, resulting in "title n/a" appearing in logs
    await page.waitForLoadState('networkidle')

    // Clear logs from initial page load
    headLogs.length = 0

    // Use client-side navigation via Link clicks (not page.goto which causes full page reload)
    // Click Article 1 link (async loader starts)
    await page.click('a:has-text("Article 1")')

    // Immediately click Article 2 link before Article 1 loader completes
    await page.waitForTimeout(100) // Small delay to ensure first navigation started
    await page.click('a:has-text("Article 2")')

    // Wait for article 2 loader to complete
    await page.waitForTimeout(1500)

    // Verify we're on article 2 with correct title (not polluted by article 1)
    await expect(page).toHaveTitle('Article Title for 2')
    await expect(page.locator('text=Article content for 2')).toBeVisible()

    // Ensure article 1 content is not present
    await expect(page.locator('text=Article content for 1')).not.toBeVisible()

    // Critical assertion: If abort worked, "Article Title for 1" should NEVER appear in logs
    // Expected logs (if abort works):
    //   1. "Article Title for 2" - article 2's head (fresh data after loader completes)
    // If abort FAILED, article 1's head would execute when its loader completes:
    //   2. "Article Title for 1" - article 1's head (SHOULD BE ABORTED)
    expect(headLogs.join('\n')).not.toContain('Article Title for 1')
    expect(headLogs).toHaveLength(1)
  })

  test('stale head re-run aborts when route invalidation happens', async ({
    page,
  }) => {
    // Capture head() execution logs to verify abort behavior
    const headLogs: Array<string> = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('[head] Setting title:')) {
        headLogs.push(text)
      }
    })

    // Setup: Login and navigate to article 1
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('auth', 'good'))
    await page.goto('/article/1')
    await page.waitForTimeout(1500)
    await expect(page).toHaveTitle('Article Title for 1')

    // Clear logs from initial navigation
    headLogs.length = 0

    // Trigger first invalidation: logout (loader returns null after 1s)
    await page.click('button:has-text("Log out")')

    // Trigger second invalidation immediately: login (before logout loader completes)
    // This should abort the logout's head re-run via generation counter
    await page.waitForTimeout(100)
    await page.click('button:has-text("Log in")')

    // Wait for both loaders to complete
    await page.waitForTimeout(1500)

    // Verify final state
    await expect(page).toHaveTitle('Article Title for 1')
    await expect(page.locator('text=Article content for 1')).toBeVisible()

    // Critical assertion: If abort worked, "title n/a" should NEVER appear in logs
    // Expected logs (if abort works):
    //   1. "Article Title for 1" - logout's 1st head (stale data)
    //   2. "Article Title for 1" - login's 1st head (stale data)
    //   3. "Article Title for 1" - login's 2nd head (fresh data)
    // If abort FAILED, logout's 2nd head would execute with null data:
    //   4. "title n/a" - logout's 2nd head (SHOULD BE ABORTED)
    expect(headLogs.join('\n')).not.toContain('title n/a')
    expect(headLogs).toHaveLength(3)
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
