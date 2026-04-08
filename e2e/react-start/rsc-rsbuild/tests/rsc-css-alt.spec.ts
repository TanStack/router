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

test.describe('RSC CSS Alt Tests (Rsbuild)', () => {
  test('RSC with alternate CSS module renders correctly', async ({ page }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/rsc-css-alt')
    await page.waitForURL('/rsc-css-alt')
    await expect(page.getByTestId('rsc-css-alt-hydrated')).toBeVisible()

    await expect(page.getByTestId('rsc-css-alt-content')).toBeVisible()
    await expect(page.getByTestId('rsc-css-alt-badge')).toContainText(
      'SERVER RENDERED',
    )
    await expect(page.getByTestId('rsc-css-alt-heading')).toContainText(
      'Alternate CSS Module Route',
    )
    await expect(page.getByTestId('rsc-css-alt-item-1')).toBeVisible()
    await expect(page.getByTestId('rsc-css-alt-item-2')).toBeVisible()
    await expect(page.getByTestId('rsc-css-alt-item-3')).toBeVisible()

    expectNoHydrationErrors()
  })

  test('Alternate CSS module classes are scoped (hashed)', async ({ page }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/rsc-css-alt')
    await page.waitForURL('/rsc-css-alt')

    const container = page.getByTestId('rsc-css-alt-content')
    await expect(page.getByTestId('rsc-css-alt-hydrated')).toBeVisible()
    await expect(container).toBeVisible()

    const className = await container.getAttribute('class')
    expect(className).toBeTruthy()
    expect(className).not.toBe('wrapper')
    expect(className!.length).toBeGreaterThan(5)

    expectNoHydrationErrors()
  })

  test('Alternate CSS module styles are applied (amber theme)', async ({
    page,
  }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/rsc-css-alt')
    await page.waitForURL('/rsc-css-alt')

    const container = page.getByTestId('rsc-css-alt-content')
    await expect(page.getByTestId('rsc-css-alt-hydrated')).toBeVisible()
    await expect(container).toBeVisible()

    // #fef3c7 in RGB
    const backgroundColor = await container.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    )
    expect(backgroundColor).toBe('rgb(254, 243, 199)')

    const borderRadius = await container.evaluate(
      (el) => getComputedStyle(el).borderRadius,
    )
    expect(borderRadius).toBe('8px')

    expectNoHydrationErrors()
  })

  test('Both CSS modules coexist: navigate between them', async ({ page }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    // Start on first CSS module route
    await page.goto('/rsc-css-modules')
    await page.waitForURL('/rsc-css-modules')
    await expect(page.getByTestId('rsc-css-modules-hydrated')).toBeVisible()

    // Verify blue theme
    const blueContainer = page.getByTestId('rsc-css-modules-content')
    const blueBg = await blueContainer.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    )
    expect(blueBg).toBe('rgb(224, 242, 254)')

    // Navigate to alt CSS module route
    await page.getByTestId('nav-css-alt').click()
    await page.waitForURL('/rsc-css-alt')
    await expect(page.getByTestId('rsc-css-alt-hydrated')).toBeVisible()

    // Verify amber theme — different from blue
    const amberContainer = page.getByTestId('rsc-css-alt-content')
    const amberBg = await amberContainer.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    )
    expect(amberBg).toBe('rgb(254, 243, 199)')

    expectNoHydrationErrors()
  })

  test('Alternate CSS module works after client-side navigation from home', async ({
    page,
  }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/')
    await page.waitForURL('/')
    await page.waitForTimeout(HYDRATION_WAIT)

    await page.getByTestId('nav-css-alt').click()
    await page.waitForURL('/rsc-css-alt')

    await expect(page.getByTestId('rsc-css-alt-hydrated')).toBeVisible()
    await expect(page.getByTestId('rsc-css-alt-content')).toBeVisible()

    const container = page.getByTestId('rsc-css-alt-content')
    const backgroundColor = await container.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    )
    expect(backgroundColor).toBe('rgb(254, 243, 199)')

    expectNoHydrationErrors()
  })
})
