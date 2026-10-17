import { describe, expectTypeOf, test } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'
import type { BuildNextOptions, RouteMask, ToMaskOptions } from '../src'

const rootRoute = new BaseRootRoute()
const indexRoute = new BaseRoute({
  getParentRoute: () => rootRoute,
  path: '/',
})
const visibleRoute = new BaseRoute({
  getParentRoute: () => rootRoute,
  path: '/visible/$id',
  validateSearch: (search: { required: string }) => search,
})
const routeTree = rootRoute.addChildren([indexRoute, visibleRoute])
const router = createTestRouter({ routeTree })
type Mask = ToMaskOptions<typeof router, '/', '/visible/$id'>
type InheritedMask = {
  to: '/visible/$id'
  params: { id: string }
  inheritSearch: true
}

describe('route mask inherited search types', () => {
  test('inherits resolved search without requiring the mask route search input', () => {
    expectTypeOf<InheritedMask>().toMatchTypeOf<Mask>()
    expectTypeOf<Omit<InheritedMask, 'params'>>().not.toMatchTypeOf<Mask>()
  })

  test('retains required search for ordinary masks', () => {
    expectTypeOf<{
      to: '/visible/$id'
      params: { id: string }
      search: { required: string }
    }>().toMatchTypeOf<Mask>()
    expectTypeOf<{
      to: '/visible/$id'
      params: { id: string }
    }>().not.toMatchTypeOf<Mask>()
  })

  test('forbids search alongside inheritance for every mask API', () => {
    type ConflictingMask = InheritedMask & { search: { required: string } }
    expectTypeOf<ConflictingMask>().not.toMatchTypeOf<Mask>()
    expectTypeOf<ConflictingMask>().not.toMatchTypeOf<
      NonNullable<BuildNextOptions['mask']>
    >()
    expectTypeOf<
      ConflictingMask & { routeTree: typeof routeTree; from: '/' }
    >().not.toMatchTypeOf<RouteMask<typeof routeTree>>()
  })

  test('allows configured and build-location masks to opt into inheritance', () => {
    expectTypeOf<InheritedMask>().toMatchTypeOf<
      NonNullable<BuildNextOptions['mask']>
    >()
    expectTypeOf<
      InheritedMask & { routeTree: typeof routeTree; from: '/' }
    >().toMatchTypeOf<RouteMask<typeof routeTree>>()
  })
})
