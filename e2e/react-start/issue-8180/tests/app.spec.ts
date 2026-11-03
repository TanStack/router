import { expect, test } from '@playwright/test'

const cases = [
  { name: 'synchronous beforeLoad', path: '/?delay=sync' },
  { name: 'beforeLoad after one microtask', path: '/?delay=microtask' },
  { name: 'longer asynchronous beforeLoad', path: '/?delay=longer' },
]

for (const testCase of cases) {
  test(`#8180: ${testCase.name} does not report browser errors during hydration`, async ({
    page,
  }) => {
    const browserErrors: Array<string> = []
    page.on('console', (message) => {
      if (message.type() === 'error') {
        browserErrors.push(message.text())
      }
    })
    page.on('pageerror', (error) => {
      browserErrors.push(error.message)
    })

    const response = await page.goto(testCase.path)
    expect(response?.ok()).toBe(true)
    await expect(page.getByTestId('hydrated')).toBeVisible()

    expect(browserErrors).toEqual([])
  })
}
