import { expect, test } from '@playwright/test'

test('client context failure never hydrates transported success', async ({
  page,
  request,
  baseURL,
}) => {
  const response = await request.get(`${baseURL}/client-context-failure`)
  expect(response.ok()).toBe(true)
  const serverHtml = await response.text()
  expect(serverHtml).toContain('data-testid="client-context-success"')
  expect(serverHtml).toContain('>server success</div>')

  const pageErrors: Array<Error> = []
  page.on('pageerror', (error) => pageErrors.push(error))
  await page.addInitScript(() => {
    ;(window as any).__clientContextSuccessRenders = 0
  })
  await page.goto('/client-context-failure')

  await expect(page.getByTestId('client-context-error')).toHaveText(
    'Client context reconstruction failed',
  )
  await expect(page.getByTestId('client-context-success')).toHaveCount(0)
  expect(
    await page.evaluate(() => (window as any).__clientContextSuccessRenders),
  ).toBe(0)
  expect(pageErrors).toEqual([])
})
