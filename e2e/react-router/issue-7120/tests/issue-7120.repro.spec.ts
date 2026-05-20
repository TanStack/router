import { expect, test } from '@playwright/test'

test('root beforeLoad redirect does not blank when pending UI and view transitions are enabled', async ({
  page,
}) => {
  const pageErrors: Array<string> = []

  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })

  await page.goto('/')

  await expect(page).toHaveURL(/\/posts$/)
  await expect(page.getByText('sunt aut facere repe')).toBeVisible()
  await expect(page.getByTestId('root-pending')).not.toBeVisible()
  expect(pageErrors).toEqual([])
})
