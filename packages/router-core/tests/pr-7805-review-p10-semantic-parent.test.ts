import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'
import { findMatch } from './pr-7805-review-client-transaction-utils'

test('P10: a blocking child consumes the fresh semantic parent from a background reload', async () => {
  const parentReload = createControlledPromise<{ revision: number }>()
  const parentReloadStarted = createControlledPromise<void>()
  const childReloadStarted = createControlledPromise<void>()
  const parentRunaway = new Error('unexpected third parent loader invocation')
  const childRunaway = new Error('unexpected third child loader invocation')
  let parentLoaderCalls = 0
  let childLoaderCalls = 0

  const rootRoute = new BaseRootRoute({})
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    staleTime: 0,
    loader: () => {
      parentLoaderCalls++
      if (parentLoaderCalls > 2) {
        throw parentRunaway
      }
      if (parentLoaderCalls === 2) {
        parentReloadStarted.resolve()
      }
      return parentLoaderCalls === 1 ? { revision: 1 } : parentReload
    },
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    staleTime: 0,
    loader: {
      staleReloadMode: 'blocking',
      handler: async ({ parentMatchPromise }) => {
        childLoaderCalls++
        if (childLoaderCalls > 2) {
          throw childRunaway
        }
        if (childLoaderCalls === 2) {
          childReloadStarted.resolve()
        }
        const parentMatch = await parentMatchPromise
        return {
          parentRevision: (parentMatch.loaderData as { revision: number })
            .revision,
        }
      },
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
  })

  await router.load()
  expect(findMatch(router, childRoute.id)?.loaderData).toEqual({
    parentRevision: 1,
  })

  // The foreground transaction is allowed to settle with the old parent
  // visible while its private candidate reloads. The blocking child still has
  // to await that private semantic parent generation.
  const reload = router.load()
  try {
    await Promise.all([parentReloadStarted, childReloadStarted])
    expect(parentLoaderCalls).toBe(2)
    expect(childLoaderCalls).toBe(2)
    parentReload.resolve({ revision: 2 })
    await reload
    await vi.waitFor(() => {
      expect(findMatch(router, parentRoute.id)?.loaderData).toEqual({
        revision: 2,
      })
    })

    expect(parentLoaderCalls).toBe(2)
    expect(childLoaderCalls).toBe(2)
    expect(findMatch(router, childRoute.id)?.loaderData).toEqual({
      parentRevision: 2,
    })
  } finally {
    parentReload.resolve({ revision: 2 })
    await Promise.allSettled([reload])
  }
})
