import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import type { Page } from '@playwright/test'

async function runTest(
  page: Page,
  expectedData: {
    root: 'server' | 'client'
    posts: 'server' | 'client'
    postId: 'server' | 'client'
  },
) {
  // wait for page to be loaded by waiting for the leaf route to be rendered
  await expect(page.getByTestId('postId-heading')).toContainText('postId')

  // check expectations
  await Promise.all(
    Object.entries(expectedData).map(async ([route, expectedData]) => {
      await expect(page.getByTestId(`${route}-loader`)).toContainText(
        expectedData,
      )
      await expect(page.getByTestId(`${route}-context`)).toContainText(
        expectedData,
      )
    }),
  )
  await expect(page.getByTestId('router-isLoading')).toContainText('false')
  await expect(page.getByTestId('router-status')).toContainText('idle')
}
test.describe('SPA mode', () => {
  test(`directly visiting prerendered /posts/1`, async ({ page }) => {
    await page.goto('/posts/1')
    await runTest(page, {
      root: 'server',
      posts: 'server',
      postId: 'server',
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
