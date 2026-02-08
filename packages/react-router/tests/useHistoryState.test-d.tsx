import { describe, expectTypeOf, test } from 'vitest'
import {
  createRootRoute,
  createRoute,
  createRouter,
  useHistoryState,
} from '../src'
import type { StateSchemaInput } from '../src'

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
    // eslint-disable-next-line unused-imports/no-unused-vars
    const defaultRouter = createRouter({
      routeTree,
    })
    type DefaultRouter = typeof defaultRouter

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

    expectTypeOf(
      useHistoryState<DefaultRouter, '/'>,
    ).returns.toEqualTypeOf<{}>()

    expectTypeOf(
      useHistoryState<DefaultRouter, '/', false>({
        strict: false,
      }),
    ).toEqualTypeOf<{}>()
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
    // eslint-disable-next-line unused-imports/no-unused-vars
    const defaultRouter = createRouter({
      routeTree,
    })
    type DefaultRouter = typeof defaultRouter

    expectTypeOf(
      useHistoryState<DefaultRouter, '/'>,
    ).returns.toEqualTypeOf<{}>()

    expectTypeOf(
      useHistoryState<DefaultRouter, '/invoices'>,
    ).returns.toEqualTypeOf<{
      page: number
    }>()

    expectTypeOf(useHistoryState<DefaultRouter, '/invoices'>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<((state: { page: number }) => unknown) | undefined>()

    expectTypeOf(
      useHistoryState<DefaultRouter, '/invoices', false>,
    ).returns.toEqualTypeOf<{ page?: number }>()

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
    ).returns.toEqualTypeOf<number>()

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
      .toHaveProperty('structuralSharing')
      .toEqualTypeOf<false | undefined>()

    expectTypeOf(
      useHistoryState<
        DefaultRouter,
        '/invoices',
        /* strict */ false,
        /* shouldThrow */ true,
        { func: () => void },
        true
      >,
    )
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<
        | ((state: { page?: number }) => {
            func: 'Function is not serializable'
          })
        | undefined
      >()

    expectTypeOf(
      useHistoryState<
        DefaultRouter,
        '/invoices',
        /* strict */ false,
        /* shouldThrow */ true,
        { func: () => void },
        true
      >,
    )
      .parameter(0)
      .toHaveProperty('structuralSharing')
      .toEqualTypeOf<false | undefined>()

    expectTypeOf(
      useHistoryState<
        DefaultRouter,
        '/invoices',
        /* strict */ false,
        /* shouldThrow */ true,
        { hi: any },
        true
      >,
    )
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<
        | ((state: { page?: number }) => {
            hi: never
          })
        | undefined
      >()

    expectTypeOf(
      useHistoryState<
        DefaultRouter,
        '/invoices',
        /* strict */ false,
        /* shouldThrow */ true,
        { hi: any },
        true
      >,
    )
      .parameter(0)
      .toHaveProperty('structuralSharing')
      .toEqualTypeOf<false | undefined>()

    // eslint-disable-next-line unused-imports/no-unused-vars
    const routerWithStructuralSharing = createRouter({
      routeTree,
      defaultStructuralSharing: true,
    })

    expectTypeOf(
      useHistoryState<
        typeof routerWithStructuralSharing,
        '/invoices',
        /* strict */ false,
        /* shouldThrow */ true,
        { func: () => void }
      >,
    )
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<
        | ((state: { page?: number }) => {
            func: 'Function is not serializable'
          })
        | undefined
      >()

    expectTypeOf(
      useHistoryState<
        typeof routerWithStructuralSharing,
        '/invoices',
        /* strict */ false,
        /* shouldThrow */ true,
        { date: () => void },
        true
      >,
    )
      .parameter(0)
      .toHaveProperty('structuralSharing')
      .toEqualTypeOf<false>()
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
    // eslint-disable-next-line unused-imports/no-unused-vars
    const defaultRouter = createRouter({
      routeTree,
    })
    type DefaultRouter = typeof defaultRouter

    expectTypeOf(
      useHistoryState<DefaultRouter, '/'>,
    ).returns.toEqualTypeOf<{}>()

    expectTypeOf(
      useHistoryState<DefaultRouter, '/invoices'>,
    ).returns.toEqualTypeOf<{
      page: number
    }>()

    expectTypeOf(useHistoryState<DefaultRouter, '/invoices'>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<((state: { page: number }) => unknown) | undefined>()

    expectTypeOf(
      useHistoryState<DefaultRouter, '/invoices', false>,
    ).returns.toEqualTypeOf<{ page?: number; detail?: string }>()

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
    const routeTree = rootRoute.addChildren([
      invoicesRoute.addChildren([invoicesIndexRoute]),
      indexRoute,
    ])
    // eslint-disable-next-line unused-imports/no-unused-vars
    const defaultRouter = createRouter({
      routeTree,
    })
    type DefaultRouter = typeof defaultRouter

    expectTypeOf(
      useHistoryState<
        DefaultRouter,
        '/invoices/',
        /* strict */ true,
        /* shouldThrow */ true,
        { page: number; detail: 50 }
      >({
        from: '/invoices/',
      }),
    ).toEqualTypeOf<{
      page: number
      detail: 50
    }>()
  })

  test('when the root has no state params but the index route does', () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      validateState: () => ({ isHome: true }),
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    // eslint-disable-next-line unused-imports/no-unused-vars
    const defaultRouter = createRouter({
      routeTree,
    })
    type DefaultRouter = typeof defaultRouter

    expectTypeOf(
      useHistoryState<DefaultRouter, '__root__'>,
    ).returns.toEqualTypeOf<{}>()

    expectTypeOf(useHistoryState<DefaultRouter, '/'>).returns.toEqualTypeOf<{
      isHome: boolean
    }>()
  })

  test('when the root has state params but the index route does not', () => {
    const rootRoute = createRootRoute({
      validateState: () => ({ theme: 'dark' }),
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    // eslint-disable-next-line unused-imports/no-unused-vars
    const defaultRouter = createRouter({
      routeTree,
    })
    type DefaultRouter = typeof defaultRouter

    expectTypeOf(
      useHistoryState<DefaultRouter, '__root__'>,
    ).returns.toEqualTypeOf<{
      theme: string
    }>()

    expectTypeOf(useHistoryState<DefaultRouter, '/'>).returns.toEqualTypeOf<{
      theme: string
    }>()
  })

  test('when the root has state params and the index does too', () => {
    const rootRoute = createRootRoute({
      validateState: () => ({ theme: 'dark' }),
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      validateState: () => ({ isHome: true }),
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    // eslint-disable-next-line unused-imports/no-unused-vars
    const defaultRouter = createRouter({
      routeTree,
    })
    type DefaultRouter = typeof defaultRouter

    expectTypeOf(
      useHistoryState<DefaultRouter, '__root__'>,
    ).returns.toEqualTypeOf<{
      theme: string
    }>()

    expectTypeOf(useHistoryState<DefaultRouter, '/'>).returns.toEqualTypeOf<{
      theme: string
      isHome: boolean
    }>()
  })

  test('when route has a union of state params', () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const unionRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/union',
      validateState: () => ({ status: 'active' as 'active' | 'inactive' }),
    })
    const routeTree = rootRoute.addChildren([indexRoute, unionRoute])
    // eslint-disable-next-line unused-imports/no-unused-vars
    const defaultRouter = createRouter({
      routeTree,
    })
    type DefaultRouter = typeof defaultRouter

    expectTypeOf(
      useHistoryState<DefaultRouter, '/union'>,
    ).returns.toEqualTypeOf<{
      status: 'active' | 'inactive'
    }>()
  })

  test('when a route has state params using StateSchemaInput', () => {
    const rootRoute = createRootRoute()

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      validateState: (input: { page?: number } & StateSchemaInput) => {
        return { page: input.page ?? 0 }
      },
    })

    const routeTree = rootRoute.addChildren([indexRoute])
    // eslint-disable-next-line unused-imports/no-unused-vars
    const router = createRouter({ routeTree })
    expectTypeOf(useHistoryState<typeof router, '/'>).returns.toEqualTypeOf<{
      page: number
    }>()
  })

  describe('shouldThrow', () => {
    test('when shouldThrow is true', () => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const routeTree = rootRoute.addChildren([indexRoute])
      // eslint-disable-next-line unused-imports/no-unused-vars
      const defaultRouter = createRouter({
        routeTree,
      })
      type DefaultRouter = typeof defaultRouter

      expectTypeOf(
        useHistoryState<DefaultRouter, '/', true, true>({
          from: '/',
          shouldThrow: true,
        }),
      ).toEqualTypeOf<{}>()
    })

    test('when shouldThrow is false', () => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const routeTree = rootRoute.addChildren([indexRoute])
      // eslint-disable-next-line unused-imports/no-unused-vars
      const defaultRouter = createRouter({
        routeTree,
      })
      type DefaultRouter = typeof defaultRouter

      expectTypeOf(
        useHistoryState<DefaultRouter, '/', true, false>({
          from: '/',
          shouldThrow: false,
        }),
      ).toEqualTypeOf<{} | undefined>()
    })
  })
})
