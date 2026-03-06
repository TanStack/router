import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

const testCount = 9

test.describe('selective ssr', () => {
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

test.describe('pendingComponent with ssr data-only/false', () => {
  test('pendingComponent does not stay visible with ssr data-only', async ({
    page,
  }) => {
    // testcase 7: posts and postId both have ssr: 'data-only' with pendingComponent
    await page.goto('/')
    await page.getByTestId('testcase-7-link').click()

    // wait for hydration and route component to render
    await expect(page.getByTestId('postId-heading')).toContainText('postId')

    // pendingComponent must not be visible after hydration
    await expect(page.getByTestId('posts-pending')).not.toBeVisible()
    await expect(page.getByTestId('postId-pending')).not.toBeVisible()
  })

  test('pendingComponent does not stay visible with ssr false', async ({
    page,
  }) => {
    // testcase 8: posts and postId both have ssr: false with pendingComponent
    await page.goto('/')
    await page.getByTestId('testcase-8-link').click()

    // wait for hydration and route component to render
    await expect(page.getByTestId('postId-heading')).toContainText('postId')

    // pendingComponent must not be visible after hydration
    await expect(page.getByTestId('posts-pending')).not.toBeVisible()
    await expect(page.getByTestId('postId-pending')).not.toBeVisible()
  })
})
