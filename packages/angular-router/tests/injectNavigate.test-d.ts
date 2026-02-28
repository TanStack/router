import { expectTypeOf, test } from 'vitest'
import {
  createRootRoute,
  createRoute,
  createRouter,
  injectNavigate,
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

const _defaultRouter = createRouter({
  routeTree,
})

type DefaultRouter = typeof _defaultRouter

test('when navigating to a route', () => {
  const navigate = injectNavigate()

  expectTypeOf(navigate<DefaultRouter, '/invoices'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<'/' | '/invoices' | '/invoices/$invoiceId' | '.' | '..'>()
})

test('when setting a default from', () => {
  expectTypeOf(injectNavigate<DefaultRouter, '/'>)
    .parameter(0)
    .exclude<undefined>()
    .toHaveProperty('from')
    .toEqualTypeOf<
      '/invoices' | '/' | '/invoices/$invoiceId' | '/invoices/' | undefined
    >()
})

test('when setting an invalid default from', () => {
  expectTypeOf(injectNavigate<DefaultRouter, '/invalid'>)
    .parameter(0)
    .exclude<undefined>()
    .toHaveProperty('from')
    .toEqualTypeOf<
      '/invoices' | '/' | '/invoices/$invoiceId' | '/invoices/' | undefined
    >()
})


