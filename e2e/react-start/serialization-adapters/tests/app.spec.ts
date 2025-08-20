import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import type { Page } from '@playwright/test'

async function checkData(page: Page, id: string) {
  const expectedData = await page
    .getByTestId(`${id}-car-expected`)
    .textContent()
  expect(expectedData).not.toBeNull()
  await expect(page.getByTestId(`${id}-car-actual`)).toContainText(
    expectedData!,
  )

  await expect(page.getByTestId(`${id}-foo`)).toContainText(
    '{"value":"server"}',
  )
}
test.describe('SSR serialization adapters', () => {
  test(`data-only`, async ({ page }) => {
    await page.goto('/data-only')
    // wait for page to be loaded by waiting for the ClientOnly component to be rendered
    await expect(page.getByTestId('router-isLoading')).toContainText('false')
    await expect(page.getByTestId('router-status')).toContainText('idle')

    await Promise.all(
      ['context', 'loader'].map(async (id) => checkData(page, id)),
    )

    const expectedHonkData = await page
      .getByTestId('honk-expected-state')
      .textContent()
    expect(expectedHonkData).not.toBeNull()
    await expect(page.getByTestId('honk-actual-state')).toContainText(
      expectedHonkData!,
    )
  })

  test(`stream`, async ({ page }) => {
    await page.goto('/stream')
    // wait for page to be loaded by waiting for the ClientOnly component to be rendered
    await expect(page.getByTestId('router-isLoading')).toContainText('false')
    await expect(page.getByTestId('router-status')).toContainText('idle')

    await checkData(page, 'stream')
  })
})
