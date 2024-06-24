import { expectTypeOf, test } from 'vitest'
import {
  createRootRoute,
  createRootRouteWithContext,
  createRouter,
} from '../src'

test('when creating a router without context', () => {
  const rootRoute = createRootRoute()

  type RouteTree = typeof rootRoute

  expectTypeOf(createRouter<RouteTree, 'never'>)
    .parameter(0)
    .toHaveProperty('routeTree')
    .toEqualTypeOf<RouteTree | undefined>()

  expectTypeOf(createRouter<RouteTree, 'never'>)
    .parameter(0)
    .toHaveProperty('context')
    .toEqualTypeOf<{} | undefined>()

  expectTypeOf(createRouter<RouteTree, 'never'>)
    .parameter(0)
    .not.toMatchTypeOf<{
      context: {}
    }>()
})

test('when creating a router with context', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  type RouteTree = typeof rootRoute

  expectTypeOf(createRouter<RouteTree, 'never'>)
    .parameter(0)
    .toHaveProperty('routeTree')
    .toEqualTypeOf<RouteTree | undefined>()

  expectTypeOf(createRouter<RouteTree, 'never'>)
    .parameter(0)
    .toHaveProperty('context')
    .toEqualTypeOf<{ userId: string }>()

  expectTypeOf(createRouter<RouteTree, 'never'>)
    .parameter(0)
    .toMatchTypeOf<{
      context: { userId: string }
    }>()
})
