import { expectTypeOf, test } from 'vitest'
import { Link, createRoute, createRouter } from '../src'
import { createRootRoute } from '../src'

const rootRoute = createRootRoute()

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
})

export const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts',
})

const postsIndexRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '/',
})

const postRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '$postId',
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

const invoiceEditRoute = createRoute({
  getParentRoute: () => invoiceRoute,
  path: 'edit',
})

const invoiceDetailsRoute = createRoute({
  getParentRoute: () => invoiceRoute,
  path: 'details',
  validateSearch: (): { page?: number } => ({ page: 0 }),
})

const detailRoute = createRoute({
  getParentRoute: () => invoiceDetailsRoute,
  path: '$detailId',
})

const routeTree = rootRoute.addChildren([
  postsRoute.addChildren([postRoute, postsIndexRoute]),
  invoicesRoute.addChildren([
    invoicesIndexRoute,
    invoiceRoute.addChildren([
      invoiceEditRoute,
      invoiceDetailsRoute.addChildren([detailRoute]),
    ]),
  ]),
  indexRoute,
])

const defaultRouter = createRouter({
  routeTree,
})

const routerAlwaysTrailingSlashes = createRouter({
  routeTree,
  trailingSlash: 'always',
})

const routerNeverTrailingSlashes = createRouter({
  routeTree,
  trailingSlash: 'never',
})

const routerPreserveTrailingSlashes = createRouter({
  routeTree,
  trailingSlash: 'preserve',
})

type DefaultRouter = typeof defaultRouter

type RouterAlwaysTrailingSlashes = typeof routerAlwaysTrailingSlashes

type RouterNeverTrailingSlashes = typeof routerNeverTrailingSlashes

type RouterPreserveTrailingSlashes = typeof routerPreserveTrailingSlashes

