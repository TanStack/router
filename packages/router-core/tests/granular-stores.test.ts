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

    router.reconcilePendingPool(pendingMatches)
    router.reconcileCachedPool(cachedMatches)

    expect(router.matchesIdStore.state).toEqual(
      activeMatches.map((match) => match.id),
    )
    expect(router.pendingMatchesIdStore.state).toEqual(
      pendingMatches.map((match) => match.id),
    )
    expect(router.cachedMatchesIdStore.state).toEqual(
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

    const rootStore = router.byIdStore.state[rootMatch.id]
    const leafStore = router.byIdStore.state[leafMatch.id]

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

    router.reconcilePendingPool([pendingDuplicate])
    router.reconcileCachedPool([cachedDuplicate])

    router.setActiveMatches(
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

    expect(router.byIdStore.state[duplicatedId]?.state.status).toBe('error')
    expect(router.pendingMatchesSnapshotStore.state[0]?.status).toBe('pending')
    expect(router.cachedMatchesSnapshotStore.state[0]?.status).toBe('success')
    expect(router.getMatch(duplicatedId)?.status).toBe('success')
  })

  test('__store.setState bridges into granular stores', async () => {
    const router = createRouter()
    await router.navigate({ to: '/posts/123' })

    const pendingMatch = {
      ...router.state.matches[1]!,
      status: 'pending' as const,
    }

    let compatNotifications = 0
    const unsubscribeCompat = router.__store.subscribe(() => {
      compatNotifications++
    })

    router.__store.setState((s) => ({
      ...s,
      status: 'pending',
      isLoading: true,
    }))
    router.reconcilePendingPool([pendingMatch])

    cleanupSubscription(unsubscribeCompat)

    expect(router.statusStore.state).toBe('pending')
    expect(router.isLoadingStore.state).toBe(true)
    expect(router.pendingMatchesIdStore.state).toEqual([pendingMatch.id])
    expect(router.pendingMatchesSnapshotStore.state[0]?.status).toBe('pending')
    expect(router.__store.state.status).toBe('pending')
    expect(compatNotifications).toBeGreaterThan(0)
  })
})
