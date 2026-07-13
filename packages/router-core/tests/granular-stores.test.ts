import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

function createRouter() {
  const rootRoute = new BaseRootRoute({})

  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })

  const aboutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
  })

  const postRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/posts/$postId',
  })

  const routeTree = rootRoute.addChildren([indexRoute, aboutRoute, postRoute])

  return createTestRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/'],
    }),
  })
}

describe('granular stores', () => {
  test('keeps pool stores correct across active/cached transitions', async () => {
    const router = createRouter()
    await router.navigate({ to: '/posts/123' })

    const activeMatches = router.state.matches

    // Active pool contains all active matches with correct routeIds
    expect(router.stores.matchesId.get()).toEqual(
      activeMatches.map((match) => match.id),
    )
    activeMatches.forEach((match) => {
      const store = router.stores.matchStores.get(match.id)
      expect(store).toBeDefined()
      expect(store!.routeId).toBe(match.routeId)
      // getRouteMatchStore resolves to the same state
      expect(router.stores.getRouteMatchStore(match.routeId).get()).toBe(
        store!.get(),
      )
    })

    const cachedMatches = [...activeMatches].map((match, index) => ({
      ...match,
      id: `${match.id}__cached_${index}`,
    }))

    router.stores.setCached(cachedMatches)

    expect(router.stores.matchesId.get()).toEqual(
      activeMatches.map((match) => match.id),
    )
    const nextActiveMatches = activeMatches.map((match, index) => ({
      ...match,
      id: `${match.id}__active_next_${index}`,
    }))
    router.stores.setMatches(nextActiveMatches)

    expect(router.stores.matchesId.get()).toEqual(
      nextActiveMatches.map((match) => match.id),
    )
    nextActiveMatches.forEach((match) => {
      const store = router.stores.matchStores.get(match.id)
      expect(store).toBeDefined()
      expect(store!.routeId).toBe(match.routeId)
      expect(router.stores.getRouteMatchStore(match.routeId).get()).toBe(
        store!.get(),
      )
    })
  })

  test('getRouteMatchStore caches store instances and clears when route is inactive', async () => {
    const router = createRouter()
    await router.navigate({ to: '/posts/123' })

    const postsStore = router.stores.getRouteMatchStore('/posts/$postId')

    expect(router.stores.getRouteMatchStore('/posts/$postId')).toBe(postsStore)
    expect(postsStore.get()?.routeId).toBe('/posts/$postId')

    await router.navigate({ to: '/about' })

    expect(router.stores.getRouteMatchStore('/posts/$postId')).toBe(postsStore)
    expect(postsStore.get()).toBeUndefined()
  })

  test('no-op match pool reconciliation preserves ids and match state references', async () => {
    const router = createRouter()
    await router.navigate({ to: '/posts/123' })

    const activeMatches = router.state.matches
    const activeIdsBefore = router.stores.matchesId.get()
    const activeStoresBefore = activeMatches.map((match) =>
      router.stores.matchStores.get(match.id),
    )
    const activeStatesBefore = activeStoresBefore.map((store) => store?.get())

    router.stores.setMatches(activeMatches)

    expect(router.stores.matchesId.get()).toBe(activeIdsBefore)
    expect(router.stores.matches.get()).toBe(activeMatches)
    for (let i = 0; i < activeMatches.length; i++) {
      const match = activeMatches[i]!
      const store = router.stores.matchStores.get(match.id)
      expect(store).toBe(activeStoresBefore[i])
      expect(store?.get()).toBe(activeStatesBefore[i])
    }
  })
})
