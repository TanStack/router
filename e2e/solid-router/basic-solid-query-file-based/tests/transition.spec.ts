import { expect, test } from '@playwright/test'

test('solid-query transitions keep previous data during navigation', async ({
  page,
}) => {
  await page.goto('/transition/count/query')

  await expect(page.getByTestId('n-value')).toContainText('n: 1')
  await expect(page.getByTestId('double-value')).toContainText('double: 2')

  const bodySnapshots: Array<string> = []

  const interval = setInterval(async () => {
    const text = await page
      .locator('body')
      .textContent()
      .catch(() => '')
    if (text) bodySnapshots.push(text)
  }, 50)

  await page.getByTestId('increase-button').click()

  await page.waitForTimeout(200)

  clearInterval(interval)

  await expect(page.getByTestId('n-value')).toContainText('n: 2', {
    timeout: 2_000,
  })
  await expect(page.getByTestId('double-value')).toContainText('double: 4', {
    timeout: 2_000,
  })

  const sawLoading = bodySnapshots.some((text) => text.includes('Loading...'))

  expect(sawLoading).toBeFalsy()
})
