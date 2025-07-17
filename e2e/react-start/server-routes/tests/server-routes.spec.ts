import { expect, test } from '@playwright/test'

test('merge-server-fn-middleware-context', async ({ page }) => {
  await page.goto('/merge-server-fn-middleware-context')

  await page.waitForLoadState('networkidle')

  await page.getByTestId('test-middleware-context-btn').click()
  await page.waitForLoadState('networkidle')

  await expect(page.getByTestId('has-test-parent')).toContainText('true')
  await expect(page.getByTestId('has-test')).toContainText('true')

  const contextResult = await page.getByTestId('context-result').textContent()
  expect(contextResult).toContain('testParent')
  expect(contextResult).toContain('test')
})