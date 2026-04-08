import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

const HYDRATION_WAIT = 1000

/**
 * Collects console errors and returns a checker for hydration/SSR errors.
 * Must be called before page.goto().
 */
function collectConsoleErrors(page: import('@playwright/test').Page) {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text())
    }
  })
  return {
    errors,
    expectNoHydrationErrors() {
      const hydrationErrors = errors.filter(
        (msg) =>
          msg.includes('Hydration') ||
          msg.includes('hydration') ||
          msg.includes("didn't match") ||
          msg.includes('did not match') ||
          msg.includes('server-rendered') ||
          msg.includes('There was an error while hydrating') ||
          msg.includes('Switched to client rendering') ||
          msg.includes('Element type is invalid'),
      )
      expect(
        hydrationErrors,
        `Expected no hydration errors but got:\n${hydrationErrors.join('\n')}`,
      ).toHaveLength(0)
    },
  }
}

test.describe('RSC CSS Modules Tests (Rsbuild)', () => {
  test('RSC with CSS modules hydrates without errors', async ({ page }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/rsc-css-modules')
    await page.waitForURL('/rsc-css-modules')
    await expect(page.getByTestId('rsc-css-modules-hydrated')).toBeVisible()

    await expect(page.getByTestId('rsc-css-modules-content')).toBeVisible()

    expectNoHydrationErrors()
  })

  test('RSC renders with CSS module styles applied', async ({ page }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/rsc-css-modules')
    await page.waitForURL('/rsc-css-modules')

    await expect(page.getByTestId('rsc-css-modules-hydrated')).toBeVisible()
    await expect(page.getByTestId('rsc-css-modules-content')).toBeVisible()
    await expect(page.getByTestId('rsc-css-modules-badge')).toContainText(
      'SERVER RENDERED',
    )
    await expect(page.getByTestId('rsc-css-modules-title')).toContainText(
      'CSS Modules in Server Components',
    )

    await expect(page.getByTestId('rsc-css-modules-features')).toBeVisible()
    await expect(page.getByTestId('rsc-css-modules-feature-1')).toBeVisible()
    await expect(page.getByTestId('rsc-css-modules-feature-2')).toBeVisible()
    await expect(page.getByTestId('rsc-css-modules-feature-3')).toBeVisible()

    const serverTimestamp = await page
      .getByTestId('rsc-css-modules-timestamp')
      .textContent()
    expect(serverTimestamp).toContain('Fetched:')

    expectNoHydrationErrors()
  })

  test('CSS module classes are scoped (hashed)', async ({ page }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/rsc-css-modules')
    await page.waitForURL('/rsc-css-modules')

    const container = page.getByTestId('rsc-css-modules-content')
    await expect(page.getByTestId('rsc-css-modules-hydrated')).toBeVisible()
    await expect(container).toBeVisible()

    const className = await container.getAttribute('class')
    expect(className).toBeTruthy()
    expect(className).not.toBe('container')
    expect(className!.length).toBeGreaterThan(5)

    expectNoHydrationErrors()
  })

  test('CSS module styles are actually applied (computed styles)', async ({
    page,
  }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/rsc-css-modules')
    await page.waitForURL('/rsc-css-modules')

    const container = page.getByTestId('rsc-css-modules-content')
    await expect(page.getByTestId('rsc-css-modules-hydrated')).toBeVisible()
    await expect(container).toBeVisible()

    // #e0f2fe in RGB
    const backgroundColor = await container.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    )
    expect(backgroundColor).toBe('rgb(224, 242, 254)')

    const borderRadius = await container.evaluate(
      (el) => getComputedStyle(el).borderRadius,
    )
    expect(borderRadius).toBe('8px')

    const accent = page.getByTestId('rsc-css-nested-accent')
    const accentBg = await accent.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    )
    expect(accentBg).toBe('rgb(220, 252, 231)')

    const accentRadius = await accent.evaluate(
      (el) => getComputedStyle(el).borderRadius,
    )
    expect(accentRadius).toBe('12px')

    expectNoHydrationErrors()
  })

  test('CSS modules work after client-side navigation', async ({ page }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/')
    await page.waitForURL('/')
    await page.waitForTimeout(HYDRATION_WAIT)

    await page.getByTestId('nav-css-modules').click()
    await page.waitForURL('/rsc-css-modules')

    await expect(page.getByTestId('rsc-css-modules-hydrated')).toBeVisible()
    await expect(page.getByTestId('rsc-css-modules-content')).toBeVisible()
    await expect(page.getByTestId('rsc-css-modules-title')).toContainText(
      'CSS Modules in Server Components',
    )

    // Verify styles are applied after client-side navigation
    const container = page.getByTestId('rsc-css-modules-content')
    const backgroundColor = await container.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    )
    expect(backgroundColor).toBe('rgb(224, 242, 254)')

    expectNoHydrationErrors()
  })
})
