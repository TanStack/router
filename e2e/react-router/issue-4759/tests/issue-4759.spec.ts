import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function expectNoBlankFrame(
  page: Page,
  pendingSource: 'default' | 'route',
) {
  await expect(
    page.locator(
      `[data-state="pending"][data-pending-source="${pendingSource}"]`,
    ),
  ).toBeVisible()

  const paintStates = await page.evaluate(
    () =>
      (globalThis as typeof globalThis & { __paintStates: Array<string> })
        .__paintStates,
  )

  expect(paintStates).toContain('pending')
  expect(paintStates).not.toContain('shell')
  expect(paintStates).not.toContain('empty')
  await expect(page.locator('[data-state="loaded"]')).toBeVisible()
}

test('#4759: the initial default pending component has no blank frame before it', async ({
  page,
}) => {
  await page.goto('/')
  await expectNoBlankFrame(page, 'default')
})

test('an initial route pending component has no blank frame before it', async ({
  page,
}) => {
  await page.goto('/route-pending')
  await expectNoBlankFrame(page, 'route')
})
