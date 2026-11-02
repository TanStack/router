import { expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import {
  getScopedRouterView,
  installRouteModules,
  mountRouteModule,
} from '../src/route-module-internal'
import { createTestRouter } from './routerTestUtils'
import type { AnyRoute } from '../src'

// Its own file: the route-module behavior is installed once per process, and
// these tests run before anything installs it, like module code that is
// imported before the application creates its route-module router.

const routerRequired =
  'Invariant failed: Route modules need a route-module router. Create the router with createRouteModuleRouter().'

function createSettingsModule() {
  const root = new BaseRoute({ _module: '@acme/settings' } as any) as AnyRoute
  const profile = new BaseRoute({
    getParentRoute: () => root,
    path: '/profile',
  })
  root.addChildren([profile])
  return { root, profile }
}

test('an ordinary router rejects a route tree with route modules', () => {
  const rootRoute = new BaseRootRoute({})
  const { root } = createSettingsModule()
  mountRouteModule(root, {
    parent: () => rootRoute as AnyRoute,
    at: '/settings',
  } as any)

  expect(() =>
    createTestRouter({
      routeTree: rootRoute.addChildren([root]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    }),
  ).toThrow(routerRequired)
})

test('an ordinary router rejects route-module options', () => {
  const rootRoute = new BaseRootRoute({})
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      new BaseRoute({ getParentRoute: () => rootRoute, path: '/' }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  expect(() =>
    getScopedRouterView(router, '@acme/settings').buildLocation({
      to: '/',
    } as any),
  ).toThrow(routerRequired)
  expect(router.buildLocation({ to: '/' }).pathname).toBe('/')
})

// Last: it installs the behavior.
test('templates of repeated installations take module-local ids at import', () => {
  const rootRoute = new BaseRootRoute({})
  const orgRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/orgs/$orgId',
  })
  const { root, profile } = createSettingsModule()
  const orgSettings = mountRouteModule(root, {
    parent: () => orgRoute as AnyRoute,
    at: '/settings',
    as: 'orgSettings',
  } as any)

  expect(root.id).toBe('@acme/settings:')
  expect(root.fullPath).toBe('/')
  expect(profile.id).toBe('@acme/settings:/profile')
  expect(profile.fullPath).toBe('/profile')

  installRouteModules()
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([orgRoute.addChildren([orgSettings])]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  expect(
    router.routesById['@acme/settings#orgSettings:/profile']?.fullPath,
  ).toBe('/orgs/$orgId/settings/profile')
})
