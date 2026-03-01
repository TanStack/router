import { expectTypeOf, test } from 'vitest'
import { createRootRoute, createRoute, getRouteApi } from '../src'

const rootRoute = createRootRoute()
const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/posts/$postId',
  validateSearch: () => ({ page: 0 }),
})

const routeTree = rootRoute.addChildren([postsRoute])
void routeTree

test('getRouteApi exposes angular inject methods', () => {
  const api = getRouteApi('/posts/$postId')

  expectTypeOf(api.injectMatch).toBeFunction()
  expectTypeOf(api.injectRouteContext).toBeFunction()
  expectTypeOf(api.injectSearch).toBeFunction()
  expectTypeOf(api.injectParams).toBeFunction()
  expectTypeOf(api.injectLoaderData).toBeFunction()
  expectTypeOf(api.injectLoaderDeps).toBeFunction()
  expectTypeOf(api.injectNavigate).toBeFunction()
})

test('route instances expose same inject methods as getRouteApi', () => {
  expectTypeOf(postsRoute.injectMatch).toBeFunction()
  expectTypeOf(postsRoute.injectRouteContext).toBeFunction()
  expectTypeOf(postsRoute.injectSearch).toBeFunction()
  expectTypeOf(postsRoute.injectParams).toBeFunction()
  expectTypeOf(postsRoute.injectLoaderData).toBeFunction()
  expectTypeOf(postsRoute.injectLoaderDeps).toBeFunction()
  expectTypeOf(postsRoute.injectNavigate).toBeFunction()
})
