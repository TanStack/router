import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { waitForHydration } from './hydration'

test('a server component rendered by a helper module gets its CSS', async ({
  page,
}) => {
  // Bug: on Rsbuild, the RSC CSS transform only rewrites server function
  // provider modules (`serverFnProviderOnly`), so a render call in a helper
  // module that a server function calls gets no CSS.
  // Impact: the server component renders unstyled.
  // Source: C9 (react-start-rsc rscCssTransform.ts, serverFnProviderOnly).
  test.fail(
    (process.env.E2E_TOOLCHAIN ?? 'vite') === 'rsbuild',
    'Rsbuild only injects RSC CSS in server function provider modules',
  )

  await page.goto('/rsc-css-helper')
  await page.waitForURL('/rsc-css-helper')
  await waitForHydration(page)

  const card = page.getByTestId('rsc-css-helper-card')
  await expect(card).toBeVisible()
  await expect(card).toHaveCSS('background-color', 'rgb(254, 243, 199)')
  await expect(card).toHaveCSS('border-radius', '18px')
})
