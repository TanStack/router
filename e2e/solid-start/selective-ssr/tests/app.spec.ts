import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

const testCount = 7

test.describe('selective ssr', () => {
  test('testcount matches', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByTestId('test-count')).toHaveText(`${testCount}`)
  })

  test('nested inherited ssr false shows pending fallback during client nav', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(page.getByTestId('test-count')).toHaveText(`${testCount}`)

    await page.getByTestId('nested-inherit-ssr-false-link').click()

    await expect(page.getByTestId('posts-heading')).toContainText('posts')
    await expect(page.getByTestId('router-status')).toContainText('pending')
    await page.waitForTimeout(100)
    await expect(page.getByTestId('pending-inherit-fallback')).toBeVisible()
  })

  test('nested inherited data-only shows pending fallback during client nav', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(page.getByTestId('test-count')).toHaveText(`${testCount}`)

    await page.getByTestId('nested-inherit-data-only-link').click()

    await expect(page.getByTestId('posts-heading')).toContainText('posts')
    await page.waitForTimeout(100)
    await expect(page.getByTestId('pending-data-only-fallback')).toBeVisible()
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
