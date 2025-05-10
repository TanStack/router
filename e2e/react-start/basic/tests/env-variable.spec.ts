import { expect, test } from '@playwright/test'

test('Navigating to post', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText('DATABASE_URL: test123')).toBeVisible()
})