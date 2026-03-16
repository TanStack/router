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

function createLoaderRouter({
  initialEntries = ['/posts/123'],
  staleTime = 0,
}: {
  initialEntries?: Array<string>
  staleTime?: number
} = {}) {
  let resolveLoader: (() => void) | undefined
  let callCount = 0

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
    staleTime,
    loader: () => {
      callCount += 1

      if (callCount === 1) {
        return { version: 'initial' }
      }

      return new Promise<{ version: string }>((resolve) => {
        resolveLoader = () => resolve({ version: 'reloaded' })
      })
    },
  })

  const routeTree = rootRoute.addChildren([indexRoute, aboutRoute, postRoute])

  return {
    router: createTestRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries,
      }),
    }),
    resolveLoader: () => resolveLoader?.(),
  }
}

describe('granular stores', () => {
  test('keeps pool stores correct across active/pending/cached transitions', async () => {
    const router = createRouter()
    await router.navigate({ to: '/posts/123' })

    const activeMatches = router.state.matches

    // Active pool contains all active matches with correct routeIds
    expect(router.stores.matchesId.state).toEqual(
      activeMatches.map((match) => match.id),
    )
    activeMatches.forEach((match) => {
      const store = router.stores.activeMatchStoresById.get(match.id)
      expect(store).toBeDefined()
      expect(store!.routeId).toBe(match.routeId)
      // getMatchStoreByRouteId resolves to the same state
      expect(router.stores.getMatchStoreByRouteId(match.routeId).state).toBe(
        store!.state,
      )
    })

    const pendingMatches = [...activeMatches].reverse().map((match, index) => ({
      ...match,
      id: `${match.id}__pending_${index}`,
    }))
    const cachedMatches = [...activeMatches].map((match, index) => ({
      ...match,
      id: `${match.id}__cached_${index}`,
    }))

    router.stores.setPendingMatches(pendingMatches)
    router.stores.setCachedMatches(cachedMatches)

    expect(router.stores.matchesId.state).toEqual(
      activeMatches.map((match) => match.id),
    )
    expect(router.stores.pendingMatchesId.state).toEqual(
      pendingMatches.map((match) => match.id),
    )
    expect(router.stores.cachedMatchesId.state).toEqual(
      cachedMatches.map((match) => match.id),
    )

    // Pending pool has correct routeIds
    pendingMatches.forEach((match) => {
      const pendingStore = router.stores.pendingMatchStoresById.get(match.id)
      expect(pendingStore).toBeDefined()
      expect(pendingStore!.routeId).toBe(match.routeId)
      // Pending match is NOT in the active pool
      expect(router.stores.activeMatchStoresById.get(match.id)).toBeUndefined()
      // Active pool still has a match for this routeId
      expect(
        router.stores.getMatchStoreByRouteId(match.routeId).state,
      ).toBeDefined()
    })

    const nextActiveMatches = activeMatches.map((match, index) => ({
      ...match,
      id: `${match.id}__active_next_${index}`,
    }))
    router.stores.setActiveMatches(nextActiveMatches)

    expect(router.stores.matchesId.state).toEqual(
      nextActiveMatches.map((match) => match.id),
    )
    nextActiveMatches.forEach((match) => {
      const store = router.stores.activeMatchStoresById.get(match.id)
      expect(store).toBeDefined()
      expect(store!.routeId).toBe(match.routeId)
      expect(router.stores.getMatchStoreByRouteId(match.routeId).state).toBe(
        store!.state,
      )
    })
  })

  test('match store updates are isolated to the touched active match', async () => {
    const router = createRouter()
    await router.navigate({ to: '/posts/123' })

    const rootMatch = router.state.matches[0]
    const leafMatch = router.state.matches[1]

    expect(rootMatch).toBeDefined()
    expect(leafMatch).toBeDefined()

    if (!rootMatch || !leafMatch) {
      throw new Error('Expected root and leaf matches to exist')
    }

    const rootStore = router.stores.activeMatchStoresById.get(rootMatch.id)
    const leafStore = router.stores.activeMatchStoresById.get(leafMatch.id)

    expect(rootStore).toBeDefined()
    expect(leafStore).toBeDefined()

    if (!rootStore || !leafStore) {
      throw new Error('Expected root and leaf match stores to exist')
    }

    const rootBefore = rootStore.state
    const leafBefore = leafStore.state

    router.updateMatch(leafMatch.id, (prev) => ({
      ...prev,
      status: 'pending',
    }))

    expect(rootStore.state).toBe(rootBefore)
    expect(leafStore.state).not.toBe(leafBefore)
    expect(leafStore.state.status).toBe('pending')
  })

  test('getMatchStoreByRouteId caches store instances and clears when route is inactive', async () => {
    const router = createRouter()
    await router.navigate({ to: '/posts/123' })

    const postsStore = router.stores.getMatchStoreByRouteId('/posts/$postId')

    expect(router.stores.getMatchStoreByRouteId('/posts/$postId')).toBe(
      postsStore,
    )
    expect(postsStore.state?.routeId).toBe('/posts/$postId')

    await router.navigate({ to: '/about' })

    expect(router.stores.getMatchStoreByRouteId('/posts/$postId')).toBe(
      postsStore,
    )
    expect(postsStore.state).toBeUndefined()
  })

  test('no-op match pool reconciliation preserves ids and match state references', async () => {
    const router = createRouter()
    await router.navigate({ to: '/posts/123' })

    const activeMatches = router.state.matches
    const activeIdsBefore = router.stores.matchesId.state
    const activeStoresBefore = activeMatches.map((match) =>
      router.stores.activeMatchStoresById.get(match.id),
    )
    const activeStatesBefore = activeStoresBefore.map((store) => store?.state)

    router.stores.setActiveMatches(activeMatches)

    expect(router.stores.matchesId.state).toBe(activeIdsBefore)
    expect(router.stores.activeMatchesSnapshot.state).toBe(activeMatches)
    for (let i = 0; i < activeMatches.length; i++) {
      const match = activeMatches[i]!
      const store = router.stores.activeMatchStoresById.get(match.id)
      expect(store).toBe(activeStoresBefore[i])
      expect(store?.state).toBe(activeStatesBefore[i])
    }

    const pendingMatches = activeMatches.map((match) => ({
      ...match,
      id: `${match.id}__pending`,
      status: 'pending' as const,
    }))

    router.stores.setPendingMatches(pendingMatches)

    const pendingIdsBefore = router.stores.pendingMatchesId.state
    const pendingStoresBefore = pendingMatches.map((match) =>
      router.stores.pendingMatchStoresById.get(match.id),
    )
    const pendingStatesBefore = pendingStoresBefore.map((store) => store?.state)

    router.stores.setPendingMatches(pendingMatches)

    expect(router.stores.pendingMatchesId.state).toBe(pendingIdsBefore)
    for (let i = 0; i < pendingMatches.length; i++) {
      const match = pendingMatches[i]!
      const store = router.stores.pendingMatchStoresById.get(match.id)
      expect(store).toBe(pendingStoresBefore[i])
      expect(store?.state).toBe(pendingStatesBefore[i])
    }
  })

  test('updateMatch prefers the pending pool when active and pending share an id', async () => {
    const { router, resolveLoader } = createLoaderRouter()

    await router.load()

    const activeLeaf = router.state.matches[1]

    expect(activeLeaf).toBeDefined()

    if (!activeLeaf) {
      throw new Error('Expected active leaf match to exist')
    }

    const activeStore = router.stores.activeMatchStoresById.get(activeLeaf.id)

    expect(activeStore).toBeDefined()

    if (!activeStore) {
      throw new Error('Expected active leaf store to exist')
    }

    const activeBefore = activeStore.state

    const reloadPromise = router.load()
    await Promise.resolve()

    const pendingStore = router.stores.pendingMatchStoresById.get(activeLeaf.id)

    expect(pendingStore).toBeDefined()
    expect(router.stores.activeMatchStoresById.get(activeLeaf.id)).toBe(
      activeStore,
    )

    if (!pendingStore) {
      throw new Error('Expected pending leaf store to exist')
    }

    router.updateMatch(activeLeaf.id, (prev) => ({
      ...prev,
      status: 'error',
      error: new Error('pending-only-update'),
    }))

    expect(activeStore.state).toBe(activeBefore)
    expect(activeStore.state.status).toBe('success')
    expect(pendingStore.state.status).toBe('error')
    expect(pendingStore.state.error).toEqual(new Error('pending-only-update'))

    resolveLoader()
    await reloadPromise
  })

  test('supports duplicate ids across pools without cross-pool contamination', async () => {
    const router = createRouter()
    await router.navigate({ to: '/posts/123' })

    const activeLeaf = router.state.matches[1]!
    const duplicatedId = activeLeaf.id
    const pendingDuplicate = {
      ...activeLeaf,
      status: 'pending' as const,
    }
    const cachedDuplicate = {
      ...activeLeaf,
      status: 'success' as const,
    }

    router.stores.setPendingMatches([pendingDuplicate])
    router.stores.setCachedMatches([cachedDuplicate])

    router.stores.setActiveMatches(
      router.state.matches.map((match) =>
        match.id === duplicatedId
          ? {
              ...match,
              status: 'error' as const,
              error: new Error('active-only-update'),
            }
          : match,
      ),
    )

    expect(
      router.stores.activeMatchStoresById.get(duplicatedId)?.state.status,
    ).toBe('error')
    expect(
      router.stores.getMatchStoreByRouteId(activeLeaf.routeId).state?.status,
    ).toBe('error')
    // Pending pool has its own store for this id
    expect(
      router.stores.pendingMatchStoresById.get(duplicatedId)?.state.status,
    ).toBe('pending')
    expect(router.stores.pendingMatchesSnapshot.state[0]?.status).toBe(
      'pending',
    )
    expect(router.stores.cachedMatchesSnapshot.state[0]?.status).toBe('success')
    expect(router.getMatch(duplicatedId)?.status).toBe('success')
  })
})
