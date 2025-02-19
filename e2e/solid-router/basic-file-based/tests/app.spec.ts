import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('Navigating to a post page', async ({ page }) => {
  await page.getByRole('link', { name: 'Posts' }).click()
  await page.getByRole('link', { name: 'sunt aut facere repe' }).click()
  await expect(page.getByRole('heading')).toContainText('sunt aut facere')
})

test('Navigating nested layouts', async ({ page }) => {
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

test("useBlocker doesn't block navigation if condition is not met", async ({
  page,
}) => {
  await page.goto('/editing-a')
  await expect(page.getByRole('heading')).toContainText('Editing A')

  await page.getByRole('button', { name: 'Go to next step' }).click()
  await expect(page.getByRole('heading')).toContainText('Editing B')
})

test('useBlocker does block navigation if condition is met', async ({
  page,
}) => {
  await page.goto('/editing-a')
  await expect(page.getByRole('heading')).toContainText('Editing A')

  await page.getByLabel('Enter your name:').fill('foo')

  await page.getByRole('button', { name: 'Go to next step' }).click()
  await expect(page.getByRole('heading')).toContainText('Editing A')

  await expect(page.getByRole('button', { name: 'Proceed' })).toBeVisible()
})

test('Proceeding through blocked navigation works', async ({ page }) => {
  await page.goto('/editing-a')
  await expect(page.getByRole('heading')).toContainText('Editing A')

  await page.getByLabel('Enter your name:').fill('foo')

  await page.getByRole('button', { name: 'Go to next step' }).click()
  await expect(page.getByRole('heading')).toContainText('Editing A')

  await page.getByRole('button', { name: 'Proceed' }).click()
  await expect(page.getByRole('heading')).toContainText('Editing B')
})

test("legacy useBlocker doesn't block navigation if condition is not met", async ({
  page,
}) => {
  await page.goto('/editing-b')
  await expect(page.getByRole('heading')).toContainText('Editing B')

  await page.getByRole('button', { name: 'Go back' }).click()
  await expect(page.getByRole('heading')).toContainText('Editing A')
})

test('legacy useBlocker does block navigation if condition is met', async ({
  page,
}) => {
  await page.goto('/editing-b')
  await expect(page.getByRole('heading')).toContainText('Editing B')

  await page.getByLabel('Enter your name:').fill('foo')

  await page.getByRole('button', { name: 'Go back' }).click()
  await expect(page.getByRole('heading')).toContainText('Editing B')

  await expect(page.getByRole('button', { name: 'Proceed' })).toBeVisible()
})

test('legacy Proceeding through blocked navigation works', async ({ page }) => {
  await page.goto('/editing-b')
  await expect(page.getByRole('heading')).toContainText('Editing B')

  await page.getByLabel('Enter your name:').fill('foo')

  await page.getByRole('button', { name: 'Go back' }).click()
  await expect(page.getByRole('heading')).toContainText('Editing B')

  await page.getByRole('button', { name: 'Proceed' }).click()
  await expect(page.getByRole('heading')).toContainText('Editing A')
})

test('useCanGoBack correctly disables back button', async ({ page }) => {
  const getBackButtonDisabled = async () => {
    const backButton = page.getByTestId('back-button')
    const isDisabled = (await backButton.getAttribute('disabled')) !== null
    return isDisabled
  }

  expect(await getBackButtonDisabled()).toBe(true)

  await page.getByRole('link', { name: 'Posts' }).click()
  await expect(page.getByTestId('posts-links')).toBeInViewport()
  expect(await getBackButtonDisabled()).toBe(false)

  await page.getByRole('link', { name: 'sunt aut facere repe' }).click()
  await expect(page.getByTestId('post-title')).toBeInViewport()
  expect(await getBackButtonDisabled()).toBe(false)

  await page.reload()
  expect(await getBackButtonDisabled()).toBe(false)

  await page.goBack()
  expect(await getBackButtonDisabled()).toBe(false)

  await page.goForward()
  expect(await getBackButtonDisabled()).toBe(false)

  await page.goBack()
  expect(await getBackButtonDisabled()).toBe(false)

  await page.goBack()
  expect(await getBackButtonDisabled()).toBe(true)

  await page.reload()
  expect(await getBackButtonDisabled()).toBe(true)
})

test('useCanGoBack correctly disables back button, using router.history and window.history', async ({
  page,
}) => {
  const getBackButtonDisabled = async () => {
    const backButton = page.getByTestId('back-button')
    const isDisabled = (await backButton.getAttribute('disabled')) !== null
    return isDisabled
  }

  await page.getByRole('link', { name: 'Posts' }).click()
  await expect(page.getByTestId('posts-links')).toBeInViewport()
  await page.getByRole('link', { name: 'sunt aut facere repe' }).click()
  await expect(page.getByTestId('post-title')).toBeInViewport()
  await page.getByTestId('back-button').click()
  expect(await getBackButtonDisabled()).toBe(false)

  await page.reload()
  expect(await getBackButtonDisabled()).toBe(false)

  await page.getByTestId('back-button').click()
  expect(await getBackButtonDisabled()).toBe(true)

  await page.evaluate('window.history.forward()')
  expect(await getBackButtonDisabled()).toBe(false)

  await page.evaluate('window.history.forward()')
  expect(await getBackButtonDisabled()).toBe(false)

  await page.evaluate('window.history.back()')
  expect(await getBackButtonDisabled()).toBe(false)

  await page.evaluate('window.history.back()')
  expect(await getBackButtonDisabled()).toBe(true)

  await page.reload()
  expect(await getBackButtonDisabled()).toBe(true)
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

async function getRenderCount(page: Page) {
  const renderCount = parseInt(
    await page.getByTestId('render-count').innerText(),
  )
  return renderCount
}
async function structuralSharingTest(page: Page, enabled: boolean) {
  page.goto(`/structural-sharing/${enabled}/?foo=f1&bar=b1`)
  await expect(page.getByTestId('enabled')).toHaveText(JSON.stringify(enabled))

  async function checkSearch({ foo, bar }: { foo: string; bar: string }) {
    expect(page.url().endsWith(`?foo=${foo}&bar=${bar}`)).toBe(true)
    const expectedSearch = JSON.stringify({ values: [foo, bar] })
    await expect(page.getByTestId('search-via-hook')).toHaveText(expectedSearch)
    await expect(page.getByTestId('search-via-route-hook')).toHaveText(
      expectedSearch,
    )
    await expect(page.getByTestId('search-via-route-api-hook')).toHaveText(
      expectedSearch,
    )
  }

  await checkSearch({ bar: 'b1', foo: 'f1' })
  await page.getByTestId('link').click()
  await checkSearch({ bar: 'b2', foo: 'f2' })
}

test('structural sharing disabled', async ({ page }) => {
  await structuralSharingTest(page, false)
  expect(await getRenderCount(page)).toBeGreaterThan(2)
})

test('structural sharing enabled', async ({ page }) => {
  await structuralSharingTest(page, true)
  expect(await getRenderCount(page)).toBe(2)
  await page.getByTestId('link').click()
  expect(await getRenderCount(page)).toBe(2)
})
