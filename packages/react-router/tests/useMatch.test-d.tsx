import { describe, expectTypeOf, test } from 'vitest'
import { createRootRoute, createRoute, createRouter, useMatch } from '../src'
import type { MakeRouteMatch } from '../src/Matches'

const rootRoute = createRootRoute()

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
})

const invoicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'invoices',
})

const routeTree = rootRoute.addChildren([invoicesRoute, indexRoute])

const defaultRouter = createRouter({ routeTree })

type DefaultRouter = typeof defaultRouter

type TRouteMatch = MakeRouteMatch<DefaultRouter['routeTree']>

describe('useMatch', () => {
  const from = '/invoices'
  test('return type is `RouteMatch` when shouldThrow = true', () => {
    const shouldThrow = true
    const match = useMatch<
      DefaultRouter['routeTree'],
      typeof from,
      true,
      TRouteMatch,
      TRouteMatch,
      typeof shouldThrow
    >({ from, shouldThrow })

    expectTypeOf(match).toEqualTypeOf<TRouteMatch>()
  })

  test('return type is `RouteMatch | undefined` when shouldThrow = false', () => {
    const shouldThrow = false
    const match = useMatch<
      DefaultRouter['routeTree'],
      typeof from,
      true,
      TRouteMatch,
      TRouteMatch,
      typeof shouldThrow
    >({ from, shouldThrow })

    expectTypeOf(match).toEqualTypeOf<TRouteMatch | undefined>()
  })
})
