import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, RouterCore } from '../src'

type UnsubscribeResult = (() => void) | { unsubscribe: () => void }

function cleanupSubscription(subscription: UnsubscribeResult) {
  if (typeof subscription === 'function') {
    subscription()
    return
  }
  subscription.unsubscribe()
}

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

  return new RouterCore({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/'],
    }),
  })
}

describe('granular stores', () => {
  test('keeps id stores ordered with each pool', async () => {
    const router = createRouter()
    await router.navigate({ to: '/posts/123' })

    const activeMatches = router.state.matches
    const pendingMatches = [...activeMatches]
      .reverse()
      .map((match, index) => ({
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

    let rootUpdates = 0
    let leafUpdates = 0

    const unsubscribeRoot = rootStore.subscribe(() => {
      rootUpdates++
    })
    const unsubscribeLeaf = leafStore.subscribe(() => {
      leafUpdates++
    })

    router.updateMatch(leafMatch.id, (prev) => ({
      ...prev,
      status: 'pending',
    }))

    cleanupSubscription(unsubscribeRoot)
    cleanupSubscription(unsubscribeLeaf)

    expect(rootUpdates).toBe(0)
    expect(leafUpdates).toBe(1)
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
    expect(router.stores.pendingMatchesSnapshot.state[0]?.status).toBe('pending')
    expect(router.stores.cachedMatchesSnapshot.state[0]?.status).toBe('success')
    expect(router.getMatch(duplicatedId)?.status).toBe('success')
  })
})
