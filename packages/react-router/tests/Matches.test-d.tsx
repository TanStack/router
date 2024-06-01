import { expectTypeOf, test } from 'vitest'
import {
  MatchRoute,
  createRootRoute,
  createRoute,
  createRouter,
  useMatchRoute,
} from '../src'

const rootRoute = createRootRoute()

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
})

const invoicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'invoices',
})

const invoicesIndexRoute = createRoute({
  getParentRoute: () => invoicesRoute,
  path: '/',
})

const invoiceRoute = createRoute({
  getParentRoute: () => invoicesRoute,
  path: '$invoiceId',
  validateSearch: () => ({ page: 0 }),
})

const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_layout',
})

const commentsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: 'comments/$id',
})

const routeTree = rootRoute.addChildren([
  invoicesRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
  indexRoute,
  layoutRoute.addChildren([commentsRoute]),
])

const defaultRouter = createRouter({
  routeTree,
})

type DefaultRouter = typeof defaultRouter

const useDefaultMatchRoute = useMatchRoute<DefaultRouter>

test('when matching a route with params', () => {
  const matchRoute = useDefaultMatchRoute()

  expectTypeOf(matchRoute<string, '/invoices/$invoiceId'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '/'
      | './'
      | '../'
      | '/invoices'
      | '/invoices/$invoiceId'
      | '/comments/$id'
      | undefined
    >()

  expectTypeOf(MatchRoute<DefaultRouter, any, '/invoices/$invoiceId'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '/'
      | './'
      | '../'
      | '/invoices'
      | '/invoices/$invoiceId'
      | '/comments/$id'
      | undefined
    >()

  expectTypeOf(
    matchRoute({
      to: '/invoices/$invoiceId',
    }),
  ).toEqualTypeOf<false | { invoiceId: string }>()
})

test('when matching a route with params underneath a layout route', () => {
  const matchRoute = useDefaultMatchRoute()

  expectTypeOf(
    matchRoute({
      to: '/comments/$id',
    }),
  ).toEqualTypeOf<false | { id: string }>()
})
