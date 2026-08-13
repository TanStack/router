import { expect, test } from '@playwright/test'

interface NavigateStats {
  redirectRenders: number
  targetBeforeLoads: number
  loopDetected: boolean
}

declare global {
  interface Window {
    __navigateStats: NavigateStats
  }
}

/**
 * `<Navigate>` must issue its navigation once, even when the component
 * rendering it re-renders while the destination's `beforeLoad` is pending.
 * Re-issuing supersedes the in-flight navigation, so a regression here never
 * commits the navigation at all.
 */

test('<Navigate> commits once when the redirect component subscribes to router state', async ({
  page,
}) => {
  await page.goto('/redirect-router-state')

  await expect(page.getByTestId('target-content')).toBeVisible()
  await expect(page.getByTestId('pathname')).toHaveText('/target')

  const stats = await page.evaluate(() => window.__navigateStats)

  expect(stats.loopDetected).toBe(false)
  expect(stats.targetBeforeLoads).toBe(1)
})

test('<Navigate> commits once when an external store re-renders the redirect component', async ({
  page,
}) => {
  await page.goto('/redirect-external-store')

  await expect(page.getByTestId('target-content')).toBeVisible()
  await expect(page.getByTestId('pathname')).toHaveText('/target')

  const stats = await page.evaluate(() => window.__navigateStats)

  expect(stats.loopDetected).toBe(false)
  // A re-issued navigation restarts the destination guard; the fix keeps this
  // at exactly one run no matter how often the redirect component re-renders.
  expect(stats.targetBeforeLoads).toBe(1)
})

test('<Navigate> commits once when search is passed as an updater function', async ({
  page,
}) => {
  await page.goto('/redirect-function-search')

  await expect(page.getByTestId('target-content')).toBeVisible()
  await expect(page.getByTestId('pathname')).toHaveText('/target')

  const stats = await page.evaluate(() => window.__navigateStats)

  // Inline updater functions are fresh on every render, so guarding on the
  // props alone - by identity or by value - does not hold here.
  expect(stats.loopDetected).toBe(false)
  expect(stats.targetBeforeLoads).toBe(1)
})
