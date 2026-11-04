import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { isSpaMode } from './utils/isSpaMode'

// The prod SPA run and the dev SPA runs (`E2E_DEV_SERVER`) all run this file.
// The dev runs run nothing else.
test.skip(!isSpaMode, 'only SPA mode answers documents with the shell')

// Its loader and beforeLoad report where they ran.
const searchRoute = '/specialChars/search?searchParam=shell'

test('a document request gets the shell, not the rendered route', async ({
  request,
}) => {
  const response = await request.get(searchRoute)

  expect(response.status()).toBe(200)
  const html = await response.text()
  // The root route's document renders...
  expect(html).toContain('This Route Does Not Exist')
  // ...but not the matched route, nor its loader's output.
  expect(html).not.toContain('special-search-loaded-info')
  expect(html).not.toContain('Loaded on: server')
})

test('the route loads in the browser', async ({ page }) => {
  await page.goto(searchRoute)

  await expect(page.getByTestId('special-search-loaded-info')).toHaveText(
    'Loaded on: client',
  )
  await expect(page.getByTestId('special-search-before-load-info')).toHaveText(
    'Before load on: client',
  )
  await expect(page.getByTestId('special-search-param')).toHaveText('shell')
})

test('client navigation works from the shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading')).toContainText('Welcome Home')
  await expect(page.getByTestId('router-status')).toHaveText('idle')

  // A full page load would drop this.
  await page.evaluate(() => {
    ;(window as any).__spaShellPage = true
  })
  await page.getByRole('link', { name: 'Posts' }).click()
  await page.waitForURL('/posts')
  await expect(
    page.getByRole('link', { name: 'sunt aut facere repe' }),
  ).toBeVisible()
  expect(await page.evaluate(() => (window as any).__spaShellPage)).toBe(true)
})
