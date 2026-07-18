import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'
import { findMatch } from './pr-7805-review-client-transaction-utils'

test('N03: a late preload cannot cache a child derived from a superseded parent generation', async () => {
  const childObservedParent = createControlledPromise<void>()
  const childMayFinish = createControlledPromise<void>()
  const parentReload = createControlledPromise<{ revision: number }>()
  let parentLoaderCalls = 0
  let childLoaderCalls = 0

  const rootRoute = new BaseRootRoute({})
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    staleTime: Infinity,
    loader: () => {
      parentLoaderCalls++
      return parentLoaderCalls === 1 ? { revision: 1 } : parentReload
    },
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    staleTime: Infinity,
    loader: async ({ parentMatchPromise }) => {
      childLoaderCalls++
      const parent = await parentMatchPromise
      const parentRevision = (parent.loaderData as { revision: number })
        .revision
      childObservedParent.resolve()
      await childMayFinish
      return { parentRevision }
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/parent'] }),
  })

  await router.load()
  const stalePreload = router.preloadRoute({ to: '/parent/child' })
  let navigation: Promise<void> | undefined
  try {
    await childObservedParent

    await router.invalidate({
      filter: (match) => match.routeId === parentRoute.id,
    })
    expect(parentLoaderCalls).toBe(2)
    parentReload.resolve({ revision: 2 })
    await vi.waitFor(() => {
      expect(findMatch(router, parentRoute.id)?.loaderData).toEqual({
        revision: 2,
      })
    })

    childMayFinish.resolve()
    await stalePreload
    navigation = router.navigate({ to: '/parent/child' })
    await navigation

    expect(parentLoaderCalls).toBe(2)
    // Rejecting the stale child at cache publication makes navigation run it
    // again against the now-current parent generation.
    expect.soft(childLoaderCalls).toBe(2)
    expect(findMatch(router, childRoute.id)?.loaderData).toEqual({
      parentRevision: 2,
    })
  } finally {
    parentReload.resolve({ revision: 2 })
    childMayFinish.resolve()
    await Promise.allSettled([stalePreload, navigation ?? Promise.resolve()])
  }
})

test('N03: a navigation cannot adopt an in-flight child from a superseded parent generation', async () => {
  const staleChildObservedParent = createControlledPromise<void>()
  const staleChildMayFinish = createControlledPromise<void>()
  const parentReload = createControlledPromise<{ revision: number }>()
  let parentLoaderCalls = 0
  let childLoaderCalls = 0

  const rootRoute = new BaseRootRoute({})
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    staleTime: Infinity,
    loader: () => {
      parentLoaderCalls++
      return parentLoaderCalls === 1 ? { revision: 1 } : parentReload
    },
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    staleTime: Infinity,
    loader: async ({ parentMatchPromise }) => {
      childLoaderCalls++
      const parent = await parentMatchPromise
      const parentRevision = (parent.loaderData as { revision: number })
        .revision
      if (childLoaderCalls === 1) {
        staleChildObservedParent.resolve()
        await staleChildMayFinish
      }
      return { parentRevision }
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/parent'] }),
  })

  await router.load()
  const childMatchId = router
    .matchRoutes('/parent/child')
    .find((match) => match.routeId === childRoute.id)!.id
  const stalePreload = router.preloadRoute({ to: '/parent/child' })
  let navigation: Promise<void> | undefined
  try {
    await staleChildObservedParent

    await router.invalidate({
      filter: (match) => match.routeId === parentRoute.id,
    })
    parentReload.resolve({ revision: 2 })
    await vi.waitFor(() => {
      expect(findMatch(router, parentRoute.id)?.loaderData).toEqual({
        revision: 2,
      })
    })

    navigation = router.navigate({ to: '/parent/child' })
    await vi.waitFor(() => {
      const sharedLeases = (router as any)._flights?.get(childMatchId)?.[2] ?? 0
      // Current code joins the stale flight (two leases). A generation-aware
      // implementation may instead start the fresh second loader immediately.
      expect(sharedLeases > 1 || childLoaderCalls === 2).toBe(true)
    })

    staleChildMayFinish.resolve()
    await Promise.all([stalePreload, navigation])

    expect(parentLoaderCalls).toBe(2)
    expect.soft(childLoaderCalls).toBe(2)
    expect(findMatch(router, childRoute.id)?.loaderData).toEqual({
      parentRevision: 2,
    })
  } finally {
    parentReload.resolve({ revision: 2 })
    staleChildMayFinish.resolve()
    await Promise.allSettled([stalePreload, navigation ?? Promise.resolve()])
  }
})
