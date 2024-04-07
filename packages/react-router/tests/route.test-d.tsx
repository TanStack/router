import { expectTypeOf, test } from 'vitest'
import {
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
} from '../src'

test('when creating the root', () => {
  const rootRoute = createRootRoute()

  expectTypeOf(rootRoute.fullPath).toEqualTypeOf<'/'>()
  expectTypeOf(rootRoute.id).toEqualTypeOf<'__root__'>()
  expectTypeOf(rootRoute.path).toEqualTypeOf<'/'>()
})

test('when creating the root route with context', () => {
  const createRouteResult = createRootRouteWithContext<{ userId: string }>()

  const rootRoute = createRouteResult()

  expectTypeOf(rootRoute.options.loader)
    .parameter(0)
    .toMatchTypeOf<{ context: { userId: string } }>()

  expectTypeOf(rootRoute.fullPath).toEqualTypeOf<'/'>()
  expectTypeOf(rootRoute.id).toEqualTypeOf<'__root__'>()
  expectTypeOf(rootRoute.path).toEqualTypeOf<'/'>()

  expectTypeOf(rootRoute.useRouteContext()).toEqualTypeOf<{ userId: string }>()
  expectTypeOf(rootRoute.useRouteContext<string>)
    .parameter(0)
    .toEqualTypeOf<
      { select?: (search: { userId: string }) => string } | undefined
    >()
})

test('when creating a child route from the root route', () => {
  const rootRoute = createRootRoute()

  const invoicesRoute = createRoute({
    path: 'invoices',
    getParentRoute: () => rootRoute,
  })

  expectTypeOf(invoicesRoute.fullPath).toEqualTypeOf<'/invoices'>()
  expectTypeOf(invoicesRoute.path).toEqualTypeOf<'invoices'>()
  expectTypeOf(invoicesRoute.id).toEqualTypeOf<'/invoices'>()
})

test('when creating a child route from the root route with context', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  const invoicesRoute = createRoute({
    path: 'invoices',
    getParentRoute: () => rootRoute,
  })

  expectTypeOf(rootRoute.useRouteContext()).toEqualTypeOf<{ userId: string }>()

  expectTypeOf(invoicesRoute.useRouteContext<string>)
    .parameter(0)
    .toEqualTypeOf<
      { select?: (search: { userId: string }) => string } | undefined
    >()
})

test('when creating a child route with a loader from the root route', () => {
  const rootRoute = createRootRoute()

  const invoicesRoute = createRoute({
    path: 'invoices',
    getParentRoute: () => rootRoute,
    loader: async () => [{ id: 'invoice1' }, { id: 'invoice2' }] as const,
  })

  expectTypeOf(invoicesRoute.useLoaderData<string>)
    .parameter(0)
    .toEqualTypeOf<
      | {
          select?: (
            search: readonly [
              { readonly id: 'invoice1' },
              { readonly id: 'invoice2' },
            ],
          ) => string
        }
      | undefined
    >()

  expectTypeOf(invoicesRoute.useLoaderData()).toEqualTypeOf<
    readonly [{ readonly id: 'invoice1' }, { readonly id: 'invoice2' }]
  >()
})

test('when creating a child route with a loader from the root route with context', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  const invoicesRoute = createRoute({
    path: 'invoices',
    getParentRoute: () => rootRoute,
    loader: async () => [{ id: 'invoice1' }, { id: 'invoice2' }] as const,
  })

  expectTypeOf(invoicesRoute.options.loader)
    .parameter(0)
    .toMatchTypeOf<{ context: { userId: string } }>()

  expectTypeOf(invoicesRoute.useLoaderData<string>)
    .parameter(0)
    .toEqualTypeOf<
      | {
          select?: (
            search: readonly [
              { readonly id: 'invoice1' },
              { readonly id: 'invoice2' },
            ],
          ) => string
        }
      | undefined
    >()

  expectTypeOf(invoicesRoute.useLoaderData()).toEqualTypeOf<
    readonly [{ readonly id: 'invoice1' }, { readonly id: 'invoice2' }]
  >()
})

