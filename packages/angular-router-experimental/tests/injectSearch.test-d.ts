import { describe, expectTypeOf, test } from 'vitest'
import {
  createRootRoute,
  createRoute,
  createRouter,
  injectSearch,
} from '../src'
import type * as Angular from '@angular/core'
import type { SearchSchemaInput } from '@tanstack/router-core'

describe('injectSearch', () => {
  test('when there are no search params', () => {
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
    })

    const routeTree = rootRoute.addChildren([
      invoicesRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
      indexRoute,
    ])

    const _defaultRouter = createRouter({
      routeTree,
    })

    type DefaultRouter = typeof _defaultRouter

    expectTypeOf(injectSearch<DefaultRouter>)
      .parameter(0)
      .toHaveProperty('from')
      .toEqualTypeOf<
        '/invoices' | '__root__' | '/invoices/$invoiceId' | '/invoices/' | '/'
      >()

    expectTypeOf(injectSearch<DefaultRouter>)
      .parameter(0)
      .toHaveProperty('strict')
      .toEqualTypeOf<true | undefined>()

    expectTypeOf(injectSearch<DefaultRouter, '/'>)
      .parameter(0)
      .toHaveProperty('select')
      .parameter(0)
      .toEqualTypeOf<{}>()

    expectTypeOf(injectSearch<DefaultRouter, '/'>)
      .parameter(0)
      .toHaveProperty('select')
      .returns.toEqualTypeOf<unknown>()

    expectTypeOf(injectSearch<DefaultRouter, '/'>).returns.toEqualTypeOf<
      Angular.Signal<{}>
    >()

    expectTypeOf(
      injectSearch<DefaultRouter, '/', false>({
        strict: false,
      }),
    ).toEqualTypeOf<Angular.Signal<{}>>()
  })

  test('when there is one search params', () => {
    const rootRoute = createRootRoute()

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })

    const invoicesRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'invoices',
      validateSearch: () => ({ page: 0 }),
    })

    const invoicesIndexRoute = createRoute({
      getParentRoute: () => invoicesRoute,
      path: '/',
    })

    const invoiceRoute = createRoute({
      getParentRoute: () => invoicesRoute,
      path: '$invoiceId',
    })

    const routeTree = rootRoute.addChildren([
      invoicesRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
      indexRoute,
    ])

    const _defaultRouter = createRouter({
      routeTree,
    })

    type DefaultRouter = typeof _defaultRouter

    expectTypeOf(injectSearch<DefaultRouter, '/'>).returns.toEqualTypeOf<
      Angular.Signal<{}>
    >()

    expectTypeOf(injectSearch<DefaultRouter, '/invoices'>).returns.toEqualTypeOf<
      Angular.Signal<{
        page: number
      }>
    >()

    expectTypeOf(injectSearch<DefaultRouter, '/invoices'>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<((search: { page: number }) => unknown) | undefined>()

    expectTypeOf(
      injectSearch<DefaultRouter, '/invoices', false>,
    ).returns.toEqualTypeOf<Angular.Signal<{ page?: number }>>()

    expectTypeOf(injectSearch<DefaultRouter, '/invoices', false>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<((search: { page?: number }) => unknown) | undefined>()

    expectTypeOf(
      injectSearch<
        DefaultRouter,
        '/invoices',
        /* strict */ false,
        /* shouldThrow */ true,
        number
      >,
    ).returns.toEqualTypeOf<Angular.Signal<number>>()

    expectTypeOf(
      injectSearch<
        DefaultRouter,
        '/invoices',
        /* strict */ false,
        /* shouldThrow */ true,
        { func: () => void }
      >,
    )
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<
        ((search: { page?: number }) => { func: () => void }) | undefined
      >()
  })

  test('when there are multiple search params', () => {
    const rootRoute = createRootRoute()

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })

    const invoicesRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'invoices',
      validateSearch: () => ({ page: 0 }),
    })

    const invoicesIndexRoute = createRoute({
      getParentRoute: () => invoicesRoute,
      path: '/',
    })

    const invoiceRoute = createRoute({
      getParentRoute: () => invoicesRoute,
      path: '$invoiceId',
      validateSearch: () => ({ detail: 'detail' }),
    })

    const routeTree = rootRoute.addChildren([
      invoicesRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
      indexRoute,
    ])

    const _defaultRouter = createRouter({
      routeTree,
    })

    type DefaultRouter = typeof _defaultRouter

    expectTypeOf(injectSearch<DefaultRouter, '/'>).returns.toEqualTypeOf<
      Angular.Signal<{}>
    >()

    expectTypeOf(injectSearch<DefaultRouter, '/invoices'>).returns.toEqualTypeOf<
      Angular.Signal<{
        page: number
      }>
    >()

    expectTypeOf(injectSearch<DefaultRouter, '/invoices'>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<((search: { page: number }) => unknown) | undefined>()

    expectTypeOf(
      injectSearch<DefaultRouter, '/invoices', false>,
    ).returns.toEqualTypeOf<Angular.Signal<{ page?: number; detail?: string }>>()

    expectTypeOf(injectSearch<DefaultRouter, '/invoices', false>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<
        ((search: { page?: number; detail?: string }) => unknown) | undefined
      >()
  })

  test('when there are overlapping search params', () => {
    const rootRoute = createRootRoute()

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })

    const invoicesRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'invoices',
      validateSearch: () => ({ page: 0 }),
    })

    const invoicesIndexRoute = createRoute({
      getParentRoute: () => invoicesRoute,
      path: '/',
      validateSearch: () => ({ detail: 50 }) as const,
    })

    const invoiceRoute = createRoute({
      getParentRoute: () => invoicesRoute,
      path: '$invoiceId',
      validateSearch: () => ({ detail: 'detail' }) as const,
    })

    const routeTree = rootRoute.addChildren([
      invoicesRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
      indexRoute,
    ])

    const _defaultRouter = createRouter({
      routeTree,
    })

    type DefaultRouter = typeof _defaultRouter

    expectTypeOf(injectSearch<DefaultRouter, '/'>).returns.toEqualTypeOf<
      Angular.Signal<{}>
    >()

    expectTypeOf(injectSearch<DefaultRouter, '/invoices'>).returns.toEqualTypeOf<
      Angular.Signal<{
        page: number
      }>
    >()

    expectTypeOf(injectSearch<DefaultRouter, '/invoices'>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<((search: { page: number }) => unknown) | undefined>()

    expectTypeOf(
      injectSearch<DefaultRouter, '/invoices', false>,
    ).returns.toEqualTypeOf<
      Angular.Signal<{ page?: number; detail?: 'detail' | 50 }>
    >()

    expectTypeOf(injectSearch<DefaultRouter, '/invoices', false>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<
        | ((search: { page?: number; detail?: 'detail' | 50 }) => unknown)
        | undefined
      >()
  })

  test('when the root has no search params but the index route does', () => {
    const rootRoute = createRootRoute()

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      validateSearch: () => ({ indexPage: 0 }),
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
    })

    const routeTree = rootRoute.addChildren([
      invoicesRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
      indexRoute,
    ])

    const _defaultRouter = createRouter({
      routeTree,
    })

    type DefaultRouter = typeof _defaultRouter

    expectTypeOf(injectSearch<DefaultRouter, '/'>).returns.toEqualTypeOf<
      Angular.Signal<{
        indexPage: number
      }>
    >()

    expectTypeOf(injectSearch<DefaultRouter, '__root__'>).returns.toEqualTypeOf<
      Angular.Signal<{}>
    >()

    expectTypeOf(injectSearch<DefaultRouter, '/invoices'>).returns.toEqualTypeOf<
      Angular.Signal<{}>
    >()

    expectTypeOf(injectSearch<DefaultRouter, '/invoices'>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<((search: {}) => unknown) | undefined>()

    expectTypeOf(
      injectSearch<DefaultRouter, '/invoices', false>,
    ).returns.toEqualTypeOf<Angular.Signal<{ indexPage?: number }>>()

    expectTypeOf(injectSearch<DefaultRouter, '/invoices', false>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<
        ((search: { indexPage?: number }) => unknown) | undefined
      >()
  })

  test('when the root has search params but the index route does not', () => {
    const rootRoute = createRootRoute({
      validateSearch: () => ({ rootPage: 0 }),
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
    })

    const routeTree = rootRoute.addChildren([
      invoicesRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
      indexRoute,
    ])

    const _defaultRouter = createRouter({
      routeTree,
    })

    type DefaultRouter = typeof _defaultRouter

    expectTypeOf(injectSearch<DefaultRouter, '/'>).returns.toEqualTypeOf<
      Angular.Signal<{
        rootPage: number
      }>
    >()

    expectTypeOf(injectSearch<DefaultRouter, '__root__'>).returns.toEqualTypeOf<
      Angular.Signal<{
        rootPage: number
      }>
    >()

    expectTypeOf(injectSearch<DefaultRouter, '/invoices'>).returns.toEqualTypeOf<
      Angular.Signal<{
        rootPage: number
      }>
    >()

    expectTypeOf(injectSearch<DefaultRouter, '/invoices'>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<((search: { rootPage: number }) => unknown) | undefined>()

    expectTypeOf(
      injectSearch<DefaultRouter, '/invoices', false>,
    ).returns.toEqualTypeOf<Angular.Signal<{ rootPage?: number }>>()

    expectTypeOf(injectSearch<DefaultRouter, '/invoices', false>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<((search: { rootPage?: number }) => unknown) | undefined>()
  })

  test('when the root has search params but the index does', () => {
    const rootRoute = createRootRoute({
      validateSearch: () => ({ rootPage: 0 }),
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      validateSearch: () => ({ indexPage: 0 }),
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
    })

    const routeTree = rootRoute.addChildren([
      invoicesRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
      indexRoute,
    ])

    const _defaultRouter = createRouter({
      routeTree,
    })

    type DefaultRouter = typeof _defaultRouter

    expectTypeOf(injectSearch<DefaultRouter, '/'>).returns.toEqualTypeOf<
      Angular.Signal<{
        rootPage: number
        indexPage: number
      }>
    >()

    expectTypeOf(injectSearch<DefaultRouter, '__root__'>).returns.toEqualTypeOf<
      Angular.Signal<{
        rootPage: number
      }>
    >()

    expectTypeOf(injectSearch<DefaultRouter, '/invoices'>).returns.toEqualTypeOf<
      Angular.Signal<{
        rootPage: number
      }>
    >()

    expectTypeOf(injectSearch<DefaultRouter, '/invoices'>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<((search: { rootPage: number }) => unknown) | undefined>()

    expectTypeOf(
      injectSearch<DefaultRouter, '/invoices', false>,
    ).returns.toEqualTypeOf<
      Angular.Signal<{ indexPage?: number; rootPage?: number }>
    >()

    expectTypeOf(injectSearch<DefaultRouter, '/invoices', false>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<
        | ((search: { indexPage?: number; rootPage?: number }) => unknown)
        | undefined
      >()
  })

  test('when a route has search params using SearchSchemaInput', () => {
    const rootRoute = createRootRoute()

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      validateSearch: (input: { page?: number } & SearchSchemaInput) => {
        return { page: input.page ?? 0 }
      },
    })

    const routeTree = rootRoute.addChildren([indexRoute])

    const _router = createRouter({ routeTree })
    expectTypeOf(injectSearch<typeof _router, '/'>).returns.toEqualTypeOf<
      Angular.Signal<{
        page: number
      }>
    >
  })

  test('when route has a union of search params', () => {
    const rootRoute = createRootRoute()

    const postRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      validateSearch: (): { status: 'in' } | { status: 'out' } => {
        return { status: 'in' }
      },
    })

    const indexRoute = createRoute({
      getParentRoute: () => postRoute,
      path: '/',
      validateSearch: (): { detail: string } => {
        return { detail: 'detail' }
      },
    })

    const routeTree = rootRoute.addChildren([
      indexRoute.addChildren([indexRoute]),
    ])

    const _router = createRouter({ routeTree })
    expectTypeOf(injectSearch<typeof _router, '/'>).returns.toEqualTypeOf<
      Angular.Signal<
        { status: 'in'; detail: string } | { status: 'out'; detail: string }
      >
    >
  })

  describe('shouldThrow', () => {
    const rootRoute = createRootRoute()

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })

    const invoicesRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'invoices',
      validateSearch: () => ({ page: 0 }),
    })

    const routeTree = rootRoute.addChildren([invoicesRoute, indexRoute])

    const _router = createRouter({ routeTree })

    const from = '/invoices'
    test('return type is `{ page: number }` when shouldThrow = true', () => {
      const shouldThrow = true
      const search = injectSearch<
        typeof _router,
        typeof from,
        /* strict */ true,
        typeof shouldThrow
      >({ from, shouldThrow })

      expectTypeOf(search).toEqualTypeOf<Angular.Signal<{ page: number }>>()
    })

    test('return type is `{page: number} | undefined` when shouldThrow = false', () => {
      const shouldThrow = false
      const search = injectSearch<
        typeof _router,
        typeof from,
        /* strict */ true,
        typeof shouldThrow
      >({ from, shouldThrow })

      expectTypeOf(search).toEqualTypeOf<
        Angular.Signal<{ page: number } | undefined>
      >()
    })
  })
})


