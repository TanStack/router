import { expect, test } from '@playwright/test'

test.describe('/search-params/default', () => {
  test('Directly visiting the route without search param set', async ({
    page,
  }) => {
    await page.goto('/search-params/default')

    await expect(page.getByTestId('search-default')).toContainText('d1')
    await expect(page.getByTestId('context-hello')).toContainText('world')
    expect(
      page.url().endsWith('/search-params/default?default=d1'),
    ).toBeTruthy()
  })

  test('Directly visiting the route with search param set', async ({
    page,
  }) => {
    await page.goto('/search-params/default/?default=d2')

    await expect(page.getByTestId('search-default')).toContainText('d2')
    await expect(page.getByTestId('context-hello')).toContainText('world')
    expect(
      page.url().endsWith('/search-params/default?default=d2'),
    ).toBeTruthy()
  })

  test('navigating to the route without search param set', async ({ page }) => {
    await page.goto('/search-params/')
    await page.getByTestId('link-to-default-without-search').click()

    await expect(page.getByTestId('search-default')).toContainText('d1')
    await expect(page.getByTestId('context-hello')).toContainText('world')
    expect(
      page.url().endsWith('/search-params/default?default=d1'),
    ).toBeTruthy()
  })

  test('navigating to the route with search param set', async ({ page }) => {
    await page.goto('/search-params/')
    await page.getByTestId('link-to-default-with-search').click()

    await expect(page.getByTestId('search-default')).toContainText('d2')
    await expect(page.getByTestId('context-hello')).toContainText('world')
    expect(
      page.url().endsWith('/search-params/default?default=d2'),
    ).toBeTruthy()
  })
})
