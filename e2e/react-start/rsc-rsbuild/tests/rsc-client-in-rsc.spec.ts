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

test.describe('RSC Client-in-RSC Tests (Rsbuild)', () => {
  test('server component with client component renders on direct load', async ({
    page,
  }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/rsc-client-in-rsc')
    await page.waitForURL('/rsc-client-in-rsc')
    await expect(page.getByTestId('rsc-client-in-rsc-hydrated')).toBeVisible()

    // Server component wrapper is visible
    await expect(page.getByTestId('rsc-client-in-rsc-server')).toBeVisible()
    await expect(page.getByTestId('rsc-client-in-rsc-badge')).toContainText(
      'SERVER COMPONENT',
    )
    await expect(page.getByTestId('rsc-client-in-rsc-title')).toContainText(
      'Client-in-RSC Test',
    )

    // Client component inside RSC stream is visible
    await expect(page.getByTestId('client-counter')).toBeVisible()
    await expect(page.getByTestId('client-counter-badge')).toContainText(
      'CLIENT COMPONENT',
    )
    await expect(page.getByTestId('client-counter-label')).toContainText(
      'Interactive Counter',
    )

    expectNoHydrationErrors()
  })

  test('client component inside RSC is interactive after hydration', async ({
    page,
  }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/rsc-client-in-rsc')
    await page.waitForURL('/rsc-client-in-rsc')
    await expect(page.getByTestId('rsc-client-in-rsc-hydrated')).toBeVisible()

    // Verify initial count is 0
    await expect(page.getByTestId('client-counter-count')).toHaveText('0')

    // Click increment
    await page.getByTestId('client-counter-increment').click()
    await expect(page.getByTestId('client-counter-count')).toHaveText('1')

    // Click increment again
    await page.getByTestId('client-counter-increment').click()
    await expect(page.getByTestId('client-counter-count')).toHaveText('2')

    // Click decrement
    await page.getByTestId('client-counter-decrement').click()
    await expect(page.getByTestId('client-counter-count')).toHaveText('1')

    expectNoHydrationErrors()
  })

  test('works after client-side navigation', async ({ page }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    // Start at home
    await page.goto('/')
    await page.waitForURL('/')
    await page.waitForTimeout(HYDRATION_WAIT)

    // Navigate to client-in-rsc
    await page.getByTestId('nav-client-in-rsc').click()
    await page.waitForURL('/rsc-client-in-rsc')
    await expect(page.getByTestId('rsc-client-in-rsc-hydrated')).toBeVisible()

    // Server component content
    await expect(page.getByTestId('rsc-client-in-rsc-server')).toBeVisible()
    await expect(page.getByTestId('rsc-client-in-rsc-title')).toContainText(
      'Client-in-RSC Test',
    )

    // Client component is visible and interactive
    await expect(page.getByTestId('client-counter')).toBeVisible()
    await expect(page.getByTestId('client-counter-count')).toHaveText('0')
    await page.getByTestId('client-counter-increment').click()
    await expect(page.getByTestId('client-counter-count')).toHaveText('1')

    expectNoHydrationErrors()
  })

  test('client component state resets on re-navigation', async ({ page }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/rsc-client-in-rsc')
    await page.waitForURL('/rsc-client-in-rsc')
    await expect(page.getByTestId('rsc-client-in-rsc-hydrated')).toBeVisible()

    // Increment counter
    await page.getByTestId('client-counter-increment').click()
    await page.getByTestId('client-counter-increment').click()
    await expect(page.getByTestId('client-counter-count')).toHaveText('2')

    // Navigate away
    await page.getByTestId('nav-rsc-basic').click()
    await page.waitForURL('/rsc-basic')
    await expect(page.getByTestId('rsc-basic-hydrated')).toBeVisible()

    // Navigate back
    await page.getByTestId('nav-client-in-rsc').click()
    await page.waitForURL('/rsc-client-in-rsc')
    await expect(page.getByTestId('rsc-client-in-rsc-hydrated')).toBeVisible()

    // Counter should be reset to 0 (fresh server component)
    await expect(page.getByTestId('client-counter-count')).toHaveText('0')

    expectNoHydrationErrors()
  })
})