test('when creating a child route with search params from the root route', () => {
  const rootRoute = createRootRoute()

  const invoicesRoute = createRoute({
    path: 'invoices',
    getParentRoute: () => rootRoute,
    validateSearch: () => ({ page: 0 }),
  })

  expectTypeOf(invoicesRoute.useSearch()).toEqualTypeOf<{ page: number }>()
  expectTypeOf(invoicesRoute.useSearch<number>)
    .parameter(0)
    .toEqualTypeOf<
      { select?: (search: { page: number }) => number } | undefined
    >()
})

test('when creating a child route with params from the root route', () => {
  const rootRoute = createRootRoute()

  const invoicesRoute = createRoute({
    path: 'invoices/$invoiceId',
    getParentRoute: () => rootRoute,
  })

  expectTypeOf(invoicesRoute.useParams()).toEqualTypeOf<{ invoiceId: string }>()
  expectTypeOf(invoicesRoute.useParams<string>)
    .parameter(0)
    .toEqualTypeOf<
      { select?: (search: { invoiceId: string }) => string } | undefined
    >()
})

test('when creating a child route with params, search and loader from the root route', () => {
  const rootRoute = createRootRoute()

  const invoicesRoute = createRoute({
    path: 'invoices/$invoiceId',
    getParentRoute: () => rootRoute,
    loader: () => ({ id: 'invoiceId1' }),
    validateSearch: () => ({ page: 0 }),
  })

  expectTypeOf(invoicesRoute.options.loader).parameter(0).toMatchTypeOf<{
    params: { invoiceId: string }
  }>()
})

test('when creating a child route with params, search, loader and loaderDeps from the root route', () => {
  const rootRoute = createRootRoute()

  const invoicesRoute = createRoute({
    path: 'invoices/$invoiceId',
    getParentRoute: () => rootRoute,
    loader: () => ({ id: 'invoiceId1' }),
    validateSearch: () => ({ page: 0 }),
    loaderDeps: (deps) => ({ page: deps.search.page }),
  })

  expectTypeOf(invoicesRoute.options.loader).parameter(0).toMatchTypeOf<{
    params: { invoiceId: string }
    deps: { page: number }
  }>()
})

test('when creating a child route with params, search, loader and loaderDeps from the root route with context', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  const invoicesRoute = createRoute({
    path: 'invoices/$invoiceId',
    getParentRoute: () => rootRoute,
    loader: () => ({ id: 'invoiceId1' }),
    validateSearch: () => ({ page: 0 }),
    loaderDeps: (deps) => ({ page: deps.search.page }),
  })

  expectTypeOf(invoicesRoute.options.loader).parameter(0).toMatchTypeOf<{
    params: { invoiceId: string }
    deps: { page: number }
    context: { userId: string }
  }>()
})

test('when creating a child route with params, search with beforeLoad from the root route with context', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  const invoicesRoute = createRoute({
    path: 'invoices/$invoiceId',
    getParentRoute: () => rootRoute,
    validateSearch: () => ({ page: 0 }),
  })

  expectTypeOf(invoicesRoute.options.beforeLoad).parameter(0).toMatchTypeOf<{
    params: { invoiceId: string }
    context: { userId: string }
    search: { page: number }
  }>()
})

test('when creating a child route with params from a parent with params', () => {
  const rootRoute = createRootRoute()

  const invoicesRoute = createRoute({
    path: 'invoices/$invoiceId',
    getParentRoute: () => rootRoute,
  })

  const detailsRoute = createRoute({
    path: '$detailId',
    getParentRoute: () => invoicesRoute,
  })

  expectTypeOf(detailsRoute.useParams()).toEqualTypeOf<{
    invoiceId: string
    detailId: string
  }>()

  expectTypeOf(detailsRoute.useParams<string>)
    .parameter(0)
    .toEqualTypeOf<
      | {
          select?: (search: { invoiceId: string; detailId: string }) => string
        }
      | undefined
    >()
})

