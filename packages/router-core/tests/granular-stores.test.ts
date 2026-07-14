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
    expect(router.stores.cachedMatches.get()).toEqual(cachedMatches)
    cachedMatches.forEach((match) => {
      const store = router.stores.cachedMatchStores.get(match.id)
      expect(store).toBeDefined()
      expect(store!.routeId).toBe(match.routeId)
      expect(store!.get()).toBe(match)
      expect(router.stores.matchStores.get(match.id)).toBeUndefined()
    })

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

  test('match pool updates are isolated to the touched active or cached match', async () => {
    const router = createRouter()
    await router.navigate({ to: '/posts/123' })

    const activeMatches = router.state.matches
    const cachedMatches = activeMatches.map((match) => ({
      ...match,
      id: `${match.id}__cached`,
    }))
    router.stores.setCached(cachedMatches)

    const touchedIndex = activeMatches.length - 1
    const activeStoresBefore = activeMatches.map((match) =>
      router.stores.matchStores.get(match.id),
    )
    const activeStatesBefore = activeStoresBefore.map((store) => store?.get())
    const cachedStoresBefore = cachedMatches.map((match) =>
      router.stores.cachedMatchStores.get(match.id),
    )
    const cachedStatesBefore = cachedStoresBefore.map((store) => store?.get())
    const nextActiveMatches = activeMatches.map((match, index) =>
      index === touchedIndex
        ? { ...match, updatedAt: match.updatedAt + 1 }
        : match,
    )

    router.stores.setMatches(nextActiveMatches)

    for (let i = 0; i < activeMatches.length; i++) {
      const store = router.stores.matchStores.get(activeMatches[i]!.id)
      expect(store).toBe(activeStoresBefore[i])
      expect(store?.get()).toBe(
        i === touchedIndex ? nextActiveMatches[i] : activeStatesBefore[i],
      )
    }
    for (let i = 0; i < cachedMatches.length; i++) {
      const store = router.stores.cachedMatchStores.get(cachedMatches[i]!.id)
      expect(store).toBe(cachedStoresBefore[i])
      expect(store?.get()).toBe(cachedStatesBefore[i])
    }

    const nextCachedMatches = cachedMatches.map((match, index) =>
      index === touchedIndex
        ? { ...match, updatedAt: match.updatedAt + 1 }
        : match,
    )

    router.stores.setCached(nextCachedMatches)

    for (let i = 0; i < activeMatches.length; i++) {
      const store = router.stores.matchStores.get(activeMatches[i]!.id)
      expect(store).toBe(activeStoresBefore[i])
      expect(store?.get()).toBe(nextActiveMatches[i])
    }
    for (let i = 0; i < cachedMatches.length; i++) {
      const store = router.stores.cachedMatchStores.get(cachedMatches[i]!.id)
      expect(store).toBe(cachedStoresBefore[i])
      expect(store?.get()).toBe(
        i === touchedIndex ? nextCachedMatches[i] : cachedStatesBefore[i],
      )
    }
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

    const cachedMatches = activeMatches.map((match) => ({
      ...match,
      id: `${match.id}__cached`,
    }))
    router.stores.setCached(cachedMatches)

    const cachedMatchesBefore = router.stores.cachedMatches.get()
    const cachedStoresBefore = cachedMatches.map((match) =>
      router.stores.cachedMatchStores.get(match.id),
    )
    const cachedStatesBefore = cachedStoresBefore.map((store) => store?.get())

    router.stores.setCached(cachedMatchesBefore)

    expect(router.stores.cachedMatches.get()).toBe(cachedMatchesBefore)
    for (let i = 0; i < cachedMatches.length; i++) {
      const match = cachedMatches[i]!
      const store = router.stores.cachedMatchStores.get(match.id)
      expect(store).toBe(cachedStoresBefore[i])
      expect(store?.get()).toBe(cachedStatesBefore[i])
    }
  })

  test('supports duplicate ids across active and cached pools without contamination', async () => {
    const router = createRouter()
    await router.navigate({ to: '/posts/123' })

    const activeLeaf = router.state.matches[1]!
    const activeStore = router.stores.matchStores.get(activeLeaf.id)
    const cachedDuplicate = {
      ...activeLeaf,
      updatedAt: activeLeaf.updatedAt + 1,
    }

    router.stores.setCached([cachedDuplicate])

    const cachedStore = router.stores.cachedMatchStores.get(activeLeaf.id)
    expect(activeStore).toBeDefined()
    expect(cachedStore).toBeDefined()
    expect(cachedStore).not.toBe(activeStore)
    expect(cachedStore?.get()).toBe(cachedDuplicate)

    const nextActiveLeaf = {
      ...activeLeaf,
      updatedAt: activeLeaf.updatedAt + 2,
    }
    router.stores.setMatches(
      router.state.matches.map((match) =>
        match.id === activeLeaf.id ? nextActiveLeaf : match,
      ),
    )

    expect(activeStore?.get()).toBe(nextActiveLeaf)
    expect(router.stores.getRouteMatchStore(activeLeaf.routeId).get()).toBe(
      nextActiveLeaf,
    )
    expect(cachedStore?.get()).toBe(cachedDuplicate)
    expect(router.stores.cachedMatches.get()[0]).toBe(cachedDuplicate)

    const nextCachedDuplicate = {
      ...cachedDuplicate,
      updatedAt: activeLeaf.updatedAt + 3,
    }
    router.stores.setCached([nextCachedDuplicate])

    expect(cachedStore?.get()).toBe(nextCachedDuplicate)
    expect(activeStore?.get()).toBe(nextActiveLeaf)
  })
})
