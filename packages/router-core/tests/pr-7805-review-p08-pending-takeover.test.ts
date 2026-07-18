import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'
import { findMatch } from './pr-7805-review-client-transaction-utils'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('P08: same-boundary pending takeover republishes the successor search snapshot', async () => {
  vi.stubGlobal('scrollTo', vi.fn())
  const loaderGate = createControlledPromise<string>()
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const targetRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: () => null,
    loader: () => loaderGate,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  router.startTransition = async (publish) => {
    publish()
    return true
  }

  const firstNavigation = router.navigate({
    to: '/target',
    search: { revision: 'one' } as any,
  })
  await vi.waitFor(() => {
    expect(findMatch(router, targetRoute.id)).toMatchObject({
      status: 'pending',
      search: { revision: 'one' },
    })
  })

  const secondNavigation = router.navigate({
    to: '/target',
    search: { revision: 'two' } as any,
  })
  await vi.waitFor(() => {
    expect(router.state.location.search).toEqual({ revision: 'two' })
  })

  let visiblePendingSearch: unknown
  try {
    // A valid takeover may republish through the prior acknowledgement's
    // microtask. Give that publication a bounded opportunity before settling
    // the shared loader, which would replace the pending snapshot entirely.
    await vi.waitFor(() => {
      visiblePendingSearch = findMatch(router, targetRoute.id)?.search
      expect(visiblePendingSearch).toEqual({ revision: 'two' })
    })
  } finally {
    loaderGate.resolve('loaded')
    await Promise.all([firstNavigation, secondNavigation])
  }

  // Location and the visible pending lane belong to the same successor
  // transaction. Reusing the reveal/minimum-duration acknowledgement must not
  // reuse the predecessor's semantic snapshot.
  expect(visiblePendingSearch).toEqual({ revision: 'two' })
})
