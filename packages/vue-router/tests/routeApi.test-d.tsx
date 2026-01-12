import { describe, expectTypeOf, test } from 'vitest'
import { createRootRoute, createRoute, createRouter, getRouteApi } from '../src'
import type * as Vue from 'vue'
import type { MakeRouteMatch, UseNavigateResult } from '@tanstack/router-core'

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
  beforeLoad: () => ({ beforeLoadContext: 0 }),
  loaderDeps: () => ({ dep: 0 }),
  loader: () => ({ data: 0 }),
})

const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_layout',
})

const postsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: 'posts',
})

const routeTree = rootRoute.addChildren([
  invoicesRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
  layoutRoute.addChildren([postsRoute]),
  indexRoute,
])

const defaultRouter = createRouter({
  routeTree,
})

type DefaultRouter = typeof defaultRouter

type ExtractDefaultFrom<T> =
  T extends UseNavigateResult<infer DefaultFrom> ? DefaultFrom : never

describe('getRouteApi', () => {
  const invoiceRouteApi = getRouteApi<'/invoices/$invoiceId', DefaultRouter>(
    '/invoices/$invoiceId',
  )
  describe('useNavigate', () => {
    test('has a static `from`', () => {
      const navigate = invoiceRouteApi.useNavigate()
      navigate
      expectTypeOf<
        ExtractDefaultFrom<typeof navigate>
      >().toEqualTypeOf<'/invoices/$invoiceId'>()
    })
  })
  test('useParams', () => {
    expectTypeOf(invoiceRouteApi.useParams<DefaultRouter>()).toEqualTypeOf<
      Vue.Ref<{
        invoiceId: string
      }>
    >()
  })
  test('useContext', () => {
    expectTypeOf(
      invoiceRouteApi.useRouteContext<DefaultRouter>(),
    ).toEqualTypeOf<
      Vue.Ref<{
        beforeLoadContext: number
      }>
    >()
  })
  test('useSearch', () => {
    expectTypeOf(invoiceRouteApi.useSearch<DefaultRouter>()).toEqualTypeOf<
      Vue.Ref<{
        page: number
      }>
    >()
  })
  test('useLoaderData', () => {
    expectTypeOf(invoiceRouteApi.useLoaderData<DefaultRouter>()).toEqualTypeOf<
      Vue.Ref<{
        data: number
      }>
    >()
  })
  test('useLoaderDeps', () => {
    expectTypeOf(invoiceRouteApi.useLoaderDeps<DefaultRouter>()).toEqualTypeOf<{
      dep: number
    }>()
  })
  test('useMatch', () => {
    expectTypeOf(invoiceRouteApi.useMatch<DefaultRouter>()).toEqualTypeOf<
      Vue.Ref<MakeRouteMatch<typeof routeTree, '/invoices/$invoiceId'>>
    >()
  })
  test('fullPath', () => {
    expectTypeOf(invoiceRouteApi.fullPath).toEqualTypeOf<'/invoices/$invoiceId'>()
  })
  test('to', () => {
    expectTypeOf(invoiceRouteApi.to).toEqualTypeOf<'/invoices/$invoiceId'>()
  })
  test('id', () => {
    expectTypeOf(invoiceRouteApi.id).toEqualTypeOf<'/invoices/$invoiceId'>()
  })
})

describe('getRouteApi with pathless layout route', () => {
  const postsRouteApi = getRouteApi<'/_layout/posts', DefaultRouter>(
    '/_layout/posts',
  )

  test('id includes the layout segment', () => {
    expectTypeOf(postsRouteApi.id).toEqualTypeOf<'/_layout/posts'>()
  })

  test('fullPath excludes the pathless layout segment', () => {
    expectTypeOf(postsRouteApi.fullPath).toEqualTypeOf<'/posts'>()
  })

  test('to excludes the pathless layout segment', () => {
    expectTypeOf(postsRouteApi.to).toEqualTypeOf<'/posts'>()
  })
})

describe('createRoute', () => {
  describe('useNavigate', () => {
    test('has a static `from`', () => {
      const navigate = invoiceRoute.useNavigate()
      expectTypeOf<
        ExtractDefaultFrom<typeof navigate>
      >().toEqualTypeOf<'/invoices/$invoiceId'>()
    })
  })
})
