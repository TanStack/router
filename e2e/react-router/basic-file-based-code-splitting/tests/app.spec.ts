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

test('Navigating to a route where the lazy component fails to load', async ({
  page,
}) => {
  // block (and count) all requests to the posts.index route component
  let requested = 0
  await page.route('**/assets/posts.index-*', (route) => {
    requested++
    return route.fulfill({
      status: 404,
      contentType: 'text/plain',
      body: 'Not Found!',
    })
  })

  // count how many times the page reloads
  let reloaded = 0
  page.on('load', () => {
    reloaded++
  })

  // navigate to the posts page
  await page.getByRole('link', { name: 'Posts' }).click()

  // will reload only once, despite failing twice, because the name of the module is the same both times
  await expect(() => {
    expect(reloaded).toBe(1)
    expect(requested).toBe(2)
  }).toPass({
    intervals: [50],
    timeout: 3000,
  })

  // the error component should be rendered
  await page.getByText('This is the error component')

  // make sure it doesn't reload again (handle edge-case where `.toPass` above was executed right before a 2nd page reload)
  await page.waitForTimeout(200)
  expect(reloaded).toBe(1)
})
