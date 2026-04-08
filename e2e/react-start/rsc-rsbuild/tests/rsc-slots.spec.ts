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

test.describe('RSC Slot Tests (Rsbuild) - Direct load', () => {
  test('Slots render without hydration errors on direct load', async ({
    page,
  }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/rsc-slots')
    await page.waitForURL('/rsc-slots')
    await expect(page.getByTestId('rsc-slots-hydrated')).toBeVisible()

    // Core content rendered
    await expect(page.getByTestId('rsc-slotted-content')).toBeVisible()
    await expect(page.getByTestId('rsc-slotted-title')).toContainText(
      'Revenue Dashboard',
    )
    await expect(page.getByTestId('child-content')).toContainText(
      'initial child',
    )
    await expect(page.getByTestId('footer-content')).toContainText(
      'Computed: 42',
    )

    expectNoHydrationErrors()
  })

  test('Changing child content does not reload RSC', async ({ page }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/rsc-slots')
    await page.waitForURL('/rsc-slots')
    await expect(page.getByTestId('rsc-slots-hydrated')).toBeVisible()

    const initialRscTimestamp = await page
      .getByTestId('rsc-slotted-timestamp')
      .textContent()

    await expect(page.getByTestId('child-content')).toContainText(
      'initial child',
    )

    await page.getByTestId('change-child-btn').click()

    await expect(page.getByTestId('child-content')).toContainText(
      'Widget updated at',
    )

    const newRscTimestamp = await page
      .getByTestId('rsc-slotted-timestamp')
      .textContent()
    expect(newRscTimestamp).toBe(initialRscTimestamp)

    expectNoHydrationErrors()
  })

  test('Changing footer render prop does not reload RSC', async ({ page }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/rsc-slots')
    await page.waitForURL('/rsc-slots')
    await expect(page.getByTestId('rsc-slots-hydrated')).toBeVisible()

    const initialRscTimestamp = await page
      .getByTestId('rsc-slotted-timestamp')
      .textContent()
    await expect(page.getByTestId('footer-content')).toContainText(
      'Computed: 42',
    )

    await page.getByTestId('change-footer-btn').click()

    await expect(page.getByTestId('footer-content')).toContainText(
      'Computed: 84',
    )

    const newRscTimestamp = await page
      .getByTestId('rsc-slotted-timestamp')
      .textContent()
    expect(newRscTimestamp).toBe(initialRscTimestamp)

    expectNoHydrationErrors()
  })

  test('Adding/removing extra child does not reload RSC', async ({ page }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/rsc-slots')
    await page.waitForURL('/rsc-slots')
    await expect(page.getByTestId('rsc-slots-hydrated')).toBeVisible()

    const initialRscTimestamp = await page
      .getByTestId('rsc-slotted-timestamp')
      .textContent()

    await expect(page.getByTestId('extra-child-content')).not.toBeVisible()

    await page.getByTestId('toggle-extra-child-btn').click()
    await expect(page.getByTestId('extra-child-content')).toBeVisible()
    await expect(page.getByTestId('extra-child-content')).toContainText(
      'Extra widget visible!',
    )

    let newRscTimestamp = await page
      .getByTestId('rsc-slotted-timestamp')
      .textContent()
    expect(newRscTimestamp).toBe(initialRscTimestamp)

    await page.getByTestId('toggle-extra-child-btn').click()
    await expect(page.getByTestId('extra-child-content')).not.toBeVisible()

    newRscTimestamp = await page
      .getByTestId('rsc-slotted-timestamp')
      .textContent()
    expect(newRscTimestamp).toBe(initialRscTimestamp)

    expectNoHydrationErrors()
  })

  test('Multiple slot changes in sequence do not reload RSC', async ({
    page,
  }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/rsc-slots')
    await page.waitForURL('/rsc-slots')
    await expect(page.getByTestId('rsc-slots-hydrated')).toBeVisible()

    const initialRscTimestamp = await page
      .getByTestId('rsc-slotted-timestamp')
      .textContent()

    await page.getByTestId('change-child-btn').click()
    await page.getByTestId('change-footer-btn').click()
    await page.getByTestId('toggle-extra-child-btn').click()
    await page.getByTestId('change-child-btn').click()
    await page.getByTestId('change-footer-btn').click()

    await expect(page.getByTestId('child-content')).toContainText(
      'Widget updated at',
    )
    await expect(page.getByTestId('footer-content')).toContainText(
      'Computed: 126',
    ) // 42 * 3
    await expect(page.getByTestId('extra-child-content')).toBeVisible()

    const newRscTimestamp = await page
      .getByTestId('rsc-slotted-timestamp')
      .textContent()
    expect(newRscTimestamp).toBe(initialRscTimestamp)

    expectNoHydrationErrors()
  })
})

