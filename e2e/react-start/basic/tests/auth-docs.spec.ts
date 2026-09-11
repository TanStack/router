import { expect, test } from '@playwright/test'

test('authentication docs pattern handles login, logout, route context, and server authorization', async ({
  page,
}) => {
  await page.goto('/auth-docs/private')
  await expect(page).toHaveURL(/\/auth-docs$/)
  await expect(page.getByTestId('auth-docs-user')).toHaveText('Signed out')

  await page
    .getByRole('button', { name: 'Request private data directly' })
    .click()
  await expect(page.getByTestId('auth-docs-private-result')).toHaveText(
    'Access denied',
  )

  await page.getByLabel('Email', { exact: true }).fill('reader@example.com')
  await page.getByLabel('Password', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid credentials')
  await expect(page.getByTestId('auth-docs-user')).toHaveText('Signed out')

  await page.getByLabel('Password', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page).toHaveURL(/\/auth-docs\/private$/)
  await expect(page.getByTestId('auth-docs-user')).toHaveText(
    'reader@example.com',
  )
  await expect(page.getByTestId('auth-docs-private-page')).toHaveText(
    'Private account data',
  )

  await page.reload()
  await expect(page.getByTestId('auth-docs-user')).toHaveText(
    'reader@example.com',
  )
  await page.getByRole('button', { name: 'Logout', exact: true }).click()
  await expect(page).toHaveURL(/\/auth-docs$/)
  await expect(page.getByTestId('auth-docs-user')).toHaveText('Signed out')
  await page
    .getByRole('button', { name: 'Request private data directly' })
    .click()
  await expect(page.getByTestId('auth-docs-private-result')).toHaveText(
    'Access denied',
  )
  await page.goto('/auth-docs/private')
  await expect(page).toHaveURL(/\/auth-docs$/)
})
