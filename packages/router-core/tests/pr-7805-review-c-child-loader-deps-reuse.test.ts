import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

test('changed child loader deps invalidate only the child preload context', async () => {
  const parentBeforeLoad = vi.fn(({ preload }: { preload: boolean }) => ({
    parentSource: preload ? 'preload' : 'navigation',
  }))
  const childBeforeLoad = vi.fn(
    ({
      search,
      preload,
    }: {
      search: { version: number }
      preload: boolean
    }) => ({
      childVersion: search.version,
      childSource: preload ? 'preload' : 'navigation',
    }),
  )
  const childLoader = vi.fn(
    ({
      deps,
      context,
      preload,
    }: {
      deps: { version: number }
      context: {
        parentSource: string
        childVersion: number
        childSource: string
      }
      preload: boolean
    }) => ({ deps, context, preload }),
  )
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const parentRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/parent',
    preloadStaleTime: Infinity,
    preloadGcTime: Infinity,
    beforeLoad: parentBeforeLoad,
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => parentRoute,
    path: '/child',
    validateSearch: (search: Record<string, unknown>) => ({
      version: Number(search.version),
    }),
    loaderDeps: ({ search }) => ({ version: search.version }),
    preloadStaleTime: Infinity,
    beforeLoad: childBeforeLoad,
    loader: childLoader,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      parentRoute.addChildren([childRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  await router.preloadRoute({
    to: '/parent/child',
    search: { version: 1 },
  })

  const cachedParent = router.stores.cachedMatches
    .get()
    .find((match) => match.routeId === parentRoute.id)
  expect(cachedParent).toMatchObject({
    status: 'success',
    preload: true,
  })
  expect((cachedParent as any)?._preloadContext).toEqual(expect.any(Number))

  const plannedNavigation = router.matchRoutes(
    router.buildLocation({
      to: '/parent/child',
      search: { version: 2 },
    }),
  )
  const plannedParent = plannedNavigation.find(
    (match) => match.routeId === parentRoute.id,
  )
  expect(plannedParent?.id).toBe(cachedParent?.id)
  expect((plannedParent as any)?._preloadContext).toBe(
    (cachedParent as any)?._preloadContext,
  )

  await router.navigate({
    to: '/parent/child',
    search: { version: 2 },
  })

  expect(
    parentBeforeLoad.mock.calls.map(([context]) => context.preload),
  ).toEqual([true])
  expect(
    childBeforeLoad.mock.calls.map(([context]) => ({
      search: context.search,
      preload: context.preload,
    })),
  ).toEqual([
    { search: { version: 1 }, preload: true },
    { search: { version: 2 }, preload: false },
  ])
  expect(childLoader).toHaveBeenCalledTimes(2)
  expect(router.state.matches.at(-1)?.context).toEqual({
    parentSource: 'preload',
    childVersion: 2,
    childSource: 'navigation',
  })
  expect(router.state.matches.at(-1)?.loaderData).toEqual({
    deps: { version: 2 },
    context: {
      parentSource: 'preload',
      childVersion: 2,
      childSource: 'navigation',
    },
    preload: false,
  })
})
