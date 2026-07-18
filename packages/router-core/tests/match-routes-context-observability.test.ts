import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'
import type { AnyRouteMatch } from '../src'

test('route context sees params and preliminary context on descendant matches', () => {
  const rootContext = vi.fn(
    ({ matches }: { matches: Array<AnyRouteMatch> }) => ({
      descendantParams: matches[1]?.params,
      descendantContext: matches[1]?.context,
    }),
  )
  const rootRoute = new BaseRootRoute({ context: rootContext } as any)
  const childRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/users/$userId',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([childRoute]),
    history: createMemoryHistory({ initialEntries: ['/users/42'] }),
    context: { inherited: 'router context' },
  })

  const matches = router.matchRoutes('/users/42')

  expect(rootContext).toHaveBeenCalledOnce()
  expect(matches[0]?.context).toMatchObject({
    descendantParams: { userId: '42' },
    descendantContext: { inherited: 'router context' },
  })
})

test('route context observes cache changes made by an ancestor context callback', () => {
  let clearCache = false
  let generation = 'cached'
  const childContext = vi.fn(() => ({ generation }))
  const rootRoute = new BaseRootRoute({
    context: () => {
      if (clearCache) {
        router.clearCache()
      }
      return {}
    },
  } as any)
  const childRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/child',
    context: childContext,
  } as any)
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([childRoute]),
    history: createMemoryHistory({ initialEntries: ['/child'] }),
  })

  const cachedChild = router
    .matchRoutes('/child')
    .find((match) => match.routeId === childRoute.id)!
  router.stores.setCached([cachedChild])
  generation = 'fresh'
  clearCache = true

  const rematchedChild = router
    .matchRoutes('/child')
    .find((match) => match.routeId === childRoute.id)

  expect(childContext).toHaveBeenCalledTimes(2)
  expect(rematchedChild?.context).toMatchObject({ generation: 'fresh' })
})
