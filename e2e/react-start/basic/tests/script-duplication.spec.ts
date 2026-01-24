import { expect, test } from '@playwright/test'

test.describe('Async Script Hydration', () => {
  test('should not show hydration warning for async scripts', async ({
    page,
  }) => {
    const warnings: Array<string> = []
    page.on('console', (msg) => {
      if (
        msg.type() === 'warning' ||
        (msg.type() === 'error' &&
          msg.text().toLowerCase().includes('hydration'))
      ) {
        warnings.push(msg.text())
      }
    })

    await page.goto('/async-scripts')
    await expect(
      page.getByTestId('async-scripts-test-heading'),
    ).toBeInViewport()

    await page.waitForFunction(() => (window as any).SCRIPT_1 === true)

    // Filter for hydration-related warnings
    const hydrationWarnings = warnings.filter(
      (w) =>
        w.toLowerCase().includes('hydration') ||
        w.toLowerCase().includes('mismatch'),
    )

    expect(hydrationWarnings).toHaveLength(0)
  })

  test('should load async and defer scripts correctly', async ({ page }) => {
    await page.goto('/async-scripts')
    await expect(
      page.getByTestId('async-scripts-test-heading'),
    ).toBeInViewport()

    // script.js (async) sets window.SCRIPT_1 = true
    // script2.js (defer) sets window.SCRIPT_2 = true
    expect(await page.evaluate('window.SCRIPT_1')).toBe(true)
    expect(await page.evaluate('window.SCRIPT_2')).toBe(true)
  })
})

test.describe('Script Duplication Prevention', () => {
  test('should not create duplicate scripts on SSR route', async ({ page }) => {
    await page.goto('/scripts')

    await expect(page.getByTestId('scripts-test-heading')).toBeInViewport()

    const scriptCount = await page.evaluate(() => {
      return document.querySelectorAll('script[src="script.js"]').length
    })

    expect(scriptCount).toBe(1)

    expect(await page.evaluate('window.SCRIPT_1')).toBe(true)
  })

  test('should not create duplicate scripts during client-side navigation', async ({
    page,
  }) => {
    await page.goto('/')

    await page.getByRole('link', { name: 'Scripts', exact: true }).click()
    await expect(page.getByTestId('scripts-test-heading')).toBeInViewport()

    const firstNavCount = await page.evaluate(() => {
      return document.querySelectorAll('script[src="script.js"]').length
    })
    expect(firstNavCount).toBe(1)

    await page.getByRole('link', { name: 'Home' }).click()
    await expect(page.getByRole('link', { name: 'Posts' })).toBeVisible()

    await page.getByRole('link', { name: 'Scripts', exact: true }).click()
    await expect(page.getByTestId('scripts-test-heading')).toBeInViewport()

    const secondNavCount = await page.evaluate(() => {
      return document.querySelectorAll('script[src="script.js"]').length
    })
    expect(secondNavCount).toBe(1)

    expect(await page.evaluate('window.SCRIPT_1')).toBe(true)
  })

  test('should not create duplicate scripts with multiple navigation cycles', async ({
    page,
  }) => {
    await page.goto('/')

    for (let i = 0; i < 3; i++) {
      await page.getByRole('link', { name: 'Scripts', exact: true }).click()
      await expect(page.getByTestId('scripts-test-heading')).toBeInViewport()

      await page.getByRole('link', { name: 'Home' }).click()
      await expect(page.getByRole('link', { name: 'Posts' })).toBeVisible()
    }

    await page.getByRole('link', { name: 'Scripts', exact: true }).click()
    await expect(page.getByTestId('scripts-test-heading')).toBeInViewport()

    const finalCount = await page.evaluate(() => {
      return document.querySelectorAll('script[src="script.js"]').length
    })
    expect(finalCount).toBe(1)

    expect(await page.evaluate('window.SCRIPT_1')).toBe(true)
  })

  test('should not create duplicate inline scripts', async ({ page }) => {
    await page.goto('/inline-scripts')

    await expect(
      page.getByTestId('inline-scripts-test-heading'),
    ).toBeInViewport()

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

    expect(script1Count).toBe(1)
    expect(script2Count).toBe(1)

    expect(await page.evaluate('window.INLINE_SCRIPT_1')).toBe(true)
    expect(await page.evaluate('window.INLINE_SCRIPT_2')).toBe('test')
  })

  test('should not create duplicate inline scripts during client-side navigation', async ({
    page,
  }) => {
    await page.goto('/')

    await page.getByRole('link', { name: 'Inline Scripts' }).click()
    await expect(
      page.getByTestId('inline-scripts-test-heading'),
    ).toBeInViewport()

    const firstNavScript1Count = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script:not([src])'))
      return scripts.filter(
        (script) =>
          script.textContent &&
          script.textContent.includes('window.INLINE_SCRIPT_1 = true'),
      ).length
    })
    expect(firstNavScript1Count).toBe(1)

    await page.getByRole('link', { name: 'Home' }).click()
    await expect(page.getByRole('link', { name: 'Posts' })).toBeVisible()

    await page.getByRole('link', { name: 'Inline Scripts' }).click()
    await expect(
      page.getByTestId('inline-scripts-test-heading'),
    ).toBeInViewport()

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
