import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import type { Page } from '@playwright/test'

const HYDRATION_WAIT = 1000

/**
 * Collects console errors and returns a checker for hydration/SSR errors.
 * Must be called before page.goto().
 */
function collectConsoleErrors(page: Page) {
  const errors: Array<string> = []
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

test.describe('RSC Basic Tests (Rsbuild)', () => {
  test('SSR renders the home page', async ({ page }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('home-heading')).toContainText('Welcome Home')

    expectNoHydrationErrors()
  })

  test('RSC renders with server timestamp', async ({ page }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/rsc-basic')
    await page.waitForURL('/rsc-basic')
    await expect(page.getByTestId('rsc-basic-hydrated')).toBeVisible()

    await expect(page.getByTestId('rsc-basic-content')).toBeVisible()
    await expect(page.getByTestId('rsc-server-timestamp')).toBeVisible()
    await expect(page.getByTestId('rsc-label')).toContainText('Sarah Chen')

    const serverTimestamp = await page
      .getByTestId('rsc-server-timestamp')
      .textContent()
    const loaderTimestamp = await page
      .getByTestId('loader-timestamp')
      .textContent()

    expect(serverTimestamp).toContain('Fetched:')
    expect(Number(loaderTimestamp)).toBeGreaterThan(0)

    expectNoHydrationErrors()
  })

  test('RSC renders server badge', async ({ page }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/rsc-basic')
    await page.waitForURL('/rsc-basic')
    await expect(page.getByTestId('rsc-basic-hydrated')).toBeVisible()

    await expect(page.getByTestId('rsc-server-badge')).toContainText(
      'SERVER RENDERED',
    )

    expectNoHydrationErrors()
  })

  test('RSC renders custom label from input', async ({ page }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/rsc-basic')
    await page.waitForURL('/rsc-basic')
    await expect(page.getByTestId('rsc-basic-hydrated')).toBeVisible()

    await expect(page.getByTestId('rsc-custom-label')).toContainText(
      'Label: test label',
    )

    expectNoHydrationErrors()
  })

  test('RSC renders correctly after client-side navigation', async ({
    page,
  }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/')
    await page.waitForURL('/')
    await page.waitForTimeout(HYDRATION_WAIT)

    await page.getByTestId('nav-rsc-basic').click()
    await page.waitForURL('/rsc-basic')
    await expect(page.getByTestId('rsc-basic-hydrated')).toBeVisible()

    await expect(page.getByTestId('rsc-basic-content')).toBeVisible()
    await expect(page.getByTestId('rsc-label')).toContainText('Sarah Chen')

    expectNoHydrationErrors()
  })
})
