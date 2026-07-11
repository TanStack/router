import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'
import type { AnyRouteMatch } from '../src'

function expectLaneIndices(matches: Array<AnyRouteMatch>) {
  expect.soft(matches.map((match) => match.index)).toEqual(
    matches.map((_, index) => index),
  )
}

test('a cached legacy notFoundRoute is reindexed when partial match depth changes', async () => {
  const notFoundLoader = vi.fn(() => 'not found')

  const rootRoute = new BaseRootRoute({})
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
  })
  const knownChildRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/known',
  })
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/home',
  })
  const legacyNotFoundRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/404',
    loader: notFoundLoader,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      parentRoute.addChildren([knownChildRoute]),
      homeRoute,
    ]),
    history: createMemoryHistory({
      initialEntries: ['/parent/missing'],
    }),
    notFoundRoute: legacyNotFoundRoute,
  })

  await router.load()

  const deepMatches = router.stores.matches.get()
  expect(deepMatches.map((match) => match.routeId)).toEqual([
    rootRoute.id,
    parentRoute.id,
    legacyNotFoundRoute.id,
  ])
  expectLaneIndices(deepMatches)
  expect(notFoundLoader).toHaveBeenCalledTimes(1)

  // Leaving the unmatched URL puts the successful notFound loader snapshot
  // in the cache at its original, deeper lane position.
  await router.navigate({ to: '/home' })
  const cachedNotFound = router.stores.cachedMatches
    .get()
    .find((match) => match.routeId === legacyNotFoundRoute.id)
  expect(cachedNotFound?.index).toBe(2)

  // A shallower unmatched URL appends the same legacy notFoundRoute directly
  // below root. Its match id is stable, but the changed parent/depth requires
  // a fresh generation whose context and loader run under the new parent.
  const next = router.buildLocation({ to: '/missing' } as any)
  const matched = router.matchRoutes(next, { preload: true })
  expect(matched.map((match) => match.routeId)).toEqual([
    rootRoute.id,
    legacyNotFoundRoute.id,
  ])
  expectLaneIndices(matched)

  const preloaded = await router.preloadRoute({ to: '/missing' } as any)
  expect(preloaded).toBeDefined()
  expectLaneIndices(preloaded!)
  expect(notFoundLoader).toHaveBeenCalledTimes(2)

  await router.navigate({ to: '/missing' } as any)

  const activeMatches = router.stores.matches.get()
  expect(activeMatches.map((match) => match.routeId)).toEqual([
    rootRoute.id,
    legacyNotFoundRoute.id,
  ])
  expectLaneIndices(activeMatches)

  // The cache-removal path also keys by match.index. A stale index leaves the
  // same match id active and cached at once.
  const activeIds = new Set(activeMatches.map((match) => match.id))
  expect(
    router.stores.cachedMatches
      .get()
      .filter((match) => activeIds.has(match.id)),
  ).toEqual([])
})

test('a reparented cached legacy notFoundRoute recomputes route context', async () => {
  const routeContextBranches: Array<unknown> = []
  const beforeLoadBranches: Array<unknown> = []
  const loaderBranches: Array<unknown> = []

  const rootRoute = new BaseRootRoute({
    context: () => ({ branch: 'root' }),
  })
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    context: () => ({ branch: 'parent' }),
  })
  const knownChildRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/known',
  })
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/home',
  })
  const legacyNotFoundRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/404',
    context: ({ context }: any) => {
      routeContextBranches.push(context.branch)
      return { routeContextBranch: context.branch }
    },
    beforeLoad: ({ context }: any) => {
      beforeLoadBranches.push(context.routeContextBranch)
      return { beforeLoadBranch: context.routeContextBranch }
    },
    loader: {
      staleReloadMode: 'blocking',
      handler: ({ context }: any) => {
        loaderBranches.push({
          route: context.routeContextBranch,
          beforeLoad: context.beforeLoadBranch,
        })
        return context.routeContextBranch
      },
    },
    staleTime: 0,
    gcTime: Infinity,
  })

  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      parentRoute.addChildren([knownChildRoute]),
      homeRoute,
    ]),
    history: createMemoryHistory({
      initialEntries: ['/parent/missing'],
    }),
    notFoundRoute: legacyNotFoundRoute,
  })

  await router.load()
  const deepMatch = router.stores.matches
    .get()
    .find((match) => match.routeId === legacyNotFoundRoute.id)!
  expect(deepMatch.context).toMatchObject({
    branch: 'parent',
    routeContextBranch: 'parent',
    beforeLoadBranch: 'parent',
  })

  await router.navigate({ to: '/home' })
  await router.navigate({ to: '/missing' } as any)

  const shallowMatch = router.stores.matches
    .get()
    .find((match) => match.routeId === legacyNotFoundRoute.id)!
  expect(shallowMatch.id).toBe(deepMatch.id)
  expect(shallowMatch.index).toBe(1)
  expect(shallowMatch.context).toMatchObject({
    branch: 'root',
    routeContextBranch: 'root',
    beforeLoadBranch: 'root',
  })
  expect(routeContextBranches).toEqual(['parent', 'root'])
  expect(beforeLoadBranches).toEqual(['parent', 'root'])
  expect(loaderBranches).toEqual([
    { route: 'parent', beforeLoad: 'parent' },
    { route: 'root', beforeLoad: 'root' },
  ])
})
