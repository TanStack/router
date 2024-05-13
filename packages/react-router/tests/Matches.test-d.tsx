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

const routeTree = rootRoute.addChildren([
  invoicesRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
  indexRoute,
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
      '/' | './' | '../' | '/invoices' | '/invoices/$invoiceId' | undefined
    >()

  expectTypeOf(MatchRoute<DefaultRouter, any, '/invoices/$invoiceId'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      '/' | './' | '../' | '/invoices' | '/invoices/$invoiceId' | undefined
    >()

  expectTypeOf(
    matchRoute({
      to: '/invoices/$invoiceId',
    }),
  ).toEqualTypeOf<false | { invoiceId: string }>()
})
