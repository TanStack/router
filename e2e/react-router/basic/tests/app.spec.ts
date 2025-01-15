import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('Navigating to a post page', async ({ page }) => {
  await page.getByRole('link', { name: 'Posts', exact: true }).click()
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

test('Navigating to a post page with viewTransition', async ({ page }) => {
  await page.getByRole('link', { name: 'View Transition', exact: true }).click()
  await page.getByRole('link', { name: 'sunt aut facere repe' }).click()
  await expect(page.getByRole('heading')).toContainText('sunt aut facere')
})

test('Navigating to a post page with viewTransition types', async ({
  page,
}) => {
  await page.getByRole('link', { name: 'View Transition types' }).click()
  await page.getByRole('link', { name: 'sunt aut facere repe' }).click()
  await expect(page.getByRole('heading')).toContainText('sunt aut facere')
})

test('#3162 - Binding an input to search params with stable cursor position', async ({
  page,
}) => {
  await page
    .getByRole('link', { name: 'Search Param Binding', exact: true })
    .click()
  expect(page.url()).toBe('http://localhost:3000/search-param-binding')

  await page.getByRole('textbox', { name: 'Filter' }).fill('Hello World')
  expect(page.getByRole('textbox', { name: 'Filter' })).toHaveValue('Hello World')
  expect(page.url()).toBe('http://localhost:3000/search-param-binding?filter=Hello%20World')

  await page.getByRole('textbox', { name: 'Filter' }).click()
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('ArrowLeft')
  }
  await page.keyboard.press('Space')
  await page.keyboard.press('H')
  await page.keyboard.press('A')
  await page.keyboard.press('P')
  await page.keyboard.press('P')
  await page.keyboard.press('Y')
  await page.getByRole('textbox', { name: 'Filter' }).blur()

  expect(page.getByRole('textbox', { name: 'Filter' })).toHaveValue('Hello Happy World')
  expect(page.url()).toBe('http://localhost:3000/search-param-binding?filter=Hello%20Happy%20World')})
