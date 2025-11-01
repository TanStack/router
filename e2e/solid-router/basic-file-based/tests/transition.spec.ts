import { expect, test } from '@playwright/test'

test('transitions should keep old values visible during navigation', async ({
  page,
}) => {
  // Navigate to the transition test route
  await page.goto('/transition')

  // Wait for initial values to load
  await expect(page.getByTestId('n-value')).toContainText('n: 1')
  await expect(page.getByTestId('double-value')).toContainText('double: 2')

  // Set up a listener to capture all text content changes
  const bodyTexts: Array<string> = []

  // Poll the body text during the transition
  const pollInterval = setInterval(async () => {
    const text = await page
      .locator('body')
      .textContent()
      .catch(() => '')
    if (text) bodyTexts.push(text)
  }, 50)

  // Click the increase button to trigger navigation with new search params
  await page.getByTestId('increase-button').click()

  // Wait a bit to capture text during the transition
  await page.waitForTimeout(200)

  clearInterval(pollInterval)

  // Eventually, new values should appear
  await expect(page.getByTestId('n-value')).toContainText('n: 2', {
    timeout: 2000,
  })
  await expect(page.getByTestId('double-value')).toContainText('double: 4', {
    timeout: 2000,
  })

  // CRITICAL TEST: Verify "Loading..." was never shown during the transition
  // With proper transitions, old values should remain visible until new ones arrive
  const hasLoadingText = bodyTexts.some((text) => text.includes('Loading...'))

  if (hasLoadingText) {
    throw new Error(
      'FAILED: "Loading..." appeared during navigation. ' +
        'Solid Router should use transitions to keep old values visible.',
    )
  }
})
