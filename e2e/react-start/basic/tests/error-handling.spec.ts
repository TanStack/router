import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function expectBeforeLoadHandledByErrorComponent(page: Page) {
  await page.waitForLoadState('networkidle')
  await expect(
    page.getByTestId('error-handling-before-load-error-component'),
  ).toBeVisible()
  await expect(
    page.getByTestId('error-handling-before-load-route-component'),
  ).not.toBeVisible()
}

test('beforeLoad error should be handled by errorComponent on client navigation', async ({
  page,
}) => {
  await page.goto('/')
  await page.click('a[href="/error-handling/via-beforeLoad"]')
  await expectBeforeLoadHandledByErrorComponent(page)
})

test('beforeLoad error should be handled by errorComponent on initial request', async ({
  page,
}) => {
  await page.goto('/error-handling/via-beforeLoad')
  await expectBeforeLoadHandledByErrorComponent(page)
})

async function expectLoaderErrorHandledByErrorComponent(page: Page) {
  await page.waitForLoadState('networkidle')
  await expect(
    page.getByTestId('error-handling-loader-error-component'),
  ).toBeVisible()
  await expect(
    page.getByTestId('error-handling-loader-route-component'),
  ).not.toBeVisible()
}

test('loader error should be handled by errorComponent on client navigation', async ({
  page,
}) => {
  await page.goto('/')
  await page.click('a[href="/error-handling/via-loader"]')
  await expectLoaderErrorHandledByErrorComponent(page)
})

test('loader error should be handled by errorComponent on initial request', async ({
  page,
}) => {
  await page.goto('/error-handling/via-loader')
  await expectLoaderErrorHandledByErrorComponent(page)
})
