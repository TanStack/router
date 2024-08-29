import { expectTypeOf, test } from 'vitest'
import {
  type FullSearchSchema,
  SearchSchemaInput,
  createRootRoute,
  createRoute,
  createRouter,
  useSearch,
} from '../src'

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

  const defaultRouter = createRouter({
    routeTree,
  })

  type DefaultRouter = typeof defaultRouter

  expectTypeOf(useSearch<DefaultRouter['routeTree']>)
    .parameter(0)
    .toHaveProperty('from')
    .toEqualTypeOf<
      '/invoices' | '__root__' | '/invoices/$invoiceId' | '/invoices/' | '/'
    >()

  expectTypeOf(useSearch<DefaultRouter['routeTree']>)
    .parameter(0)
    .toHaveProperty('strict')
    .toEqualTypeOf<true | undefined>()

  expectTypeOf(useSearch<DefaultRouter['routeTree'], '/'>)
    .parameter(0)
    .toHaveProperty('select')
    .parameter(0)
    .toEqualTypeOf<{}>()

  expectTypeOf(useSearch<DefaultRouter['routeTree'], '/'>)
    .parameter(0)
    .toHaveProperty('select')
    .returns.toEqualTypeOf<{}>()

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '/'>,
  ).returns.toEqualTypeOf<{}>()

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '/', false>({ strict: false }),
  ).toEqualTypeOf<{}>()
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

  const defaultRouter = createRouter({
    routeTree,
  })

  type DefaultRouter = typeof defaultRouter

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '/'>,
  ).returns.toEqualTypeOf<{}>()

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '/invoices'>,
  ).returns.toEqualTypeOf<{ page: number }>()

  expectTypeOf(useSearch<DefaultRouter['routeTree'], '/invoices'>)
    .parameter(0)
    .toHaveProperty('select')
    .toEqualTypeOf<
      ((search: { page: number }) => { page: number }) | undefined
    >()

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '/invoices', false>,
  ).returns.toEqualTypeOf<{ page?: number }>()

  expectTypeOf(useSearch<DefaultRouter['routeTree'], '/invoices', false>)
    .parameter(0)
    .toHaveProperty('select')
    .toEqualTypeOf<
      ((search: { page?: number }) => { page?: number }) | undefined
    >()

  expectTypeOf(
    useSearch<
      DefaultRouter['routeTree'],
      '/invoices',
      false,
      FullSearchSchema<DefaultRouter['routeTree']>,
      number
    >,
  ).returns.toEqualTypeOf<number>()
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

  const defaultRouter = createRouter({
    routeTree,
  })

  type DefaultRouter = typeof defaultRouter

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '/'>,
  ).returns.toEqualTypeOf<{}>()

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '/invoices'>,
  ).returns.toEqualTypeOf<{ page: number }>()

  expectTypeOf(useSearch<DefaultRouter['routeTree'], '/invoices'>)
    .parameter(0)
    .toHaveProperty('select')
    .toEqualTypeOf<
      ((search: { page: number }) => { page: number }) | undefined
    >()

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '/invoices', false>,
  ).returns.toEqualTypeOf<{ page?: number; detail?: string }>()

  expectTypeOf(useSearch<DefaultRouter['routeTree'], '/invoices', false>)
    .parameter(0)
    .toHaveProperty('select')
    .toEqualTypeOf<
      | ((search: { page?: number; detail?: string }) => {
          page?: number
          detail?: string
        })
      | undefined
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

  const defaultRouter = createRouter({
    routeTree,
  })

  type DefaultRouter = typeof defaultRouter

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '/'>,
  ).returns.toEqualTypeOf<{}>()

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '/invoices'>,
  ).returns.toEqualTypeOf<{ page: number }>()

  expectTypeOf(useSearch<DefaultRouter['routeTree'], '/invoices'>)
    .parameter(0)
    .toHaveProperty('select')
    .toEqualTypeOf<
      ((search: { page: number }) => { page: number }) | undefined
    >()

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '/invoices', false>,
  ).returns.toEqualTypeOf<{ page?: number; detail?: 'detail' | 50 }>()

  expectTypeOf(useSearch<DefaultRouter['routeTree'], '/invoices', false>)
    .parameter(0)
    .toHaveProperty('select')
    .toEqualTypeOf<
      | ((search: { page?: number; detail?: 'detail' | 50 }) => {
          page?: number
          detail?: 'detail' | 50
        })
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

  const defaultRouter = createRouter({
    routeTree,
  })

  type DefaultRouter = typeof defaultRouter

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '/'>,
  ).returns.toEqualTypeOf<{ indexPage: number }>()

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '__root__'>,
  ).returns.toEqualTypeOf<{}>()

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '/invoices'>,
  ).returns.toEqualTypeOf<{}>()

  expectTypeOf(useSearch<DefaultRouter['routeTree'], '/invoices'>)
    .parameter(0)
    .toHaveProperty('select')
    .toEqualTypeOf<((search: {}) => {}) | undefined>()

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '/invoices', false>,
  ).returns.toEqualTypeOf<{ indexPage?: number }>()

  expectTypeOf(useSearch<DefaultRouter['routeTree'], '/invoices', false>)
    .parameter(0)
    .toHaveProperty('select')
    .toEqualTypeOf<
      ((search: { indexPage?: number }) => { indexPage?: number }) | undefined
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

  const defaultRouter = createRouter({
    routeTree,
  })

  type DefaultRouter = typeof defaultRouter

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '/'>,
  ).returns.toEqualTypeOf<{ rootPage: number }>()

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '__root__'>,
  ).returns.toEqualTypeOf<{ rootPage: number }>()

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '/invoices'>,
  ).returns.toEqualTypeOf<{ rootPage: number }>()

  expectTypeOf(useSearch<DefaultRouter['routeTree'], '/invoices'>)
    .parameter(0)
    .toHaveProperty('select')
    .toEqualTypeOf<
      ((search: { rootPage: number }) => { rootPage: number }) | undefined
    >()

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '/invoices', false>,
  ).returns.toEqualTypeOf<{ rootPage?: number }>()

  expectTypeOf(useSearch<DefaultRouter['routeTree'], '/invoices', false>)
    .parameter(0)
    .toHaveProperty('select')
    .toEqualTypeOf<
      ((search: { rootPage?: number }) => { rootPage?: number }) | undefined
    >()
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

  const defaultRouter = createRouter({
    routeTree,
  })

  type DefaultRouter = typeof defaultRouter

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '/'>,
  ).returns.toEqualTypeOf<{ rootPage: number; indexPage: number }>()

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '__root__'>,
  ).returns.toEqualTypeOf<{ rootPage: number }>()

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '/invoices'>,
  ).returns.toEqualTypeOf<{ rootPage: number }>()

  expectTypeOf(useSearch<DefaultRouter['routeTree'], '/invoices'>)
    .parameter(0)
    .toHaveProperty('select')
    .toEqualTypeOf<
      ((search: { rootPage: number }) => { rootPage: number }) | undefined
    >()

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '/invoices', false>,
  ).returns.toEqualTypeOf<{ indexPage?: number; rootPage?: number }>()

  expectTypeOf(useSearch<DefaultRouter['routeTree'], '/invoices', false>)
    .parameter(0)
    .toHaveProperty('select')
    .toEqualTypeOf<
      | ((search: { indexPage?: number; rootPage?: number }) => {
          indexPage?: number
          rootPage?: number
        })
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

  expectTypeOf(useSearch<typeof routeTree, '/'>).returns.toEqualTypeOf<{
    page: number
  }>
})
