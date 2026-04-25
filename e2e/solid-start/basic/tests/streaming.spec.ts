import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

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

test('streaming loader data', async ({ page }) => {
  await page.goto('/stream')

  await expect(page.getByTestId('promise-data')).toContainText('promise-data')
  await expect(page.getByTestId('stream-data')).toContainText('stream-data')
})

test('streams Await fallback for server function loader promises', async ({
  page,
}) => {
  const response = await page.request.get('/issue-6715')
  const html = await response.text()

  expect(html).toContain('data-testid="issue-6715-loading"')

  await page.goto('/issue-6715')
  await expect(page.getByTestId('issue-6715-data')).not.toBeEmpty()
})
