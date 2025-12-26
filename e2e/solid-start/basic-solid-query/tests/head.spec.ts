import { expect, test } from '@playwright/test'

test.describe('head() function with async loaders and back navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Clear auth state before each test
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
  })

  test('page title updates correctly when navigating back after login', async ({
    page,
  }) => {
    // Step 1: Visit article while unauthenticated
    await page.goto('/test-head/article/123')

    // Should show "Article Not Found" content and title
    await expect(page.getByTestId('article-not-found')).toBeVisible()
    await expect(page).toHaveTitle('Article Not Found')

    // Step 2: Click login link
    await page.getByTestId('go-to-login-link').click()

    // Should be on login page
    await expect(page.getByTestId('login-page')).toBeVisible()
    await expect(page).toHaveTitle('Login')

    // Step 3: Simulate login
    await page.getByTestId('login-button').click()

    // Should be redirected to dashboard
    await expect(page.getByTestId('dashboard')).toBeVisible()
    await expect(page).toHaveTitle('Dashboard')

    // Step 4: Navigate back with browser back button
    // This is the critical test - the bug was that the title wouldn't update
    await page.goBack()

    // Wait for the article content to load (proves loader ran)
    await expect(page.getByTestId('article-content')).toBeVisible()
    await expect(page.getByTestId('article-title')).toContainText(
      'Article 123 Title',
    )

    // Critical assertion: page title should update to the actual article title
    // With the bug, this would remain "Article Not Found"
    // With the fix, head() re-executes after async loaders complete
    await expect(page).toHaveTitle('Article 123 Title')
  })

  test('page title shows correct fallback when loader returns null', async ({
    page,
  }) => {
    // Visit article while unauthenticated
    await page.goto('/test-head/article/456')

    // Should show fallback content and title
    await expect(page.getByTestId('article-not-found')).toBeVisible()
    await expect(page).toHaveTitle('Article Not Found')
  })

  test('logout flow works correctly', async ({ page }) => {
    // Set up authenticated state
    await page.goto('/fake-login')
    await page.getByTestId('login-button').click()

    // Navigate to article
    await page.goto('/test-head/article/789')
    await expect(page.getByTestId('article-content')).toBeVisible()
    await expect(page).toHaveTitle('Article 789 Title')

    // Click logout button
    await page.getByTestId('logout-button').click()

    // Page should reload and show not found state
    await expect(page.getByTestId('article-not-found')).toBeVisible()
    await expect(page).toHaveTitle('Article Not Found')
  })

  test('rapid navigation does not cause stale head() execution', async ({
    page,
  }) => {
    // Set up authenticated state
    await page.goto('/fake-login')
    await page.getByTestId('login-button').click()

    // Navigate to first article
    await page.goto('/test-head/article/111')
    await expect(page).toHaveTitle('Article 111 Title')

    // Rapidly navigate to second article
    await page.goto('/test-head/article/222')
    await expect(page).toHaveTitle('Article 222 Title')

    // Title should match the current route, not the previous one
    const title = await page.title()
    expect(title).toBe('Article 222 Title')
    expect(title).not.toBe('Article 111 Title')
  })
})
