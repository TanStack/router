import { expect, test } from '@playwright/test'

const routeTestId = 'selected-route-label'

test('index redirect resolves', async ({ page }) => {
  await page.goto('/nested-docs')

  await expect(page.getByTestId(routeTestId)).toContainText(
    '/nested-docs/router/latest/docs/framework/react',
  )
})

test('can change the project', async ({ page }) => {
  await page.goto('/nested-docs')
  await page.getByRole('link', { name: 'Query' }).click()

  await expect(page.getByTestId(routeTestId)).toContainText(
    '/nested-docs/query/latest/docs/framework/react',
  )
})

test('can change the version', async ({ page }) => {
  await page.goto('/nested-docs')
  await page.getByRole('link', { name: 'V1' }).click()

  await expect(page.getByTestId(routeTestId)).toContainText(
    '/nested-docs/router/v1/docs/framework/react',
  )
})

test('can change the framework', async ({ page }) => {
  await page.goto('/nested-docs')
  await page.getByRole('link', { name: 'SolidJS' }).click()

  await expect(page.getByTestId(routeTestId)).toContainText(
    '/nested-docs/router/latest/docs/framework/solidjs',
  )
})

test('navigate to post 1', async ({ page }) => {
  await page.goto('/nested-docs')
  await page.getByRole('link', { name: 'Post ID = 1', exact: true }).click()

  await expect(page.getByRole('heading')).toContainText('Heading for ID = 1')
})

test('change project from post 1', async ({ page }) => {
  await page.goto('/nested-docs/router/latest/docs/framework/react/1')
  await expect(page.getByRole('heading')).toContainText('Heading for ID = 1')
  await page.getByRole('link', { name: 'Query' }).click()

  await expect(page.getByTestId(routeTestId)).toContainText(
    '/nested-docs/query/latest/docs/framework/react',
  )
})

test('change version from post 1', async ({ page }) => {
  await page.goto('/nested-docs/router/latest/docs/framework/react/1')
  await expect(page.getByRole('heading')).toContainText('Heading for ID = 1')
  await page.getByRole('link', { name: 'V2' }).click()

  await expect(page.getByTestId(routeTestId)).toContainText(
    '/nested-docs/router/v2/docs/framework/react',
  )
})

test('change framework from post 1', async ({ page }) => {
  await page.goto('/nested-docs/router/latest/docs/framework/react/1')
  await expect(page.getByRole('heading')).toContainText('Heading for ID = 1')
  await page.getByRole('link', { name: 'SolidJS' }).click()

  await expect(page.getByTestId(routeTestId)).toContainText(
    '/nested-docs/router/latest/docs/framework/solidjs',
  )
})

test('can change project,version,framework from root', async ({ page }) => {
  await page.goto('/nested-docs')
  await expect(page.getByTestId(routeTestId)).toContainText(
    '/nested-docs/router/latest/docs/framework/react',
  )

  await page.getByRole('link', { name: 'Query' }).click()
  await expect(page.getByTestId(routeTestId)).toContainText(
    '/nested-docs/query/latest/docs/framework/react',
  )

  await page.getByRole('link', { name: 'V2' }).click()
  await expect(page.getByTestId(routeTestId)).toContainText(
    '/nested-docs/query/v2/docs/framework/react',
  )

  await page.getByRole('link', { name: 'SolidJS' }).click()
  await expect(page.getByTestId(routeTestId)).toContainText(
    '/nested-docs/query/v2/docs/framework/solidjs',
  )
})

test('can change project,version,framework from post 1', async ({ page }) => {
  await page.goto('/nested-docs/router/latest/docs/framework/react/1')
  await expect(page.getByTestId(routeTestId)).toContainText(
    '/nested-docs/router/latest/docs/framework/react',
  )

  await page.getByRole('link', { name: 'Query' }).click()
  await expect(page.getByTestId(routeTestId)).toContainText(
    '/nested-docs/query/latest/docs/framework/react',
  )

  await page.getByRole('link', { name: 'V2' }).click()
  await expect(page.getByTestId(routeTestId)).toContainText(
    '/nested-docs/query/v2/docs/framework/react',
  )

  await page.getByRole('link', { name: 'SolidJS' }).click()
  await expect(page.getByTestId(routeTestId)).toContainText(
    '/nested-docs/query/v2/docs/framework/solidjs',
  )
})
