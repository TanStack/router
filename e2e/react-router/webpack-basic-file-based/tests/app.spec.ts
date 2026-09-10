import { expect, test } from '@playwright/test'

test('Navigating between routes on the client', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading')).toContainText('Welcome Home!')

  await page.getByRole('link', { name: 'About' }).click()
  await expect(page.getByRole('heading')).toContainText('About')

  await page.getByRole('link', { name: 'Nest', exact: true }).click()
  await expect(page.getByRole('heading')).toContainText('Nest Index')

  await page.getByRole('link', { name: 'Nest Foo' }).click()
  await expect(page.getByRole('heading')).toContainText('Nest Foo')
})

test('Directly loading a nested route (SPA fallback)', async ({ page }) => {
  // historyApiFallback must rewrite this request to index.html, and
  // output.publicPath must resolve the bundle from the root, not /nest/
  const response = await page.goto('/nest/foo')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading')).toContainText('Nest Foo')
})

test('Reloading the page at a nested route', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Nest Foo' }).click()
  await expect(page.getByRole('heading')).toContainText('Nest Foo')

  await page.reload()
  await expect(page.getByRole('heading')).toContainText('Nest Foo')
  expect(page.url()).toContain('/nest/foo')
})

test('Directly loading a nested index route', async ({ page }) => {
  const response = await page.goto('/nest')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading')).toContainText('Nest Index')
})
