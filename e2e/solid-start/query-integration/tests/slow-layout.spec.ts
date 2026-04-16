import { expect, test } from '@playwright/test'

// Reproduces https://github.com/TanStack/router/issues/7195
//
// Setup: shellComponent root (renders props.children, not its own Outlet).
// Parent layout route has NO router-level loader — uses only component-level
// useQuery with a 200ms delay. Child route also uses useQuery (instant).
//
// Bug: after SSR hydration + client-side navigation from /, the child route
// content never appears — only the parent layout renders.

test('client-side nav into layout with slow component-level useQuery renders child (#7195)', async ({
  page,
}) => {
  // SSR-render the home page
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible()

  // Client-side navigate to /slow-layout/child
  await page.getByTestId('link-slow-layout-child').click()

  // The child MUST eventually render (this is the bug — it never appeared)
  await expect(page.getByTestId('slow-layout-child-content')).toBeVisible({
    timeout: 5_000,
  })

  // The parent layout must also render
  await expect(page.getByTestId('slow-layout-content')).toBeVisible({
    timeout: 5_000,
  })
})

test('direct navigation to slow layout child works', async ({ page }) => {
  await page.goto('/slow-layout/child')

  await expect(page.getByTestId('slow-layout-content')).toBeVisible({
    timeout: 5_000,
  })
  await expect(page.getByTestId('slow-layout-child-content')).toBeVisible({
    timeout: 5_000,
  })
})
