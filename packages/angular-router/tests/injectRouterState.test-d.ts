import { expectTypeOf, test } from 'vitest'
import {
  createRootRoute,
  createRoute,
  createRouter,
  injectRouterState,
} from '../src'
import type { RouterState } from '@tanstack/router-core'

const rootRoute = createRootRoute({
  validateSearch: () => ({
    page: 0,
  }),
})

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

test('can select router state', () => {
  expectTypeOf(injectRouterState<DefaultRouter>)
    .returns.returns.toHaveProperty('location')
    .toExtend<{
      search: { page?: number | undefined }
    }>()

  expectTypeOf(injectRouterState<DefaultRouter, { func: () => void }>)
    .parameter(0)
    .exclude<undefined>()
    .toHaveProperty('select')
    .toEqualTypeOf<
      | ((search: RouterState<DefaultRouter['routeTree']>) => {
        func: () => void
      })
      | undefined
    >()
})


