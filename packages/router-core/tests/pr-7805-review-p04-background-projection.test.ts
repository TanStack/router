import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'
import {
  findMatch,
  waitForMacrotask,
} from './pr-7805-review-client-transaction-utils'

test('P04: a discarded background projection cannot mutate the still-presented committed generation', async () => {
  const leafReload = createControlledPromise<{ revision: number }>()
  const leafReloadStarted = createControlledPromise<void>()
  const backgroundHead = createControlledPromise<{
    meta: Array<{ title: string }>
  }>()
  const backgroundHeadStarted = createControlledPromise<void>()
  const slowLoader = createControlledPromise<void>()
  let leafLoaderCalls = 0
  let rootHeadCalls = 0

  const rootRoute = new BaseRootRoute({
    head: () => {
      rootHeadCalls++
      if (rootHeadCalls === 3) {
        backgroundHeadStarted.resolve()
        return backgroundHead
      }
      return {
        meta: [
          {
            title: rootHeadCalls === 1 ? 'initial' : 'foreground-refresh',
          },
        ],
      }
    },
  })
  const leafRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/leaf',
    staleTime: Infinity,
    loader: () => {
      leafLoaderCalls++
      if (leafLoaderCalls === 1) {
        return { revision: 1 }
      }
      leafReloadStarted.resolve()
      return leafReload
    },
  })
  const slowRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/slow',
    loader: () => slowLoader,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([leafRoute, slowRoute]),
    history: createMemoryHistory({ initialEntries: ['/leaf'] }),
  })

  await router.load()
  expect(findMatch(router, rootRoute.id)?.meta).toEqual([{ title: 'initial' }])
  let invalidation: Promise<void> | undefined
  let slowNavigation: Promise<void> | undefined
  try {
    invalidation = router.invalidate({
      filter: (match) => match.routeId === leafRoute.id,
    })
    await invalidation
    await leafReloadStarted

    const presentedRoot = findMatch(router, rootRoute.id)!
    expect(presentedRoot.meta).toEqual([{ title: 'foreground-refresh' }])

    leafReload.resolve({ revision: 2 })
    await backgroundHeadStarted

    slowNavigation = router.navigate({ to: '/slow' })
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/slow')
      expect(router.state.status).toBe('pending')
    })
    expect(findMatch(router, rootRoute.id)).toBe(presentedRoot)

    backgroundHead.resolve({ meta: [{ title: 'discarded-background' }] })
    await waitForMacrotask()
    await waitForMacrotask()
    const metadataAfterDiscard = presentedRoot.meta

    slowLoader.resolve()
    await slowNavigation

    // The background writer lost transaction currentness before its head result
    // settled. Its projection must remain private just like its loader data;
    // mutating this public object bypasses the match stores entirely.
    expect(metadataAfterDiscard).toEqual([{ title: 'foreground-refresh' }])
  } finally {
    leafReload.resolve({ revision: 2 })
    backgroundHead.resolve({ meta: [{ title: 'discarded-background' }] })
    slowLoader.resolve()
    await Promise.allSettled([
      invalidation ?? Promise.resolve(),
      slowNavigation ?? Promise.resolve(),
    ])
    await waitForMacrotask()
    await waitForMacrotask()
  }
})
