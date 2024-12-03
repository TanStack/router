import { expect } from '@playwright/test'
import { test } from './utils'
import type { Page } from '@playwright/test'

test.beforeEach(async ({ page, setupApp }) => {
  const { ADDR } = setupApp
  await page.goto(ADDR + '/')
})

test.afterEach(async ({ setupApp }) => {
  await setupApp.killProcess()
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

test('navigating to an unnested route', async ({ page, setupApp }) => {
  const { ADDR } = setupApp
  const postId = 'hello-world'
  page.goto(ADDR + `/posts/${postId}/edit`)
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
async function structuralSharingTest(
  page: Page,
  baseUrl: string,
  enabled: boolean,
) {
  page.goto(baseUrl + `/structural-sharing/${enabled}/?foo=f1&bar=b1`)
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

test('structural sharing disabled', async ({ page, setupApp }) => {
  await structuralSharingTest(page, setupApp.ADDR, false)
  expect(await getRenderCount(page)).toBeGreaterThan(2)
})

test('structural sharing enabled', async ({ page, setupApp }) => {
  await structuralSharingTest(page, setupApp.ADDR, true)
  expect(await getRenderCount(page)).toBe(2)
  await page.getByTestId('link').click()
  expect(await getRenderCount(page)).toBe(2)
})
