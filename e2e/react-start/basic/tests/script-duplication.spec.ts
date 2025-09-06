import { expect, test } from '@playwright/test'

test.describe('Script Duplication Prevention', () => {
  test('should not create duplicate scripts on SSR route', async ({ page }) => {
    // Navigate directly to scripts route (SSR scenario)
    await page.goto('/scripts')

    await expect(page.getByTestId('scripts-test-heading')).toBeInViewport()

    // Count script tags with src="script.js"
    const scriptCount = await page.evaluate(() => {
      return document.querySelectorAll('script[src="script.js"]').length
    })

    // Should have exactly one script tag
    expect(scriptCount).toBe(1)

    // Verify the script executed correctly
    expect(await page.evaluate('window.SCRIPT_1')).toBe(true)
  })

  test('should not create duplicate scripts during client-side navigation', async ({
    page,
  }) => {
    // Start from home page
    await page.goto('/')

    // Navigate to scripts route (client-side navigation)
    await page.getByRole('link', { name: 'Scripts', exact: true }).click()
    await expect(page.getByTestId('scripts-test-heading')).toBeInViewport()

    // Count script tags after first navigation
    const firstNavCount = await page.evaluate(() => {
      return document.querySelectorAll('script[src="script.js"]').length
    })
    expect(firstNavCount).toBe(1)

    // Navigate away from scripts route
    await page.getByRole('link', { name: 'Home' }).click()
    await expect(page.getByRole('link', { name: 'Posts' })).toBeVisible()

    // Navigate back to scripts route
    await page.getByRole('link', { name: 'Scripts', exact: true }).click()
    await expect(page.getByTestId('scripts-test-heading')).toBeInViewport()

    // Count script tags after second navigation - should still be 1
    const secondNavCount = await page.evaluate(() => {
      return document.querySelectorAll('script[src="script.js"]').length
    })
    expect(secondNavCount).toBe(1)

    // Verify the script is still working
    expect(await page.evaluate('window.SCRIPT_1')).toBe(true)
  })

  test('should not create duplicate scripts with multiple navigation cycles', async ({
    page,
  }) => {
    // Start from home page
    await page.goto('/')

    // Navigate to scripts route multiple times
    for (let i = 0; i < 3; i++) {
      // Go to scripts
      await page.getByRole('link', { name: 'Scripts', exact: true }).click()
      await expect(page.getByTestId('scripts-test-heading')).toBeInViewport()

      // Go back to home
      await page.getByRole('link', { name: 'Home' }).click()
      await expect(page.getByRole('link', { name: 'Posts' })).toBeVisible()
    }

    // Final navigation to scripts
    await page.getByRole('link', { name: 'Scripts', exact: true }).click()
    await expect(page.getByTestId('scripts-test-heading')).toBeInViewport()

    // Count script tags - should still be exactly 1
    const finalCount = await page.evaluate(() => {
      return document.querySelectorAll('script[src="script.js"]').length
    })
    expect(finalCount).toBe(1)

    // Verify the script is still working
    expect(await page.evaluate('window.SCRIPT_1')).toBe(true)
  })

  test('should not create duplicate inline scripts', async ({ page }) => {
    // Navigate directly to inline scripts route (SSR scenario)
    await page.goto('/inline-scripts')

    await expect(
      page.getByTestId('inline-scripts-test-heading'),
    ).toBeInViewport()

    // Count specific inline scripts
    const script1Count = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script:not([src])'))
      return scripts.filter(
        (script) =>
          script.textContent &&
          script.textContent.includes('window.INLINE_SCRIPT_1 = true'),
      ).length
    })

    const script2Count = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script:not([src])'))
      return scripts.filter(
        (script) =>
          script.textContent &&
          script.textContent.includes('window.INLINE_SCRIPT_2 = "test"'),
      ).length
    })

    // Should have exactly one of each inline script
    expect(script1Count).toBe(1)
    expect(script2Count).toBe(1)

    // Verify the scripts executed correctly
    expect(await page.evaluate('window.INLINE_SCRIPT_1')).toBe(true)
    expect(await page.evaluate('window.INLINE_SCRIPT_2')).toBe('test')
  })

  test('should not create duplicate inline scripts during client-side navigation', async ({
    page,
  }) => {
    // Start from home page
    await page.goto('/')

    // Navigate to inline scripts route (client-side navigation)
    await page.getByRole('link', { name: 'Inline Scripts' }).click()
    await expect(
      page.getByTestId('inline-scripts-test-heading'),
    ).toBeInViewport()

    // Count inline scripts after first navigation
    const firstNavScript1Count = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script:not([src])'))
      return scripts.filter(
        (script) =>
          script.textContent &&
          script.textContent.includes('window.INLINE_SCRIPT_1 = true'),
      ).length
    })
    expect(firstNavScript1Count).toBe(1)

    // Navigate away and back
    await page.getByRole('link', { name: 'Home' }).click()
    await expect(page.getByRole('link', { name: 'Posts' })).toBeVisible()

    await page.getByRole('link', { name: 'Inline Scripts' }).click()
    await expect(
      page.getByTestId('inline-scripts-test-heading'),
    ).toBeInViewport()

    // Count inline scripts after second navigation - should still be 1
    const secondNavScript1Count = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script:not([src])'))
      return scripts.filter(
        (script) =>
          script.textContent &&
          script.textContent.includes('window.INLINE_SCRIPT_1 = true'),
      ).length
    })
    expect(secondNavScript1Count).toBe(1)

    // Verify the scripts are still working
    expect(await page.evaluate('window.INLINE_SCRIPT_1')).toBe(true)
    expect(await page.evaluate('window.INLINE_SCRIPT_2')).toBe('test')
  })
})
