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

    const pendingMatches = [...activeMatches].reverse().map((match, index) => ({
      ...match,
      id: `${match.id}__pending_${index}`,
    }))
    const cachedMatches = [...activeMatches].map((match, index) => ({
      ...match,
      id: `${match.id}__cached_${index}`,
    }))

    router.stores.setPending(pendingMatches)
    router.stores.setCached(cachedMatches)

    expect(router.stores.matchesId.get()).toEqual(
      activeMatches.map((match) => match.id),
    )
    expect(router.stores.pendingIds.get()).toEqual(
      pendingMatches.map((match) => match.id),
    )
    expect(router.stores.cachedIds.get()).toEqual(
      cachedMatches.map((match) => match.id),
    )

    // Pending pool has correct routeIds
    pendingMatches.forEach((match) => {
      const pendingStore = router.stores.pendingMatchStores.get(match.id)
      expect(pendingStore).toBeDefined()
      expect(pendingStore!.routeId).toBe(match.routeId)
      // Pending match is NOT in the active pool
      expect(router.stores.matchStores.get(match.id)).toBeUndefined()
      // Active pool still has a match for this routeId
      expect(
        router.stores.getRouteMatchStore(match.routeId).get(),
      ).toBeDefined()
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

    const rootStore = router.stores.matchStores.get(rootMatch.id)
    const leafStore = router.stores.matchStores.get(leafMatch.id)

    expect(rootStore).toBeDefined()
    expect(leafStore).toBeDefined()

    if (!rootStore || !leafStore) {
      throw new Error('Expected root and leaf match stores to exist')
    }

    const rootBefore = rootStore.get()
    const leafBefore = leafStore.get()

    router.updateMatch(leafMatch.id, (prev) => ({
      ...prev,
      status: 'pending',
    }))

    expect(rootStore.get()).toBe(rootBefore)
    expect(leafStore.get()).not.toBe(leafBefore)
    expect(leafStore.get().status).toBe('pending')
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

    const pendingMatches = activeMatches.map((match) => ({
      ...match,
      id: `${match.id}__pending`,
      status: 'pending' as const,
    }))

    router.stores.setPending(pendingMatches)

    const pendingIdsBefore = router.stores.pendingIds.get()
    const pendingStoresBefore = pendingMatches.map((match) =>
      router.stores.pendingMatchStores.get(match.id),
    )
    const pendingStatesBefore = pendingStoresBefore.map((store) => store?.get())

    router.stores.setPending(pendingMatches)

    expect(router.stores.pendingIds.get()).toBe(pendingIdsBefore)
    for (let i = 0; i < pendingMatches.length; i++) {
      const match = pendingMatches[i]!
      const store = router.stores.pendingMatchStores.get(match.id)
      expect(store).toBe(pendingStoresBefore[i])
      expect(store?.get()).toBe(pendingStatesBefore[i])
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

    const activeStore = router.stores.matchStores.get(activeLeaf.id)

    expect(activeStore).toBeDefined()

    if (!activeStore) {
      throw new Error('Expected active leaf store to exist')
    }

    const activeBefore = activeStore.get()

    const reloadPromise = router.load()
    await Promise.resolve()

    const pendingStore = router.stores.pendingMatchStores.get(activeLeaf.id)

    expect(pendingStore).toBeDefined()
    expect(router.stores.matchStores.get(activeLeaf.id)).toBe(activeStore)

    if (!pendingStore) {
      throw new Error('Expected pending leaf store to exist')
    }

    router.updateMatch(activeLeaf.id, (prev) => ({
      ...prev,
      status: 'error',
      error: new Error('pending-only-update'),
    }))

    expect(activeStore.get()).toBe(activeBefore)
    expect(activeStore.get().status).toBe('success')
    expect(pendingStore.get().status).toBe('error')
    expect(pendingStore.get().error).toEqual(new Error('pending-only-update'))

    resolveLoader()
    await reloadPromise
  })

  test('hasPending reflects the pending pool as well as active statuses', async () => {
    const router = createRouter()
    await router.navigate({ to: '/posts/123' })

    expect(router.stores.hasPending.get()).toBe(false)

    const activeLeaf = router.state.matches[1]!
    router.stores.setPending([
      {
        ...activeLeaf,
        id: `${activeLeaf.id}__pending`,
        status: 'pending' as const,
      },
    ])
    expect(router.stores.hasPending.get()).toBe(true)

    router.stores.setPending([])
    expect(router.stores.hasPending.get()).toBe(false)

    router.updateMatch(activeLeaf.id, (prev) => ({
      ...prev,
      status: 'pending' as const,
    }))
    expect(router.stores.hasPending.get()).toBe(true)
  })

  test('commitPending hands pending stores to the active pool, preserving identity', async () => {
    const router = createRouter()
    await router.navigate({ to: '/posts/123' })

    const leaf = router.state.matches[1]!
    router.stores.setMatches([])

    const pending = {
      ...leaf,
      id: `${leaf.id}__handoff`,
      status: 'pending' as const,
    }

    router.stores.setPending([pending])
    const pendingStore = router.stores.pendingMatchStores.get(pending.id)
    expect(pendingStore).toBeDefined()

    router.stores.commitPending([pending])

    expect(router.stores.matchStores.get(pending.id)).toBe(pendingStore)
    expect(router.stores.pendingMatchStores.get(pending.id)).toBeUndefined()
    expect(router.stores.pendingIds.get()).toEqual([])
    expect(router.stores.matchesId.get()).toEqual([pending.id])
  })

  test('commitPending applies late writes to the pending store, not the caller snapshot', async () => {
    const router = createRouter()
    await router.navigate({ to: '/posts/123' })

    const leaf = router.state.matches[1]!
    router.stores.setMatches([])

    const pending = {
      ...leaf,
      id: `${leaf.id}__race`,
      status: 'pending' as const,
    }
    router.stores.setPending([pending])

    const snapshot = router.stores.pendingMatches.get()

    const lateValue = {
      ...pending,
      status: 'success' as const,
      loaderData: { version: 'late-write' },
    }
    router.stores.pendingMatchStores.get(pending.id)!.set(lateValue)

    router.stores.commitPending(snapshot)

    const activeStore = router.stores.matchStores.get(pending.id)!
    expect(activeStore.get().status).toBe('success')
    expect(activeStore.get().loaderData).toEqual({ version: 'late-write' })
    expect(router.stores.hasPending.get()).toBe(false)
  })

  test('commitPending keeps the existing active store when active and pending share an id', async () => {
    const router = createRouter()
    await router.navigate({ to: '/posts/123' })

    const activeLeaf = router.state.matches[1]!
    const activeStoreBefore = router.stores.matchStores.get(activeLeaf.id)!
    expect(activeStoreBefore).toBeDefined()

    router.stores.setPending([{ ...activeLeaf, status: 'pending' as const }])
    const pendingStore = router.stores.pendingMatchStores.get(activeLeaf.id)!
    expect(pendingStore).not.toBe(activeStoreBefore)

    const committedValue = {
      ...activeLeaf,
      status: 'success' as const,
      loaderData: { version: 'committed' },
    }
    pendingStore.set(committedValue)

    router.stores.commitPending([committedValue])

    const activeStoreAfter = router.stores.matchStores.get(activeLeaf.id)
    expect(activeStoreAfter).toBe(activeStoreBefore)
    expect(activeStoreAfter!.get().status).toBe('success')
    expect(activeStoreAfter!.get().loaderData).toEqual({ version: 'committed' })
    expect(router.stores.pendingMatchStores.get(activeLeaf.id)).toBeUndefined()
    expect(router.stores.pendingIds.get()).toEqual([])
  })

  test('commitPending drops ids no longer in the commit list', async () => {
    const router = createRouter()
    await router.navigate({ to: '/posts/123' })

    const activeMatchesBefore = router.state.matches
    const staleId = activeMatchesBefore[1]!.id

    const nextMatches = [
      activeMatchesBefore[0]!,
      {
        ...activeMatchesBefore[1]!,
        id: `${staleId}__renamed`,
      },
    ]
    router.stores.setPending([nextMatches[1]!])

    router.stores.commitPending(nextMatches)

    expect(router.stores.matchStores.get(staleId)).toBeUndefined()
    expect(router.stores.matchStores.get(nextMatches[1]!.id)).toBeDefined()
    expect(router.stores.matchesId.get()).toEqual(
      nextMatches.map((match) => match.id),
    )
    expect(router.stores.pendingIds.get()).toEqual([])
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

    router.stores.setPending([pendingDuplicate])
    router.stores.setCached([cachedDuplicate])

    router.stores.setMatches(
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

    expect(router.stores.matchStores.get(duplicatedId)?.get().status).toBe(
      'error',
    )
    expect(
      router.stores.getRouteMatchStore(activeLeaf.routeId).get()?.status,
    ).toBe('error')
    // Pending pool has its own store for this id
    expect(
      router.stores.pendingMatchStores.get(duplicatedId)?.get().status,
    ).toBe('pending')
    expect(router.stores.pendingMatches.get()[0]?.status).toBe('pending')
    expect(router.stores.cachedMatches.get()[0]?.status).toBe('success')
    expect(router.getMatch(duplicatedId)?.status).toBe('success')
  })
})
