import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test.describe('queries are streamed from the server', () => {
  test('direct visit - loader on server runs query and awaits it', async ({
    page,
  }) => {
    await page.goto('/loader-query/sync')

    const queryData = page.getByTestId('query-data')
    await expect(queryData).toHaveText('server')

    const loaderData = page.getByTestId('loader-data')
    await expect(loaderData).toHaveText('server')
  })
  test('direct visit - loader on server runs query and does not await it', async ({
    page,
  }) => {
    await page.goto('/loader-query/async')

    const queryData = page.getByTestId('query-data')
    await expect(queryData).toHaveText('server')

    const loaderData = page.getByTestId('loader-data')
    await expect(loaderData).toHaveText('undefined')
  })

  test('useQuery', async ({ page }) => {
    await page.goto('/useQuery')

    const queryData = page.getByTestId('query-data')
    await expect(queryData).toHaveText('server')
  })
})
