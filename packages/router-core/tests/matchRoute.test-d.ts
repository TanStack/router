import { describe, expectTypeOf, test } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import type {
  RouteById,
  RouteByPath,
  RouterCore,
} from '../src'
import type { RouterHistory } from '@tanstack/history'

// Build a route tree with a pathless (layout) route so that the nested route's
// fullPath differs from its id: the id keeps the pathless segment
// (`/_pathless/nested/$id`) while the fullPath drops it (`/nested/$id`).
const rootRoute = new BaseRootRoute({})
const pathlessRoute = new BaseRoute({
  getParentRoute: () => rootRoute,
  id: '_pathless',
})
const nestedRoute = new BaseRoute({
  getParentRoute: () => pathlessRoute,
  path: '/nested/$id',
})
const routeTree = rootRoute.addChildren([
  pathlessRoute.addChildren([nestedRoute]),
])
type RouteTree = typeof routeTree

declare const router: RouterCore<RouteTree, 'never', true, RouterHistory>

describe('MatchRoute pathless (layout) route params', () => {
  test('the resolved fullPath is not a route id (RouteById lookup misses)', () => {
    // `matchRoute({ to: '/nested/$id' })` resolves to the route fullPath, which
    // strips the pathless segment. RouteById is id-keyed, so this is `never`.
    expectTypeOf<RouteById<RouteTree, '/nested/$id'>>().toEqualTypeOf<never>()
  })

  test('RouteByPath resolves the pathless child via its fullPath', () => {
    expectTypeOf<
      RouteByPath<RouteTree, '/nested/$id'>['types']['allParams']
    >().toMatchTypeOf<{ id: string }>()
  })

  test('matchRoute returns the pathless route params (not just false)', () => {
    type MatchParams = ReturnType<typeof router.matchRoute<'/', '/nested/$id'>>
    expectTypeOf<MatchParams>().not.toEqualTypeOf<false>()
    expectTypeOf<MatchParams>().toMatchTypeOf<false | { id: string }>()
  })
})
