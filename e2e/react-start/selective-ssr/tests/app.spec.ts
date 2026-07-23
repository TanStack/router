import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

const testCount = 7

test.describe('selective ssr', () => {
  test('propagates client root context to an ssr:false child during intent preload (#4614)', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByTestId('issue-4614-root-context')).toHaveText(
      'false:true',
    )

    await page.getByTestId('issue-4614-link').hover()

    await expect
      .poll(() =>
        page.evaluate(() => (globalThis as any).__issue4614RootBeforeLoads),
      )
      .toEqual([
        {
          cause: 'preload',
          preload: true,
          isClient: true,
          isServer: false,
        },
      ])
    await expect
      .poll(() =>
        page.evaluate(() => (globalThis as any).__issue4614TargetBeforeLoad),
      )
      .toEqual({
        cause: 'preload',
        preload: true,
        isClient: true,
        isServer: false,
      })
  })

  test('testcount matches', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByTestId('test-count')).toHaveText(`${testCount}`)
  })

  for (let i = 0; i < testCount; i++) {
    test(`run test ${i}`, async ({ page }) => {
      await page.goto('/')
      const testId = `testcase-${i}-link`
      await page.getByTestId(testId).click()

      // wait for page to be loaded by waiting for the leaf route to be rendered
      await expect(page.getByTestId('postId-heading')).toContainText('postId')

      // check expectations
      await Promise.all(
        ['root', 'posts', 'postId'].map(async (route) => {
          const expectedData = await page
            .getByTestId(`${route}-data-expected`)
            .textContent()
          expect(expectedData).not.toBeNull()
          await expect(page.getByTestId(`${route}-loader`)).toContainText(
            expectedData!,
          )
          await expect(page.getByTestId(`${route}-context`)).toContainText(
            expectedData!,
          )
        }),
      )
      await expect(page.getByTestId('router-isLoading')).toContainText('false')
      await expect(page.getByTestId('router-status')).toContainText('idle')
    })
  }
})
