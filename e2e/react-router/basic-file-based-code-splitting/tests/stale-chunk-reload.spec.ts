import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * 404's on a lazy route's chunk are typically due to a re-deploy. Relead the
 * page to attempt to fetch the new bundle. In case this is an actual missing
 * chunk, we don't want to get stuck in a reload loop, so we key the error in
 * sessionStorage, only reloading if the key is absent. We clear the key on
 * a successful reload in case future 404s in the same session happen on the
 * same key.
 */
const GUARD_PREFIX = 'tanstack_router_reload:'

/**
 * Every assertion here polls, because the reload under test destroys the
 * execution context this reads from. Reading mid-navigation reports no keys
 * rather than a count, so a poll waits for the new document instead of failing
 * on it, and never mistakes a torn-down page for an empty guard.
 */
const guardKeys = async (page: Page): Promise<Array<string> | null> => {
  try {
    return await page.evaluate(
      (prefix) =>
        Object.keys(sessionStorage).filter((key) => key.startsWith(prefix)),
      GUARD_PREFIX,
    )
  } catch {
    return null
  }
}

const guardCount = (page: Page) =>
  guardKeys(page).then((keys) => keys?.length ?? null)

// Entries are keyed on the importer's source, which under Vite names the
// route's chunk.
const guardFor = (page: Page, route: string) =>
  guardKeys(page).then(
    (keys) => keys?.filter((key) => key.includes(`/${route}-`)).length ?? null,
  )

/**
 * Serve a 404 for the chunk of every route in `staleRoutes`, standing in for a
 * deploy that replaced it. Route handlers outlive reloads, so a route stays
 * stale until it is taken back out of the set.
 *
 * Both routes used here split only their component. A route that also splits
 * its loader fails earlier, in the router's own load lifecycle, and never
 * reaches the component this guard lives in.
 */
async function serveStaleChunks(page: Page, staleRoutes: Set<string>) {
  await page.route(/\/assets\//, (route) => {
    const url = route.request().url()
    const isStale = [...staleRoutes].some((name) => url.includes(`/${name}-`))
    return isStale ? route.fulfill({ status: 404, body: '' }) : route.fallback()
  })
}

test('a session recovers from a stale chunk more than once', async ({
  page,
}) => {
  const staleRoutes = new Set<string>()
  await serveStaleChunks(page, staleRoutes)

  await page.goto('/')
  await expect.poll(() => guardCount(page)).toBe(0)

  // First deploy: the failed navigation reloads the document once and records
  // that it did. The reload lands back on the same missing chunk, so the guard
  // also has to hold here — a second entry would mean a reload loop.
  staleRoutes.add('without-loader')
  await page.getByRole('link', { name: 'without-loader' }).click()
  await expect.poll(() => guardCount(page)).toBe(1)

  // Second deploy, a different route. It has to get an entry of its own, or
  // this navigation is treated as already reloaded and the session never
  // recovers. Counting entries would not say that: the route recovering above
  // releases its own entry, and whether it has by now depends on preloading.
  staleRoutes.delete('without-loader')
  staleRoutes.add('shared-singleton')
  await page.goto('/')
  await page.getByTestId('shared-singleton-link').click()
  await expect.poll(() => guardFor(page, 'shared-singleton')).toBe(1)
})

test('a module that loads again gets its reload back', async ({ page }) => {
  const staleRoutes = new Set<string>()
  await serveStaleChunks(page, staleRoutes)

  await page.goto('/')

  staleRoutes.add('without-loader')
  await page.getByRole('link', { name: 'without-loader' }).click()
  await expect.poll(() => guardCount(page)).toBe(1)

  // The chunk is back, standing in for the deploy the reload was reaching for.
  // Loading it has to release the entry, or this module can never reload again
  // — the case that bites bundlers whose importer names a chunk id rather than
  // a content hash, since there the key is identical from one build to the next.
  staleRoutes.delete('without-loader')
  await page.goto('/without-loader')
  await expect(page.getByText('Hello /without-loader!')).toBeVisible()
  await expect.poll(() => guardCount(page)).toBe(0)
})