test('when creating a child route with search from a parent with search', () => {
  const rootRoute = createRootRoute()

  const invoicesRoute = createRoute({
    path: 'invoices',
    getParentRoute: () => rootRoute,
    validateSearch: () => ({ invoicePage: 0 }),
  })

  const detailsRoute = createRoute({
    path: 'details',
    getParentRoute: () => invoicesRoute,
    validateSearch: () => ({ detailPage: 0 }),
  })

  expectTypeOf(detailsRoute.useSearch()).toEqualTypeOf<{
    invoicePage: number
    detailPage: number
  }>()

  expectTypeOf(detailsRoute.useSearch<number>)
    .parameter(0)
    .toEqualTypeOf<
      | {
          select?: (search: {
            invoicePage: number
            detailPage: number
          }) => number
        }
      | undefined
    >()
})

test('when creating a child route with context from a parent with context', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  const invoicesRoute = createRoute({
    path: 'invoices',
    getParentRoute: () => rootRoute,
    beforeLoad: () => ({ invoiceId: 'invoiceId1' }),
  })

  const detailsRoute = createRoute({
    path: 'details',
    getParentRoute: () => invoicesRoute,
    beforeLoad: () => ({ detailId: 'detailId1' }),
  })

  expectTypeOf(detailsRoute.useRouteContext()).toEqualTypeOf<{
    userId: string
    invoiceId: string
    detailId: string
  }>()

  expectTypeOf(detailsRoute.useRouteContext<string>)
    .parameter(0)
    .toEqualTypeOf<
      | {
          select?: (search: {
            userId: string
            invoiceId: string
            detailId: string
          }) => string
        }
      | undefined
    >()
})

test('when creating a child route with context, search, params, loaderDeps and loader', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  const invoicesRoute = createRoute({
    path: 'invoices',
    getParentRoute: () => rootRoute,
    validateSearch: () => ({ page: 0 }),
    beforeLoad: () => ({ invoicePermissions: ['view'] as const }),
  })

  const invoiceRoute = createRoute({
    path: '$invoiceId',
    getParentRoute: () => invoicesRoute,
  })

  const detailsRoute = createRoute({
    path: 'details',
    getParentRoute: () => invoiceRoute,
    validateSearch: () => ({ detailPage: 0 }),
    beforeLoad: () => ({ detailsPermissions: ['view'] as const }),
  })

  const detailRoute = createRoute({
    path: '$detailId',
    getParentRoute: () => detailsRoute,
    loaderDeps: (deps) => ({
      detailPage: deps.search.detailPage,
      invoicePage: deps.search.page,
    }),
  })

  expectTypeOf(detailRoute.options.loader).parameter(0).toMatchTypeOf<{
    params: { detailId: string; invoiceId: string }
    deps: { detailPage: number; invoicePage: number }
    context: {
      userId: string
      detailsPermissions: readonly ['view']
      invoicePermissions: readonly ['view']
    }
  }>()
})

test('when creating a child route with context, search, params and beforeLoad', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  const invoicesRoute = createRoute({
    path: 'invoices',
    getParentRoute: () => rootRoute,
    validateSearch: () => ({ page: 0 }),
    beforeLoad: () => ({ invoicePermissions: ['view'] as const }),
  })

  const invoiceRoute = createRoute({
    path: '$invoiceId',
    getParentRoute: () => invoicesRoute,
  })

  const detailsRoute = createRoute({
    path: 'details',
    getParentRoute: () => invoiceRoute,
    validateSearch: () => ({ detailPage: 0 }),
    beforeLoad: () => ({ detailsPermissions: ['view'] as const }),
  })

  const detailRoute = createRoute({
    path: '$detailId',
    getParentRoute: () => detailsRoute,
  })

  expectTypeOf(detailRoute.options.beforeLoad).parameter(0).toMatchTypeOf<{
    params: { detailId: string; invoiceId: string }
    search: { detailPage: number; page: number }
    context: {
      userId: string
      detailsPermissions: readonly ['view']
      invoicePermissions: readonly ['view']
    }
  }>()
})
