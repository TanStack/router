import { describe, expectTypeOf, test } from 'vitest'
import {
  createRootRoute,
  createRoute,
  createRouter,
  useHistoryState,
} from '../src'
import type { Accessor } from 'solid-js'

describe('useHistoryState', () => {
  test('when there are no state params', () => {
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

    expectTypeOf(useHistoryState<DefaultRouter>)
      .parameter(0)
      .toHaveProperty('from')
      .toEqualTypeOf<
        '/invoices' | '__root__' | '/invoices/$invoiceId' | '/invoices/' | '/'
      >()

    expectTypeOf(useHistoryState<DefaultRouter>)
      .parameter(0)
      .toHaveProperty('strict')
      .toEqualTypeOf<true | undefined>()

    expectTypeOf(useHistoryState<DefaultRouter, '/'>)
      .parameter(0)
      .toHaveProperty('select')
      .parameter(0)
      .toEqualTypeOf<{}>()

    expectTypeOf(useHistoryState<DefaultRouter, '/'>)
      .parameter(0)
      .toHaveProperty('select')
      .returns.toEqualTypeOf<unknown>()

    expectTypeOf(useHistoryState<DefaultRouter, '/'>).returns.toEqualTypeOf<
      Accessor<{}>
    >()

    expectTypeOf(
      useHistoryState<DefaultRouter, '/', false>({
        strict: false,
      }),
    ).toEqualTypeOf<Accessor<{}>>()
  })

  test('when there is one state param', () => {
    const rootRoute = createRootRoute()

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })

    const invoicesRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'invoices',
      validateState: () => ({ page: 0 }),
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

    expectTypeOf(useHistoryState<DefaultRouter, '/'>).returns.toEqualTypeOf<
      Accessor<{}>
    >()

    expectTypeOf(
      useHistoryState<DefaultRouter, '/invoices'>,
    ).returns.toEqualTypeOf<
      Accessor<{
        page: number
      }>
    >()

    expectTypeOf(useHistoryState<DefaultRouter, '/invoices'>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<((state: { page: number }) => unknown) | undefined>()

    expectTypeOf(
      useHistoryState<DefaultRouter, '/invoices', false>,
    ).returns.toEqualTypeOf<Accessor<{ page?: number }>>()

    expectTypeOf(useHistoryState<DefaultRouter, '/invoices', false>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<((state: { page?: number }) => unknown) | undefined>()

    expectTypeOf(
      useHistoryState<
        DefaultRouter,
        '/invoices',
        /* strict */ false,
        /* shouldThrow */ true,
        number
      >,
    ).returns.toEqualTypeOf<Accessor<number>>()

    expectTypeOf(
      useHistoryState<
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
        ((state: { page?: number }) => { func: () => void }) | undefined
      >()
  })

  test('when there are multiple state params', () => {
    const rootRoute = createRootRoute()

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })

    const invoicesRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'invoices',
      validateState: () => ({ page: 0 }),
    })

    const invoicesIndexRoute = createRoute({
      getParentRoute: () => invoicesRoute,
      path: '/',
    })

    const invoiceRoute = createRoute({
      getParentRoute: () => invoicesRoute,
      path: '$invoiceId',
      validateState: () => ({ detail: 'detail' }),
    })

    const routeTree = rootRoute.addChildren([
      invoicesRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
      indexRoute,
    ])

    const _defaultRouter = createRouter({
      routeTree,
    })

    type DefaultRouter = typeof _defaultRouter

    expectTypeOf(useHistoryState<DefaultRouter, '/'>).returns.toEqualTypeOf<
      Accessor<{}>
    >()

    expectTypeOf(
      useHistoryState<DefaultRouter, '/invoices'>,
    ).returns.toEqualTypeOf<
      Accessor<{
        page: number
      }>
    >()

    expectTypeOf(useHistoryState<DefaultRouter, '/invoices'>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<((state: { page: number }) => unknown) | undefined>()

    expectTypeOf(
      useHistoryState<DefaultRouter, '/invoices/$invoiceId'>,
    ).returns.toEqualTypeOf<
      Accessor<{
        page: number
        detail: string
      }>
    >()

    expectTypeOf(
      useHistoryState<DefaultRouter, '/invoices', false>,
    ).returns.toEqualTypeOf<Accessor<{ page?: number; detail?: string }>>()

    expectTypeOf(useHistoryState<DefaultRouter, '/invoices', false>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<
        ((state: { page?: number; detail?: string }) => unknown) | undefined
      >()
  })

  test('when there are overlapping state params', () => {
    const rootRoute = createRootRoute()

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })

    const invoicesRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'invoices',
      validateState: () => ({ page: 0 }),
    })

    const invoicesIndexRoute = createRoute({
      getParentRoute: () => invoicesRoute,
      path: '/',
      validateState: () => ({ detail: 50 }) as const,
    })

    const invoiceRoute = createRoute({
      getParentRoute: () => invoicesRoute,
      path: '$invoiceId',
      validateState: () => ({ detail: 'detail' }) as const,
    })

    const routeTree = rootRoute.addChildren([
      invoicesRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
      indexRoute,
    ])

    const _defaultRouter = createRouter({
      routeTree,
    })

    type DefaultRouter = typeof _defaultRouter

    expectTypeOf(useHistoryState<DefaultRouter, '/'>).returns.toEqualTypeOf<
      Accessor<{}>
    >()

    expectTypeOf(
      useHistoryState<DefaultRouter, '/invoices'>,
    ).returns.toEqualTypeOf<
      Accessor<{
        page: number
      }>
    >()

    expectTypeOf(useHistoryState<DefaultRouter, '/invoices'>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<((state: { page: number }) => unknown) | undefined>()

    expectTypeOf(
      useHistoryState<DefaultRouter, '/invoices', false>,
    ).returns.toEqualTypeOf<
      Accessor<{ page?: number; detail?: 'detail' | 50 }>
    >()
  })

  test('when the root has no state params but the index route does', () => {
    const rootRoute = createRootRoute()

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      validateState: () => ({ indexPage: 0 }),
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

    expectTypeOf(useHistoryState<DefaultRouter, '/'>).returns.toEqualTypeOf<
      Accessor<{
        indexPage: number
      }>
    >()

    expectTypeOf(
      useHistoryState<DefaultRouter, '__root__'>,
    ).returns.toEqualTypeOf<Accessor<{}>>()

    expectTypeOf(
      useHistoryState<DefaultRouter, '/invoices'>,
    ).returns.toEqualTypeOf<Accessor<{}>>()

    expectTypeOf(useHistoryState<DefaultRouter, '/invoices'>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<((state: {}) => unknown) | undefined>()

    expectTypeOf(
      useHistoryState<DefaultRouter, '/invoices', false>,
    ).returns.toEqualTypeOf<Accessor<{ indexPage?: number }>>()

    expectTypeOf(useHistoryState<DefaultRouter, '/invoices', false>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<((state: { indexPage?: number }) => unknown) | undefined>()
  })

  test('when the root has state params but the index route does not', () => {
    const rootRoute = createRootRoute({
      validateState: () => ({ rootPage: 0 }),
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

    expectTypeOf(useHistoryState<DefaultRouter, '/'>).returns.toEqualTypeOf<
      Accessor<{
        rootPage: number
      }>
    >()

    expectTypeOf(
      useHistoryState<DefaultRouter, '__root__'>,
    ).returns.toEqualTypeOf<
      Accessor<{
        rootPage: number
      }>
    >()

    expectTypeOf(
      useHistoryState<DefaultRouter, '/invoices'>,
    ).returns.toEqualTypeOf<
      Accessor<{
        rootPage: number
      }>
    >()

    expectTypeOf(useHistoryState<DefaultRouter, '/invoices'>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<((state: { rootPage: number }) => unknown) | undefined>()

    expectTypeOf(
      useHistoryState<DefaultRouter, '/invoices', false>,
    ).returns.toEqualTypeOf<Accessor<{ rootPage?: number }>>()

    expectTypeOf(useHistoryState<DefaultRouter, '/invoices', false>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<((state: { rootPage?: number }) => unknown) | undefined>()
  })

  test('when the root has state params and the index does too', () => {
    const rootRoute = createRootRoute({
      validateState: () => ({ rootPage: 0 }),
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      validateState: () => ({ indexPage: 0 }),
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

    expectTypeOf(useHistoryState<DefaultRouter, '/'>).returns.toEqualTypeOf<
      Accessor<{
        rootPage: number
        indexPage: number
      }>
    >()

    expectTypeOf(
      useHistoryState<DefaultRouter, '__root__'>,
    ).returns.toEqualTypeOf<
      Accessor<{
        rootPage: number
      }>
    >()

    expectTypeOf(
      useHistoryState<DefaultRouter, '/invoices'>,
    ).returns.toEqualTypeOf<
      Accessor<{
        rootPage: number
      }>
    >()

    expectTypeOf(useHistoryState<DefaultRouter, '/invoices'>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<((state: { rootPage: number }) => unknown) | undefined>()

    expectTypeOf(
      useHistoryState<DefaultRouter, '/invoices', false>,
    ).returns.toEqualTypeOf<
      Accessor<{ rootPage?: number; indexPage?: number }>
    >()

    expectTypeOf(useHistoryState<DefaultRouter, '/invoices', false>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<
        | ((state: { rootPage?: number; indexPage?: number }) => unknown)
        | undefined
      >()
  })
})
