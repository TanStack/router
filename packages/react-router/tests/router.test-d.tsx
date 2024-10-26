import { expectTypeOf, test } from 'vitest'
import {
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '../src'

test('when creating a router without context', () => {
  // eslint-disable-next-line unused-imports/no-unused-vars
  const rootRoute = createRootRoute()

  type RouteTree = typeof rootRoute

  expectTypeOf(createRouter<RouteTree, 'never', boolean>)
    .parameter(0)
    .toHaveProperty('routeTree')
    .toEqualTypeOf<RouteTree | undefined>()

  expectTypeOf(createRouter<RouteTree, 'never', boolean>)
    .parameter(0)
    .toHaveProperty('context')
    .toEqualTypeOf<{} | undefined>()

  expectTypeOf(createRouter<RouteTree, 'never', boolean>)
    .parameter(0)
    .not.toMatchTypeOf<{
      context: {}
    }>()
})

test('when navigating using router', () => {
  const rootRoute = createRootRoute()

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })

  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'posts',
    validateSearch: () => ({
      page: 0,
    }),
  })

  const routeTree = rootRoute.addChildren([indexRoute, postsRoute])

  const router = createRouter({
    routeTree,
  })

  expectTypeOf(router.navigate<typeof router, '/posts'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<'/posts' | '/' | '.' | '..' | undefined>()

  expectTypeOf(router.navigate<typeof router, '/posts'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<(...args: Array<any>) => any>()
    .toEqualTypeOf<{ page: number }>()
})

test('when building location using router', () => {
  const rootRoute = createRootRoute()

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })

  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'posts',
    validateSearch: () => ({
      page: 0,
    }),
  })

  const routeTree = rootRoute.addChildren([indexRoute, postsRoute])

  const router = createRouter({
    routeTree,
  })

  expectTypeOf(router.buildLocation<typeof router, '/posts'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<'/posts' | '/' | '.' | '..' | undefined>()

  expectTypeOf(router.buildLocation<typeof router, '/posts'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<(...args: Array<any>) => any>()
    .toEqualTypeOf<{ page: number }>()
})

test('when creating a router with context', () => {
  // eslint-disable-next-line unused-imports/no-unused-vars
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  type RouteTree = typeof rootRoute

  expectTypeOf(createRouter<RouteTree, 'never', boolean>)
    .parameter(0)
    .toHaveProperty('routeTree')
    .toEqualTypeOf<RouteTree | undefined>()

  expectTypeOf(createRouter<RouteTree, 'never', boolean>)
    .parameter(0)
    .toHaveProperty('context')
    .toEqualTypeOf<{ userId: string }>()

  expectTypeOf(createRouter<RouteTree, 'never', boolean>)
    .parameter(0)
    .toMatchTypeOf<{
      context: { userId: string }
    }>()
})

test('when creating a router with context and children', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })

  // eslint-disable-next-line unused-imports/no-unused-vars
  const routeTree = rootRoute.addChildren([indexRoute])

  type RouteTree = typeof routeTree

  expectTypeOf(createRouter<RouteTree, 'never', boolean>)
    .parameter(0)
    .toHaveProperty('routeTree')
    .toEqualTypeOf<RouteTree | undefined>()

  expectTypeOf(createRouter<RouteTree, 'never', boolean>)
    .parameter(0)
    .toHaveProperty('context')
    .toEqualTypeOf<{ userId: string }>()

  expectTypeOf(createRouter<RouteTree, 'never', boolean>)
    .parameter(0)
    .toMatchTypeOf<{
      context: { userId: string }
    }>()
})
