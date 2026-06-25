import { expect, test } from '@playwright/test'

test('initial child beforeLoad redirect after async root beforeLoad does not blank (https://github.com/TanStack/router/issues/7457)', async ({
  page,
}) => {
  const pageErrors: Array<string> = []
  const consoleErrors: Array<string> = []

  page.on('pageerror', (error) => {
    pageErrors.push(error.message || String(error))
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  await page.goto('/')

  await expect(page).toHaveURL(/\/another$/)
  await expect(page.getByText('Hello "/another"!')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => (globalThis as any).__pendingSeen))
    .toBe(true)
  await expect(page.getByTestId('app-pending')).not.toBeVisible()
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})
