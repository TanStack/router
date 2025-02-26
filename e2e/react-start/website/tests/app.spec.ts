import { expect, test } from '@playwright/test'

const routeTestId = 'selected-route-label'

test('resolves to the latest version on load of a project like "/router"', async ({
  page,
}) => {
  await page.goto('/router')

  await expect(page.getByTestId(routeTestId)).toContainText('/router/latest')
})

test('resolves to the overview docs page', async ({ page }) => {
  await page.goto('/router/latest/docs')

  await expect(page.getByTestId(routeTestId)).toContainText(
    '/router/latest/docs/framework/react/overview',
  )
})
