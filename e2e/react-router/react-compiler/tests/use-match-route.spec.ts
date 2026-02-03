import { expect, test } from '@playwright/test'
import { getTestServerPort } from '@tanstack/router-e2e-utils'
import packageJson from '../package.json' with { type: 'json' }

const PORT = await getTestServerPort(packageJson.name)

/**
 * This e2e test verifies that useMatchRoute works correctly with React Compiler enabled.
 *
 * Without the fix, React Compiler would memoize the matchRoute callback with stale
 * router state, causing it to return incorrect match results after navigation.
 *
 * With the fix, the callback properly updates when navigation occurs, so the match
 * status is always accurate.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/home')
})

test('useMatchRoute should update after navigation with React Compiler', async ({
  page,
}) => {
  // Initially at /home
  await expect(page.getByTestId('match-home')).toHaveText('true')
  await expect(page.getByTestId('match-about')).toHaveText('false')
  await expect(page.getByTestId('content-home')).toBeVisible()

  // Navigate to /about
  await page.getByTestId('link-about').click()

  // After navigation, matchRoute should correctly identify we're at /about
  // Without the fix, this would fail because matchRoute would still think we're at /home
  await expect(page.getByTestId('match-home')).toHaveText('false')
  await expect(page.getByTestId('match-about')).toHaveText('true')
  await expect(page.getByTestId('content-about')).toBeVisible()

  // Navigate back to /home to verify it works both ways
  await page.getByTestId('link-home').click()

  await expect(page.getByTestId('match-home')).toHaveText('true')
  await expect(page.getByTestId('match-about')).toHaveText('false')
  await expect(page.getByTestId('content-home')).toBeVisible()
})

test('useMatchRoute should correctly highlight active navigation', async ({
  page,
}) => {
  // Home link should be highlighted (green background)
  await expect(page.getByTestId('link-home')).toHaveCSS(
    'background-color',
    'rgb(76, 175, 80)',
  )

  // About link should not be highlighted (gray background)
  await expect(page.getByTestId('link-about')).toHaveCSS(
    'background-color',
    'rgb(221, 221, 221)',
  )

  // Navigate to about
  await page.getByTestId('link-about').click()

  // Now About should be highlighted
  await expect(page.getByTestId('link-about')).toHaveCSS(
    'background-color',
    'rgb(76, 175, 80)',
  )

  // And Home should not be highlighted
  await expect(page.getByTestId('link-home')).toHaveCSS(
    'background-color',
    'rgb(221, 221, 221)',
  )
})
