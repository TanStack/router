import { expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { getScopedRouterView } from '../src/route-module-internal'
import { createTestRouter } from './routerTestUtils'

// Its own file: nothing in this module graph has created or mounted a module
// root, so the route-module behavior is not installed and the router names
// the module in development.
test('navigating into a route module without any mounted module fails', () => {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  expect(() =>
    getScopedRouterView(router, '@acme/products').buildLocation({
      to: '/',
    } as any),
  ).toThrow(
    'Route module "@acme/products" is not installed in this router. Mount it with mountRouteModule() in the route tree of the app.',
  )
  expect(router.buildLocation({ to: '/' }).pathname).toBe('/')
})