test('when navigating to the root', () => {
  type hi = DefaultRouter['options']['trailingSlash']
  expectTypeOf(Link<DefaultRouter, string, '/'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '../'
      | './'
      | ''
      | '/'
      | '/invoices'
      | '/invoices/$invoiceId/details/$detailId'
      | '/invoices/$invoiceId/edit'
      | '/posts'
      | '/posts/$postId'
      | 'invoices'
      | 'invoices/$invoiceId/details/$detailId'
      | 'invoices/$invoiceId/edit'
      | 'posts'
      | 'posts/$postId'
      | undefined
    >()

  expectTypeOf(Link<RouterAlwaysTrailingSlashes, string, '/'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '../'
      | './'
      | ''
      | '/'
      | '/invoices/'
      | '/invoices/$invoiceId/details/$detailId/'
      | '/invoices/$invoiceId/edit/'
      | '/posts/'
      | '/posts/$postId/'
      | 'invoices/'
      | 'invoices/$invoiceId/details/$detailId/'
      | 'invoices/$invoiceId/edit/'
      | 'posts/'
      | 'posts/$postId/'
      | undefined
    >()

  expectTypeOf(Link<RouterNeverTrailingSlashes, string, '/'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '../'
      | './'
      | ''
      | '/'
      | '/invoices'
      | '/invoices/$invoiceId/details/$detailId'
      | '/invoices/$invoiceId/edit'
      | '/posts'
      | '/posts/$postId'
      | 'invoices'
      | 'invoices/$invoiceId/details/$detailId'
      | 'invoices/$invoiceId/edit'
      | 'posts'
      | 'posts/$postId'
      | undefined
    >()

  expectTypeOf(Link<RouterPreserveTrailingSlashes, string, '/'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '../'
      | './'
      | ''
      | '/'
      | '/invoices'
      | '/invoices/'
      | '/invoices/$invoiceId/details/$detailId'
      | '/invoices/$invoiceId/details/$detailId/'
      | '/invoices/$invoiceId/edit'
      | '/invoices/$invoiceId/edit/'
      | '/posts'
      | '/posts/'
      | '/posts/$postId'
      | '/posts/$postId/'
      | 'invoices'
      | 'invoices/'
      | 'invoices/$invoiceId/details/$detailId'
      | 'invoices/$invoiceId/details/$detailId/'
      | 'invoices/$invoiceId/edit'
      | 'invoices/$invoiceId/edit/'
      | 'posts'
      | 'posts/'
      | 'posts/$postId'
      | 'posts/$postId/'
      | undefined
    >()
})

test('when navigating from a route with no params and no search to the root', () => {
  expectTypeOf(Link<DefaultRouter, '/posts/', '/'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '../'
      | './'
      | '/'
      | ''
      | '/invoices'
      | '/invoices/$invoiceId/edit'
      | '/invoices/$invoiceId/details/$detailId'
      | '/posts'
      | '/posts/$postId'
      | '$postId'
      | undefined
    >()

  expectTypeOf(Link<RouterAlwaysTrailingSlashes, '/posts/', '/'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '../'
      | './'
      | '/'
      | ''
      | '/invoices/'
      | '/invoices/$invoiceId/edit/'
      | '/invoices/$invoiceId/details/$detailId/'
      | '/posts/'
      | '/posts/$postId/'
      | '$postId/'
      | undefined
    >()

  expectTypeOf(Link<RouterNeverTrailingSlashes, '/posts/', '/'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '../'
      | './'
      | '/'
      | ''
      | '/invoices'
      | '/invoices/$invoiceId/edit'
      | '/invoices/$invoiceId/details/$detailId'
      | '/posts'
      | '/posts/$postId'
      | '$postId'
      | undefined
    >()

  expectTypeOf(Link<RouterPreserveTrailingSlashes, '/posts/', '/'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '../'
      | './'
      | '/'
      | ''
      | '/invoices/'
      | '/invoices'
      | '/invoices/$invoiceId/edit/'
      | '/invoices/$invoiceId/edit'
      | '/invoices/$invoiceId/details/$detailId/'
      | '/invoices/$invoiceId/details/$detailId'
      | '/posts/'
      | '/posts'
      | '/posts/$postId/'
      | '/posts/$postId'
      | '$postId/'
      | '$postId'
      | undefined
    >()
})

test('when navigating from a route with no params and no search to the current route', () => {
  expectTypeOf(Link<DefaultRouter, '/posts/', './'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<'./$postId' | undefined | './'>()

  expectTypeOf(Link<RouterAlwaysTrailingSlashes, '/posts/', './'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<'./$postId/' | undefined | './'>()

  expectTypeOf(Link<RouterNeverTrailingSlashes, '/posts/', './'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<'./$postId' | undefined | './'>()

  expectTypeOf(Link<RouterPreserveTrailingSlashes, '/posts/', './'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<'./$postId/' | './$postId' | undefined | './'>()
})

test('when navigating from a route with no params and no search to the parent route', () => {
  expectTypeOf(Link<DefaultRouter, '/posts', '../'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '../posts'
      | '../posts/$postId'
      | '../invoices/$invoiceId/edit'
      | '../invoices/$invoiceId/details/$detailId'
      | '../invoices'
      | '../'
      | undefined
    >()

  expectTypeOf(Link<RouterAlwaysTrailingSlashes, '/posts', '../'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '../posts/'
      | '../posts/$postId/'
      | '../invoices/$invoiceId/edit/'
      | '../invoices/$invoiceId/details/$detailId/'
      | '../invoices/'
      | '../'
      | undefined
    >()

  expectTypeOf(Link<RouterNeverTrailingSlashes, '/posts', '../'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '../posts'
      | '../posts/$postId'
      | '../invoices/$invoiceId/edit'
      | '../invoices/$invoiceId/details/$detailId'
      | '../invoices'
      | '../'
      | undefined
    >()

  expectTypeOf(Link<RouterPreserveTrailingSlashes, '/posts', '../'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '../posts'
      | '../posts/'
      | '../posts/$postId'
      | '../posts/$postId/'
      | '../invoices/$invoiceId/edit'
      | '../invoices/$invoiceId/edit/'
      | '../invoices/$invoiceId/details/$detailId'
      | '../invoices/$invoiceId/details/$detailId/'
      | '../invoices'
      | '../invoices/'
      | '../'
      | undefined
    >()
})

test('cannot navigate to a branch', () => {
  expectTypeOf(Link<DefaultRouter, string, '/invoices/$invoiceId'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | ''
      | 'posts'
      | '/posts'
      | '/posts/$postId'
      | 'posts/$postId'
      | 'invoices'
      | '/invoices'
      | '/invoices/$invoiceId/edit'
      | 'invoices/$invoiceId/edit'
      | '/invoices/$invoiceId/details/$detailId'
      | 'invoices/$invoiceId/details/$detailId'
      | './'
      | '../'
      | undefined
    >()

  expectTypeOf(
    Link<RouterAlwaysTrailingSlashes, string, '/invoices/$invoiceId'>,
  )
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '/'
      | ''
      | 'posts/'
      | '/posts/'
      | '/posts/$postId/'
      | 'posts/$postId/'
      | 'invoices/'
      | '/invoices/'
      | '/invoices/$invoiceId/edit/'
      | 'invoices/$invoiceId/edit/'
      | '/invoices/$invoiceId/details/$detailId/'
      | 'invoices/$invoiceId/details/$detailId/'
      | './'
      | '../'
      | undefined
    >()
})

test('from autocompletes to all absolute routes', () => {
  const TestLink = Link<DefaultRouter, '/', '/'>
  expectTypeOf(TestLink)
    .parameter(0)
    .toHaveProperty('from')
    .toEqualTypeOf<
      | '/'
      | '/posts/$postId'
      | '/posts/'
      | '/'
      | '/posts'
      | '/invoices'
      | '/invoices/'
      | '/invoices/$invoiceId'
      | '/invoices/$invoiceId/edit'
      | '/invoices/$invoiceId/details'
      | '/invoices/$invoiceId/details/$detailId'
      | undefined
    >()
})

test('when navigating to the same route', () => {
  const TestLink = Link<DefaultRouter, string, string>

  expectTypeOf(TestLink).parameter(0).not.toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(TestLink)
    .parameter(0)
    .toHaveProperty('params')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(TestLink).parameter(0).not.toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(TestLink)
    .parameter(0)
    .toHaveProperty('search')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(TestLink)
    .parameter(0)
    .toHaveProperty('search')
    .extract<boolean>()
    .toEqualTypeOf<true>()
})

test('when navigating to the parent route', () => {
  const TestLink = Link<DefaultRouter, string, '..'>

  expectTypeOf(TestLink).parameter(0).not.toMatchTypeOf<{ params: unknown }>()
  expectTypeOf(TestLink)
    .parameter(0)
    .toHaveProperty('params')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(TestLink).parameter(0).not.toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(TestLink)
    .parameter(0)
    .toHaveProperty('search')
    .extract<boolean>()
    .toEqualTypeOf<true>()
})

test('when navigating from a route with params to the same route', () => {
  const TestLink = Link<DefaultRouter, '/posts/$postId', string>

  expectTypeOf(TestLink).parameter(0).not.toMatchTypeOf<{ params: unknown }>()
  expectTypeOf(TestLink)
    .parameter(0)
    .toHaveProperty('params')
    .extract<boolean>()
    .toEqualTypeOf<true>()
})

test('when navigating to a route with params', () => {
  const TestLink = Link<DefaultRouter, string, '/posts/$postId/'>

  expectTypeOf(TestLink).parameter(0).toMatchTypeOf<{ params: unknown }>()

  const params = expectTypeOf(TestLink).parameter(0).toHaveProperty('params')

  params.exclude<Function | boolean>().toEqualTypeOf<{ postId: string }>()

  params.returns.toEqualTypeOf<{ postId: string }>()
  params
    .parameter(0)
    .toEqualTypeOf<
      | {}
      | { invoiceId: string }
      | { postId: string }
      | { invoiceId: string; detailId: string }
    >()
})

test('when navigating from a route with no params to a route with params', () => {
  const TestLink = Link<DefaultRouter, '/invoices/', './$invoiceId/edit'>

  expectTypeOf(TestLink).parameter(0).toMatchTypeOf<{ params: unknown }>()

  const params = expectTypeOf(TestLink).parameter(0).toHaveProperty('params')

  params.exclude<Function | boolean>().toEqualTypeOf<{ invoiceId: string }>()

  params.returns.toEqualTypeOf<{ invoiceId: string }>()
  params.parameter(0).toEqualTypeOf<{}>()
})

test('when navigating from a route to a route with the same params', () => {
  const TestLink = Link<DefaultRouter, '/invoices/$invoiceId', './edit'>
  const params = expectTypeOf(TestLink).parameter(0).toHaveProperty('params')

  expectTypeOf(TestLink).parameter(0).not.toMatchTypeOf<{ params: unknown }>()

  params
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId?: string | undefined } | undefined>()

  params.returns.toEqualTypeOf<{ invoiceId?: string | undefined }>()
  params.parameter(0).toEqualTypeOf<{ invoiceId: string }>()
})

test('when navigating from a route with params to a route with different params', () => {
  const TestLink = Link<
    DefaultRouter,
    '/invoices/$invoiceId',
    '../../posts/$postId'
  >
  const params = expectTypeOf(TestLink).parameter(0).toHaveProperty('params')

  expectTypeOf(TestLink).parameter(0).toMatchTypeOf<{ params: unknown }>()

  params.exclude<Function | boolean>().toEqualTypeOf<{ postId: string }>()

  params.returns.toEqualTypeOf<{ postId: string }>()
  params.parameter(0).toEqualTypeOf<{ invoiceId: string }>()
})

test('when navigating from a route with params to a route with an additional param', () => {
  const TestLink = Link<
    DefaultRouter,
    '/invoices/$invoiceId',
    './details/$detailId'
  >
  const params = expectTypeOf(TestLink).parameter(0).toHaveProperty('params')

  expectTypeOf(TestLink).parameter(0).toMatchTypeOf<{ params: unknown }>()

  params
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId?: string | undefined; detailId: string }>()

  params.returns.toEqualTypeOf<{ invoiceId?: string; detailId: string }>()
  params.parameter(0).toEqualTypeOf<{ invoiceId: string }>()
})

test('when navigating to a union of routes with params', () => {
  const TestLink = Link<
    DefaultRouter,
    string,
    '/invoices/$invoiceId/edit' | '/posts/$postId'
  >
  const params = expectTypeOf(TestLink).parameter(0).toHaveProperty('params')

  expectTypeOf(TestLink).parameter(0).not.toMatchTypeOf<{ params: unknown }>()

  params
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId: string } | { postId: string } | undefined>()

  params.returns.toEqualTypeOf<{ invoiceId: string } | { postId: string }>()

  params
    .parameter(0)
    .toEqualTypeOf<
      | {}
      | { invoiceId: string }
      | { postId: string }
      | { invoiceId: string; detailId: string }
    >()
})

test('when navigating to a union of routes including the root', () => {
  const TestLink = Link<
    DefaultRouter,
    string,
    '/' | '/invoices/$invoiceId/edit' | '/posts/$postId'
  >
  const params = expectTypeOf(TestLink).parameter(0).toHaveProperty('params')

  expectTypeOf(TestLink).parameter(0).not.toMatchTypeOf<{ params: unknown }>()

  params
    .exclude<Function | boolean>()
    .toEqualTypeOf<
      { invoiceId: string } | { postId: string } | {} | undefined
    >()

  params.returns.toEqualTypeOf<
    { invoiceId: string } | { postId: string } | {}
  >()

  params
    .parameter(0)
    .toEqualTypeOf<
      | {}
      | { invoiceId: string }
      | { postId: string }
      | { invoiceId: string; detailId: string }
    >()
})

test('when navigating from a route with search params to the same route', () => {
  const TestLink = Link<DefaultRouter, '/invoices/$invoiceId', string>

  expectTypeOf(TestLink).parameter(0).toMatchTypeOf<{ search: unknown }>()
  expectTypeOf(TestLink)
    .parameter(0)
    .toHaveProperty('search')
    .extract<boolean>()
    .toEqualTypeOf<true>()
})

test('when navigating to a route with search params', () => {
  const TestLink = Link<DefaultRouter, string, '/invoices/$invoiceId/edit'>
  const params = expectTypeOf(TestLink).parameter(0).toHaveProperty('search')

  expectTypeOf(TestLink).parameter(0).toMatchTypeOf<{ search: unknown }>()

  params.exclude<Function | boolean>().toEqualTypeOf<{ page: number }>()
  params.returns.toEqualTypeOf<{ page: number }>()
  params.parameter(0).toEqualTypeOf<{} | { page: number } | { page?: number }>()
})

test('when navigating to a route with optional search params', () => {
  const TestLink = Link<
    DefaultRouter,
    string,
    '/invoices/$invoiceId/details/$detailId'
  >
  const params = expectTypeOf(TestLink).parameter(0).toHaveProperty('search')

  expectTypeOf(TestLink).parameter(0).not.toMatchTypeOf<{ search: unknown }>()

  params
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page?: number | undefined } | undefined>()

  params.returns.toEqualTypeOf<{ page?: number }>()
  params.parameter(0).toEqualTypeOf<{} | { page: number } | { page?: number }>()
})

test('when navigating from a route with no search params to a route with search params', () => {
  const TestLink = Link<DefaultRouter, '/invoices/', './$invoiceId/edit'>
  const params = expectTypeOf(TestLink).parameter(0).toHaveProperty('search')

  expectTypeOf(TestLink).parameter(0).toMatchTypeOf<{ search: unknown }>()
  params.exclude<Function | boolean>().toEqualTypeOf<{ page: number }>()
  params.returns.toEqualTypeOf<{ page: number }>()
  params.parameter(0).toEqualTypeOf<{}>()
})

test('when navigating to a union of routes with search params', () => {
  const TestLink = Link<
    DefaultRouter,
    string,
    '/invoices/$invoiceId/edit' | '/posts/$postId'
  >
  const params = expectTypeOf(TestLink).parameter(0).toHaveProperty('search')

  expectTypeOf(TestLink).parameter(0).not.toMatchTypeOf<{ search: unknown }>()

  params
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page: number } | {} | undefined>()

  params.returns.toEqualTypeOf<{ page: number } | {}>()

  params.parameter(0).toEqualTypeOf<{} | { page: number } | { page?: number }>()
})

test('when navigating to a union of routes with search params including the root', () => {
  const TestLink = Link<
    DefaultRouter,
    string,
    '/' | '/invoices/$invoiceId/edit' | '/posts/$postId'
  >
  const params = expectTypeOf(TestLink).parameter(0).toHaveProperty('search')

  expectTypeOf(TestLink).parameter(0).not.toMatchTypeOf<{ search: unknown }>()

  params
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page: number } | {} | undefined>()

  params.returns.toEqualTypeOf<{ page: number } | {}>()
  params.parameter(0).toEqualTypeOf<{} | { page: number } | { page?: number }>()
})
