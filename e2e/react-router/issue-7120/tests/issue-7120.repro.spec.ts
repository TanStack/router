import { expect, test } from '@playwright/test'

test('root beforeLoad redirect does not blank when pending UI and view transitions are enabled (https://github.com/TanStack/router/issues/7120)', async ({
  page,
}) => {
  const pageErrors: Array<string> = []
  const consoleErrors: Array<string> = []

  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  await page.goto('/')

  await expect(page).toHaveURL(/\/posts$/)
  await expect(page.getByText('sunt aut facere repe')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => (globalThis as any).__pendingSeen))
    .toBe(true)
  await expect(page.getByTestId('root-pending')).not.toBeVisible()
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})
