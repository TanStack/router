import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('Navigating to a post page', async ({ page }) => {
  await page.getByRole('link', { name: 'Posts' }).click()
  await page.getByRole('link', { name: 'sunt aut facere repe' }).click()
  await expect(page.getByRole('heading')).toContainText('sunt aut facere')
})

test('Navigating to a not-found route', async ({ page }) => {
  await page.getByRole('link', { name: 'This Route Does Not Exist' }).click()
  await expect(page.getByRole('paragraph')).toContainText(
    'This is the notFoundComponent configured on root route',
  )
  await page.getByRole('link', { name: 'Start Over' }).click()
  await expect(page.getByRole('heading')).toContainText('Welcome Home!')
})
