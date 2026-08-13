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
 * `<Navigate>` must issue its navigation once, however often the component
 * rendering it re-renders.
 */

test('<Navigate> issues once when the redirect component subscribes to router state', async ({
  page,
}) => {
  await page.goto('/redirect-router-state')

  await expect(page.getByTestId('target-content')).toBeVisible()
  await expect(page.getByTestId('pathname')).toHaveText('/target')

  const stats = await page.evaluate(() => window.__navigateStats)

  // Self-sustaining: the navigation itself is what re-renders the component,
  // so this loops with no external input and a synchronous destination.
  expect(stats.loopDetected).toBe(false)
})

test('<Navigate> issues once when an external store re-renders the redirect component', async ({
  page,
}) => {
  await page.goto('/redirect-external-store')

  await expect(page.getByTestId('target-content')).toBeVisible()
  await expect(page.getByTestId('pathname')).toHaveText('/async-target')

  const stats = await page.evaluate(() => window.__navigateStats)

  expect(stats.loopDetected).toBe(false)
  // Each re-issue supersedes the pending navigation and restarts the
  // destination guard, which is what makes the loop cost requests.
  expect(stats.targetBeforeLoads).toBe(1)
})

test('<Navigate> issues once when search is passed as an updater function', async ({
  page,
}) => {
  await page.goto('/redirect-function-search')

  await expect(page.getByTestId('target-content')).toBeVisible()
  await expect(page.getByTestId('pathname')).toHaveText('/target')

  const stats = await page.evaluate(() => window.__navigateStats)

  // Inline updater functions are fresh on every render, so guarding on the
  // props alone - by identity or by value - does not hold here.
  expect(stats.loopDetected).toBe(false)
})
