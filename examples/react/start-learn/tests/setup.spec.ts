import { expect, test } from '@playwright/test'
test('setup renders useful server HTML', async ({ request, page }) => {
  const response = await request.get('/')
  expect(response.status()).toBe(200)
  expect(await response.text()).toContain('Keep a record of what you learn.')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Field notes' })).toBeVisible()
})
