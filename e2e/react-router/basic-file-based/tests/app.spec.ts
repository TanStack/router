import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('Navigating to a post page', async ({ page }) => {
  await page.getByRole('link', { name: 'Posts' }).click()
  await page.getByRole('link', { name: 'sunt aut facere repe' }).click()
  await expect(page.getByRole('heading')).toContainText('sunt aut facere')
})

test('Navigating nested layouts', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Layout', exact: true }).click()

  await expect(page.locator('#app')).toContainText("I'm a layout")
  await expect(page.locator('#app')).toContainText("I'm a nested layout")

  await page.getByRole('link', { name: 'Layout A' }).click()
  await expect(page.locator('#app')).toContainText("I'm layout A!")

  await page.getByRole('link', { name: 'Layout B' }).click()
  await expect(page.locator('#app')).toContainText("I'm layout B!")
})

test('Navigating to a not-found route', async ({ page }) => {
  await page.getByRole('link', { name: 'This Route Does Not Exist' }).click()
  await expect(page.getByRole('paragraph')).toContainText(
    'This is the notFoundComponent configured on root route',
  )
  await page.getByRole('link', { name: 'Start Over' }).click()
  await expect(page.getByRole('heading')).toContainText('Welcome Home!')
})

const testCases = [
  {
    description: 'Navigating to a route inside a route group',
    testId: 'link-to-route-inside-group',
  },
  {
    description:
      'Navigating to a route inside a subfolder inside a route group ',
    testId: 'link-to-route-inside-group-inside-subfolder',
  },
  {
    description: 'Navigating to a route inside a route group inside a layout',
    testId: 'link-to-route-inside-group-inside-layout',
  },
  {
    description: 'Navigating to a lazy route inside a route group',
    testId: 'link-to-lazy-route-inside-group',
  },

  {
    description: 'Navigating to the only route inside a route group ',
    testId: 'link-to-only-route-inside-group',
  },
]

testCases.forEach(({ description, testId }) => {
  test(description, async ({ page }) => {
    await page.getByTestId(testId).click()
    await expect(page.getByTestId('search-via-hook')).toContainText('world')
    await expect(page.getByTestId('search-via-route-hook')).toContainText(
      'world',
    )
    await expect(page.getByTestId('search-via-route-api')).toContainText(
      'world',
    )
  })
})

test('navigating to an unnested route', async ({ page }) => {
  const postId = 'hello-world'
  page.goto(`/posts/${postId}/edit`)
  await expect(page.getByTestId('params-via-hook')).toContainText(postId)
  await expect(page.getByTestId('params-via-route-hook')).toContainText(postId)
  await expect(page.getByTestId('params-via-route-api')).toContainText(postId)
})
