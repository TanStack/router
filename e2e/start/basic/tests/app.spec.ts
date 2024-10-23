import { expect, test } from '@playwright/test'

test('Navigating to post', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Posts' }).click()
  await page.getByRole('link', { name: 'sunt aut facere repe' }).click()
  await page.getByRole('link', { name: 'Deep View' }).click()
  await expect(page.getByRole('heading')).toContainText('sunt aut facere')
})

test('Navigating to user', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Users' }).click()
  await page.getByRole('link', { name: 'Leanne Graham' }).click()
  await expect(page.getByRole('heading')).toContainText('Leanne Graham')
})

test('Navigating nested layouts', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Layout', exact: true }).click()

  await expect(page.locator('#root')).toContainText("I'm a layout")
  await expect(page.locator('#root')).toContainText("I'm a nested layout")

  await page.getByRole('link', { name: 'Layout A' }).click()
  await expect(page.locator('#root')).toContainText("I'm layout A!")

  await page.getByRole('link', { name: 'Layout B' }).click()
  await expect(page.locator('#root')).toContainText("I'm layout B!")
})

test('Navigating to a not-found route', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'This Route Does Not Exist' }).click()
  await page.getByRole('link', { name: 'Start Over' }).click()
  await expect(page.getByRole('heading')).toContainText('Welcome Home!')
})

test('Navigating to deferred route', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Deferred' }).click()

  await expect(page.getByTestId('regular-person')).toContainText('John Doe')
  await expect(page.getByTestId('deferred-person')).toContainText(
    'Tanner Linsley',
  )
  await expect(page.getByTestId('deferred-stuff')).toContainText(
    'Hello deferred!',
  )
})

test('Directly visiting the deferred route', async ({ page }) => {
  await page.goto('/deferred')

  await expect(page.getByTestId('regular-person')).toContainText('John Doe')
  await expect(page.getByTestId('deferred-person')).toContainText(
    'Tanner Linsley',
  )
  await expect(page.getByTestId('deferred-stuff')).toContainText(
    'Hello deferred!',
  )
})

test('Directly visiting the search-params route without search param set', async ({
  page,
}) => {
  await page.goto('/search-params')
  await new Promise((r) => setTimeout(r, 500))
  await expect(page.getByTestId('search-param')).toContainText('a')
  expect(page.url().endsWith('/search-params?step=a'))
})

test('Directly visiting the search-params route with search param set', async ({
  page,
}) => {
  await page.goto('/search-params?step=b')
  await new Promise((r) => setTimeout(r, 500))
  await expect(page.getByTestId('search-param')).toContainText('b')
  expect(page.url().endsWith('/search-params?step=b'))
})

test('invoking a server function with custom response status code', async ({
  page,
}) => {
  await page.goto('/status')

  await page.waitForLoadState('networkidle')
  await page.getByTestId('invoke-server-fn').click()

  const requestPromise = new Promise<void>((resolve) => {
    page.on('response', async (response) => {
      expect(response.status()).toBe(225)
      expect(response.statusText()).toBe('hello')
      expect(response.headers()['content-type']).toBe('application/json')
      expect(await response.json()).toEqual({ hello: 'world' })
      resolve()
    })
  })
  await requestPromise
})
