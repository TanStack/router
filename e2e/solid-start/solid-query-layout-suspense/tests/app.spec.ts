import { expect, test } from '@playwright/test'

// Reproduces https://github.com/TanStack/router/issues/7195
test('layout with useQuery renders child after client navigation', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByText('👉 To page2')).toBeVisible()
  await page.waitForLoadState('networkidle')

  await page.getByText('👉 To page2').click()

  await expect(page.getByTestId('page2-content')).toBeVisible({
    timeout: 5_000,
  })
  await expect(page.getByTestId('layout-content')).toBeVisible()
})

test('navigate from SSR index (with loader) to /$slug', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('index-content')).toBeVisible()
  await page.waitForLoadState('networkidle')

  await page.getByTestId('index-link-to-slug').click()

  await expect(page.getByTestId('slug-index')).toBeVisible({ timeout: 5_000 })
  await expect(page.getByTestId('slug-index')).toContainText('my-slug')
})
