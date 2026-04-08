import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test('SSR renders the home page', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await expect(page.getByTestId('home-heading')).toContainText('Welcome Home')
  await expect(page.getByTestId('home-message')).toContainText(
    'This is the rsbuild e2e test app.',
  )
})

test('navigation between routes works', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await page.getByText('Server Functions').click()
  await page.waitForLoadState('networkidle')

  await expect(page.getByTestId('server-fns-heading')).toContainText(
    'Server Functions',
  )
})

test('server function called from loader (SSR)', async ({ page }) => {
  await page.goto('/server-fns')
  await page.waitForLoadState('networkidle')

  await expect(page.getByTestId('loader-greeting')).toContainText(
    'Hello, Loader!',
  )
})

test('GET server function called from client', async ({ page }) => {
  await page.goto('/server-fns')
  await page.waitForLoadState('networkidle')

  await page.getByTestId('get-fn-btn').click()
  await page.waitForLoadState('networkidle')

  await expect(page.getByTestId('get-fn-result')).toContainText(
    'Hello, Client!',
  )
})

test('POST server function called from client', async ({ page }) => {
  await page.goto('/server-fns')
  await page.waitForLoadState('networkidle')

  await page.getByTestId('post-fn-btn').click()
  await page.waitForLoadState('networkidle')

  await expect(page.getByTestId('post-fn-result')).toContainText(
    'Echo: Hello from client',
  )
})
