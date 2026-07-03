import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * A settled success stay-match must keep its abortController un-aborted
 * across navigations and invalidations: loaders can hand that signal to
 * still-streaming deferred data (fetch(url, { signal }) consumed via
 * <Await>), and the documented contract only cancels the signal when the
 * route unloads or the loader call becomes outdated. Only pending or
 * actively-fetching matches are cancelled at load start.
 */

function setup() {
  let capturedSignal: AbortSignal | undefined

  const rootRoute = new BaseRootRoute({})
  const dashboardRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    staleTime: Infinity,
    loader: ({ abortController }: { abortController: AbortController }) => {
      capturedSignal = abortController.signal
      return 'dashboard data'
    },
  })
  const settingsRoute = new BaseRoute({
    getParentRoute: () => dashboardRoute,
    path: '/settings',
  })

  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      dashboardRoute.addChildren([settingsRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
  })

  return { router, getSignal: () => capturedSignal }
}

describe('stay-match abort scope', () => {
  test('navigating to a child route does not abort a fresh success stay-match', async () => {
    const { router, getSignal } = setup()

    await router.load()
    expect(getSignal()?.aborted).toBe(false)

    await router.navigate({ to: '/dashboard/settings' })
    expect(getSignal()?.aborted).toBe(false)
  })

  test('invalidate does not abort a success stay-match signal', async () => {
    const { router, getSignal } = setup()

    await router.load()
    const firstSignal = getSignal()
    expect(firstSignal?.aborted).toBe(false)

    await router.invalidate()
    expect(firstSignal?.aborted).toBe(false)
  })
})
