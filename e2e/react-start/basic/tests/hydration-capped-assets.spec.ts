import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { isPrerender } from './utils/isPrerender'
import { isSpaMode } from './utils/isSpaMode'

/**
 * Issue 7: on a direct SSR hard load, the server can intentionally cap the
 * committed match list at a parent notFound/error boundary. Hydration should not
 * project head/scripts for the child route that was omitted from the server
 * match list, because those assets can be added with missing or stale loader
 * data before the follow-up client load enforces the same boundary.
 *
 * This Playwright repro uses the real React Start app, a real browser page load,
 * the real SSR response, and normal client hydration. The parent route throws
 * notFound from beforeLoad, while its child route defines a meta tag and inline
 * script; neither child asset should appear after loading the capped parent
 * boundary response.
 */

test.use({
  whitelistErrors: [
    'Failed to load resource: the server responded with a status of 404',
  ],
})

test.describe('SSR hydration capped route assets', () => {
  test.skip(isSpaMode || isPrerender, 'SSR hydration repro only')

  test('does not project assets for a child route omitted by the server boundary', async ({
    page,
  }) => {
    await page.goto('/hydration-capped-assets/child')
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('issue-7-parent-not-found')).toBeInViewport()
    await expect(
      page.getByTestId('issue-7-child-route-component'),
    ).not.toBeInViewport()

    await expect(page.locator('meta[name="issue-7-child-head"]')).toHaveCount(0)
    expect(
      await page.evaluate(() =>
        Boolean((window as any).__ISSUE_7_CHILD_SCRIPT),
      ),
    ).toBe(false)
  })
})
