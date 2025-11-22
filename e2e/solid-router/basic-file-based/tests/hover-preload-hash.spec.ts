import { expect, test } from '@playwright/test'
import { toRuntimePath } from '@tanstack/router-e2e-utils'

// Solid variant of the hover-preload hash scroll regression test.

test('hovering links does not trigger hash scroll (no navigation) [solid]', async ({
  page,
}) => {
  // Go to a page with a hash target at the bottom
  await page.goto(toRuntimePath('/normal-page#at-the-bottom'))
  await expect(page.getByTestId('at-the-bottom')).toBeInViewport()

  // Scroll up so the hash target is no longer in view
  await page.evaluate(() => window.scrollBy(0, -300))
  await expect(page.getByTestId('at-the-bottom')).not.toBeInViewport()

  // Hover a header link to trigger intent preload (should NOT change scroll)
  await page.getByRole('link', { name: 'Head-/lazy-page' }).hover()
  await page.waitForTimeout(400)

  // Ensure we did not jump back to the hash target
  await expect(page.getByTestId('at-the-bottom')).not.toBeInViewport()
})
