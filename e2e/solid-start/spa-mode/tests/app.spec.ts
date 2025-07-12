import { expect, Page } from '@playwright/test'
import { test } from './fixture'

async function runTest(
  page: Page,
  expectedData: {
    root: 'server' | 'client'
    posts: 'client'
    postId: 'client'
  },
) {
  // wait for page to be loaded by waiting for the leaf route to be rendered
  await expect(page.getByTestId('postId-heading')).toContainText('postId')

  // check expectations
  await Promise.all(
    Object.entries(expectedData).map(async ([route, expectedData]) => {
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
}
test.describe('SPA mode', () => {
  test(`directly visiting /posts/1`, async ({ page }) => {
    await page.goto('/posts/1')
    await runTest(page, {
      root: 'server',
      posts: 'client',
      postId: 'client',
    })
  })

  test(`client-side navigation to /posts/1`, async ({ page }) => {
    await page.goto('/')
    const testId = 'link-posts-1'
    await page.getByTestId(testId).click()
    await runTest(page, {
      root: 'client',
      posts: 'client',
      postId: 'client',
    })
  })
})
