import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

// Its own file: nothing in this module graph has mounted a route module, so
// the router has no route-module translation installed.
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
    router.buildLocation({ to: '/', _module: '@acme/products' } as any),
  ).toThrow(
    'Route module "@acme/products" is not installed in this router. Mount it with mountRouteModule() in the route tree of the app.',
  )
  expect(router.buildLocation({ to: '/' }).pathname).toBe('/')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

test('in production the failure is a compact invariant', () => {
  vi.stubEnv('NODE_ENV', 'production')
  const rootRoute = new BaseRootRoute({})
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      new BaseRoute({ getParentRoute: () => rootRoute, path: '/' }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  expect(() =>
    router.buildLocation({ to: '/', _module: '@acme/products' } as any),
  ).toThrow('Invariant failed')
})
