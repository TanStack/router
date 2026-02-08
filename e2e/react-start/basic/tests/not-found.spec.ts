import { expect } from '@playwright/test'
import combinateImport from 'combinate'
import { test } from '@tanstack/router-e2e-utils'
import { isSpaMode } from '../tests/utils/isSpaMode'

// somehow playwright does not correctly import default exports
const combinate = (combinateImport as any).default as typeof combinateImport

test.use({
  whitelistErrors: [
    'Failed to load resource: the server responded with a status of 404',
    'NotFound error during hydration for routeId',
  ],
})
test.describe('not-found', () => {
  test(`global not found`, async ({ page }) => {
    const response = await page.goto(`/this-page-does-not-exist/foo/bar`)

    expect(response?.status()).toBe(isSpaMode ? 200 : 404)

    await expect(
      page.getByTestId('default-not-found-component'),
    ).toBeInViewport()
  })

  test.describe('throw notFound()', () => {
    const navigationTestMatrix = combinate({
      // TODO beforeLoad!
      thrower: [/* 'beforeLoad',*/ 'loader'] as const,
      preload: [false, true] as const,
    })

    navigationTestMatrix.forEach(({ thrower, preload }) => {
      test(`navigation: thrower: ${thrower}, preload: ${preload}`, async ({
        page,
      }) => {
        await page.goto(
          `/not-found/${preload === false ? '?preload=false' : ''}`,
        )
        const link = page.getByTestId(`via-${thrower}`)

        if (preload) {
          await link.focus()
          await new Promise((r) => setTimeout(r, 250))
        }

        await link.click()

        await expect(
          page.getByTestId(`via-${thrower}-notFound-component`),
        ).toBeInViewport()

        await expect(
          page.getByTestId(`via-${thrower}-route-component`),
        ).not.toBeInViewport()
      })
    })
    const directVisitTestMatrix = combinate({
      // TODO beforeLoad!

      thrower: [/* 'beforeLoad',*/ 'loader'] as const,
    })

    directVisitTestMatrix.forEach(({ thrower }) => {
      test(`direct visit: thrower: ${thrower}`, async ({ page }) => {
        await page.goto(`/not-found/via-${thrower}`)
        await page.waitForLoadState('networkidle')
        await expect(
          page.getByTestId(`via-${thrower}-notFound-component`),
        ).toBeInViewport()
        await expect(
          page.getByTestId(`via-${thrower}-route-component`),
        ).not.toBeInViewport()
      })
    })
  })
})
