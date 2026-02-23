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
  test('keeps lookup stores correct across active/pending/cached transitions', async () => {
    const router = createRouter()
    await router.navigate({ to: '/posts/123' })

    const activeMatches = router.state.matches
    const pendingMatches = [...activeMatches].reverse().map((match, index) => ({
      ...match,
      id: `${match.id}__pending_${index}`,
    }))
    const cachedMatches = [...activeMatches].map((match, index) => ({
      ...match,
      id: `${match.id}__cached_${index}`,
    }))

    expect(Object.keys(router.stores.byId.state)).toEqual(
      activeMatches.map((match) => match.id),
    )
    expect(Object.keys(router.stores.byRouteId.state)).toEqual(
      activeMatches.map((match) => match.routeId),
    )
    activeMatches.forEach((match) => {
      expect(router.stores.byId.state[match.id]).toBe(
        router.stores.activeMatchStoresById.get(match.id),
      )
      expect(router.stores.byRouteId.state[match.routeId]).toBe(
        router.stores.activeMatchStoresById.get(match.id),
      )
    })

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
    expect(Object.keys(router.stores.pendingByRouteId.state)).toEqual(
      pendingMatches.map((match) => match.routeId),
    )
    const activeStoreByRouteId = Object.fromEntries(
      activeMatches.map((match) => [
        match.routeId,
        router.stores.activeMatchStoresById.get(match.id),
      ]),
    )
    pendingMatches.forEach((match) => {
      expect(router.stores.pendingByRouteId.state[match.routeId]).toBe(
        router.stores.pendingMatchStoresById.get(match.id),
      )
      expect(router.stores.byId.state[match.id]).toBeUndefined()
      expect(router.stores.byRouteId.state[match.routeId]).toBe(
        activeStoreByRouteId[match.routeId],
      )
    })

    const nextActiveMatches = activeMatches.map((match, index) => ({
      ...match,
      id: `${match.id}__active_next_${index}`,
    }))
    router.stores.setActiveMatches(nextActiveMatches)

    expect(router.stores.matchesId.state).toEqual(
      nextActiveMatches.map((match) => match.id),
    )
    expect(Object.keys(router.stores.byId.state)).toEqual(
      nextActiveMatches.map((match) => match.id),
    )
    expect(Object.keys(router.stores.byRouteId.state)).toEqual(
      nextActiveMatches.map((match) => match.routeId),
    )
    nextActiveMatches.forEach((match) => {
      expect(router.stores.byId.state[match.id]).toBe(
        router.stores.activeMatchStoresById.get(match.id),
      )
      expect(router.stores.byRouteId.state[match.routeId]).toBe(
        router.stores.activeMatchStoresById.get(match.id),
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

    const rootStore = router.stores.byId.state[rootMatch.id]
    const leafStore = router.stores.byId.state[leafMatch.id]

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

    expect(router.stores.byId.state[duplicatedId]?.state.status).toBe('error')
    expect(router.stores.byRouteId.state[activeLeaf.routeId]?.state.status).toBe(
      'error',
    )
    expect(
      router.stores.pendingByRouteId.state[activeLeaf.routeId]?.state.status,
    ).toBe('pending')
    expect(router.stores.pendingMatchesSnapshot.state[0]?.status).toBe(
      'pending',
    )
    expect(router.stores.cachedMatchesSnapshot.state[0]?.status).toBe('success')
    expect(router.getMatch(duplicatedId)?.status).toBe('success')
  })
})
