import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test('updates head after a stale cached loader refreshes in the background', async ({
  page,
}) => {
  await page.goto('/')
  await page.evaluate(() => window.localStorage.clear())

  await page.goto('/article/123')
  await expect(page.getByTestId('article-not-found')).toBeVisible()
  await expect(page).toHaveTitle('Article Not Found')

  await page.getByTestId('login-link').click()
  await expect(page.getByTestId('login-page')).toBeVisible()
  await expect(page).toHaveTitle('Login')

  await page.getByTestId('login-button').click()
  await expect(page.getByTestId('dashboard')).toBeVisible()
  await expect(page).toHaveTitle('Dashboard')

  await page.goBack()
  await expect(page.getByTestId('article-content')).toBeVisible()
  await expect(page.getByTestId('article-title')).toHaveText(
    'Article 123 Title',
  )

  await expect(page).toHaveTitle('Article 123 Title')
})