test.describe('RSC Slot Tests (Rsbuild) - Client-side navigation', () => {
  test('Slots render after navigating from home', async ({ page }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/')
    await page.waitForURL('/')
    await page.waitForTimeout(HYDRATION_WAIT)

    await page.getByTestId('nav-slots').click()
    await page.waitForURL('/rsc-slots')
    await expect(page.getByTestId('rsc-slots-hydrated')).toBeVisible()

    await expect(page.getByTestId('rsc-slotted-content')).toBeVisible()
    await expect(page.getByTestId('rsc-slotted-title')).toContainText(
      'Revenue Dashboard',
    )
    await expect(page.getByTestId('child-content')).toContainText(
      'initial child',
    )
    await expect(page.getByTestId('footer-content')).toContainText(
      'Computed: 42',
    )

    expectNoHydrationErrors()
  })

  test('Slot interactions work after client-side navigation', async ({
    page,
  }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/')
    await page.waitForURL('/')
    await page.waitForTimeout(HYDRATION_WAIT)

    await page.getByTestId('nav-slots').click()
    await page.waitForURL('/rsc-slots')
    await expect(page.getByTestId('rsc-slots-hydrated')).toBeVisible()

    const initialRscTimestamp = await page
      .getByTestId('rsc-slotted-timestamp')
      .textContent()

    // Change child content
    await page.getByTestId('change-child-btn').click()
    await expect(page.getByTestId('child-content')).toContainText(
      'Widget updated at',
    )

    // Change footer
    await page.getByTestId('change-footer-btn').click()
    await expect(page.getByTestId('footer-content')).toContainText(
      'Computed: 84',
    )

    // RSC did not reload
    const newRscTimestamp = await page
      .getByTestId('rsc-slotted-timestamp')
      .textContent()
    expect(newRscTimestamp).toBe(initialRscTimestamp)

    expectNoHydrationErrors()
  })

  test('Navigate away and back preserves slot functionality', async ({
    page,
  }) => {
    const { expectNoHydrationErrors } = collectConsoleErrors(page)

    await page.goto('/rsc-slots')
    await page.waitForURL('/rsc-slots')
    await expect(page.getByTestId('rsc-slots-hydrated')).toBeVisible()

    // Navigate away
    await page.getByTestId('nav-rsc-basic').click()
    await page.waitForURL('/rsc-basic')
    await expect(page.getByTestId('rsc-basic-hydrated')).toBeVisible()

    // Navigate back
    await page.getByTestId('nav-slots').click()
    await page.waitForURL('/rsc-slots')
    await expect(page.getByTestId('rsc-slots-hydrated')).toBeVisible()

    // Verify slots still work
    await expect(page.getByTestId('rsc-slotted-content')).toBeVisible()
    await expect(page.getByTestId('child-content')).toContainText(
      'initial child',
    )

    // Interact with slot
    await page.getByTestId('change-child-btn').click()
    await expect(page.getByTestId('child-content')).toContainText(
      'Widget updated at',
    )

    expectNoHydrationErrors()
  })
})
