import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

// The `test` fixture fails on any browser error, including Trusted Types
// violations.
test('router devtools render when the page enforces Trusted Types', async ({
  page,
}) => {
  const response = await page.goto('/')
  expect(response?.headers()['content-security-policy']).toBe(
    "require-trusted-types-for 'script'; trusted-types devtools",
  )

  await page
    .getByRole('button', { name: 'Open TanStack Router Devtools' })
    .click()
  await expect(page.locator('.TanStackRouterDevtoolsPanel')).toBeVisible()
})
