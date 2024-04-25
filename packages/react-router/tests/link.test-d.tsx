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
  expectTypeOf(Link<DefaultRouter, string, '/'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '../'
      | './'
      | ''
      | '/'
      | '/invoices'
      | '/invoices/$invoiceId'
      | '/invoices/$invoiceId/details/$detailId'
      | '/invoices/$invoiceId/details'
      | '/invoices/$invoiceId/edit'
      | '/posts'
      | '/posts/$postId'
      | 'invoices'
      | 'invoices/$invoiceId'
      | 'invoices/$invoiceId/details/$detailId'
      | 'invoices/$invoiceId/details'
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
      | '/invoices/$invoiceId/'
      | '/invoices/$invoiceId/details/$detailId/'
      | '/invoices/$invoiceId/details/'
      | '/invoices/$invoiceId/edit/'
      | '/posts/'
      | '/posts/$postId/'
      | 'invoices/'
      | 'invoices/$invoiceId/'
      | 'invoices/$invoiceId/details/$detailId/'
      | 'invoices/$invoiceId/details/'
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
      | '/invoices/$invoiceId'
      | '/invoices/$invoiceId/details/$detailId'
      | '/invoices/$invoiceId/details'
      | '/invoices/$invoiceId/edit'
      | '/posts'
      | '/posts/$postId'
      | 'invoices'
      | 'invoices/$invoiceId'
      | 'invoices/$invoiceId/details/$detailId'
      | 'invoices/$invoiceId/details'
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
      | '/invoices/$invoiceId'
      | '/invoices/$invoiceId/'
      | '/invoices/$invoiceId/details/$detailId'
      | '/invoices/$invoiceId/details/$detailId/'
      | '/invoices/$invoiceId/details'
      | '/invoices/$invoiceId/details/'
      | '/invoices/$invoiceId/edit'
      | '/invoices/$invoiceId/edit/'
      | '/posts'
      | '/posts/'
      | '/posts/$postId'
      | '/posts/$postId/'
      | 'invoices'
      | 'invoices/'
      | 'invoices/$invoiceId'
      | 'invoices/$invoiceId/'
      | 'invoices/$invoiceId/details/$detailId'
      | 'invoices/$invoiceId/details/$detailId/'
      | 'invoices/$invoiceId/details'
      | 'invoices/$invoiceId/details/'
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
  expectTypeOf(Link<DefaultRouter, '/posts', '/'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '../'
      | './'
      | '/'
      | ''
      | '/invoices'
      | '/invoices/$invoiceId'
      | '/invoices/$invoiceId/edit'
      | '/invoices/$invoiceId/details'
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
      | '/invoices/$invoiceId/'
      | '/invoices/$invoiceId/edit/'
      | '/invoices/$invoiceId/details/'
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
      | '/invoices/$invoiceId'
      | '/invoices/$invoiceId/edit'
      | '/invoices/$invoiceId/details'
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
      | '../'
      | './'
      | '/'
      | ''
      | '/invoices'
      | '/invoices/'
      | '/invoices/$invoiceId'
      | '/invoices/$invoiceId/'
      | '/invoices/$invoiceId/edit'
      | '/invoices/$invoiceId/edit/'
      | '/invoices/$invoiceId/details'
      | '/invoices/$invoiceId/details/'
      | '/invoices/$invoiceId/details/$detailId'
      | '/invoices/$invoiceId/details/$detailId/'
      | '/posts'
      | '/posts/'
      | '/posts/$postId'
      | '/posts/$postId/'
      | '$postId'
      | '$postId/'
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
      | '../invoices/$invoiceId'
      | '../invoices/$invoiceId/edit'
      | '../invoices/$invoiceId/details'
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
      | '../invoices/$invoiceId/'
      | '../invoices/$invoiceId/edit/'
      | '../invoices/$invoiceId/details/'
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
      | '../invoices/$invoiceId'
      | '../invoices/$invoiceId/edit'
      | '../invoices/$invoiceId/details'
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
      | '../invoices/$invoiceId'
      | '../invoices/$invoiceId/'
      | '../invoices/$invoiceId/edit'
      | '../invoices/$invoiceId/edit/'
      | '../invoices/$invoiceId/details'
      | '../invoices/$invoiceId/details/'
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
      | '/'
      | 'posts'
      | '/posts'
      | '/posts/$postId'
      | 'posts/$postId'
      | 'invoices'
      | '/invoices'
      | '/invoices/$invoiceId'
      | '/invoices/$invoiceId/edit'
      | 'invoices/$invoiceId'
      | 'invoices/$invoiceId/edit'
      | '/invoices/$invoiceId/details'
      | '/invoices/$invoiceId/details/$detailId'
      | 'invoices/$invoiceId/details'
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
      | ''
      | '/'
      | 'posts/'
      | '/posts/'
      | '/posts/$postId/'
      | 'posts/$postId/'
      | 'invoices/'
      | '/invoices/'
      | '/invoices/$invoiceId/'
      | '/invoices/$invoiceId/edit/'
      | 'invoices/$invoiceId/'
      | 'invoices/$invoiceId/edit/'
      | '/invoices/$invoiceId/details/'
      | '/invoices/$invoiceId/details/$detailId/'
      | 'invoices/$invoiceId/details/'
      | 'invoices/$invoiceId/details/$detailId/'
      | './'
      | '../'
      | undefined
    >()

  expectTypeOf(Link<RouterNeverTrailingSlashes, string, '/invoices/$invoiceId'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | ''
      | '/'
      | 'posts'
      | '/posts'
      | '/posts/$postId'
      | 'posts/$postId'
      | 'invoices'
      | '/invoices'
      | '/invoices/$invoiceId'
      | '/invoices/$invoiceId/edit'
      | 'invoices/$invoiceId'
      | 'invoices/$invoiceId/edit'
      | '/invoices/$invoiceId/details'
      | '/invoices/$invoiceId/details/$detailId'
      | 'invoices/$invoiceId/details'
      | 'invoices/$invoiceId/details/$detailId'
      | './'
      | '../'
      | undefined
    >()

  expectTypeOf(
    Link<RouterPreserveTrailingSlashes, string, '/invoices/$invoiceId'>,
  )
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | ''
      | '/'
      | 'posts'
      | 'posts/'
      | '/posts'
      | '/posts/'
      | '/posts/$postId'
      | '/posts/$postId/'
      | 'posts/$postId'
      | 'posts/$postId/'
      | 'invoices'
      | 'invoices/'
      | '/invoices'
      | '/invoices/'
      | '/invoices/$invoiceId'
      | '/invoices/$invoiceId/'
      | '/invoices/$invoiceId/edit'
      | '/invoices/$invoiceId/edit/'
      | 'invoices/$invoiceId'
      | 'invoices/$invoiceId/'
      | 'invoices/$invoiceId/edit'
      | 'invoices/$invoiceId/edit/'
      | '/invoices/$invoiceId/details'
      | '/invoices/$invoiceId/details/'
      | '/invoices/$invoiceId/details/$detailId'
      | '/invoices/$invoiceId/details/$detailId/'
      | 'invoices/$invoiceId/details'
      | 'invoices/$invoiceId/details/'
      | 'invoices/$invoiceId/details/$detailId'
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
  const DefaultRouterLink = Link<DefaultRouter, string, string>
  const RouterAlwaysTrailingSlashesLink = Link<
    RouterAlwaysTrailingSlashes,
    string,
    string
  >
  const RouterNeverTrailingSlashesLink = Link<
    RouterNeverTrailingSlashes,
    string,
    string
  >
  const RouterPreserveTrailingSlashesLink = Link<
    RouterPreserveTrailingSlashes,
    string,
    string
  >

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('params')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('params')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('params')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('params')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .not.toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('search')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('search')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('search')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('search')
    .extract<boolean>()
    .toEqualTypeOf<true>()
})

test('when navigating to the parent route', () => {
  const DefaultRouterLink = Link<DefaultRouter, string, '..'>
  const RouterAlwaysTrailingSlashesLink = Link<
    RouterAlwaysTrailingSlashes,
    string,
    '..'
  >
  const RouterNeverTrailingSlashesLink = Link<
    RouterNeverTrailingSlashes,
    string,
    '..'
  >
  const RouterPreserveTrailingSlashesLink = Link<
    RouterNeverTrailingSlashes,
    string,
    '..'
  >

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('params')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('params')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('params')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('params')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .not.toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('search')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('search')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('search')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('search')
    .extract<boolean>()
    .toEqualTypeOf<true>()
})

test('when navigating from a route with params to the same route', () => {
  const DefaultRouterLink = Link<DefaultRouter, '/posts/$postId', string>

  const RouterAlwaysTrailingSlashesLink = Link<
    RouterAlwaysTrailingSlashes,
    '/posts/$postId',
    string
  >

  const RouterNeverTrailingSlashesLink = Link<
    RouterNeverTrailingSlashes,
    '/posts/$postId',
    string
  >

  const RouterPreserveTrailingSlashesLink = Link<
    RouterPreserveTrailingSlashes,
    '/posts/$postId',
    string
  >

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('params')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('params')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('params')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('params')
    .extract<boolean>()
    .toEqualTypeOf<true>()
})

test('when navigating to a route with params', () => {
  const DefaultRouterLink = Link<DefaultRouter, string, '/posts/$postId'>

  const RouterAlwaysTrailingSlashesLink = Link<
    RouterAlwaysTrailingSlashes,
    string,
    '/posts/$postId/'
  >

  const RouterNeverTrailingSlashesLink = Link<
    RouterNeverTrailingSlashes,
    string,
    '/posts/$postId'
  >

  const RouterPreserveTrailingSlashesLink = Link<
    RouterPreserveTrailingSlashes,
    string,
    '/posts/$postId/' | '/posts/$postId'
  >

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .toMatchTypeOf<{ params: unknown }>()

  const defaultRouterLinkParams = expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('params')

  const routerAlwaysTrailingSlashesLinkParams = expectTypeOf(
    RouterAlwaysTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('params')

  const routerNeverTrailingSlashesLinkParams = expectTypeOf(
    RouterNeverTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('params')

  const routerPreserveTrailingSlashesLinkParams = expectTypeOf(
    RouterPreserveTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('params')

  defaultRouterLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ postId: string }>()

  routerAlwaysTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ postId: string }>()

  routerNeverTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ postId: string }>()

  routerPreserveTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ postId: string }>()

  defaultRouterLinkParams.returns.toEqualTypeOf<{ postId: string }>()

  routerAlwaysTrailingSlashesLinkParams.returns.toEqualTypeOf<{
    postId: string
  }>()

  routerNeverTrailingSlashesLinkParams.returns.toEqualTypeOf<{
    postId: string
  }>()

  routerPreserveTrailingSlashesLinkParams.returns.toEqualTypeOf<{
    postId: string
  }>()

  defaultRouterLinkParams
    .parameter(0)
    .toEqualTypeOf<
      | {}
      | { invoiceId: string }
      | { postId: string }
      | { invoiceId: string; detailId: string }
    >()

  routerAlwaysTrailingSlashesLinkParams
    .parameter(0)
    .toEqualTypeOf<
      | {}
      | { invoiceId: string }
      | { postId: string }
      | { invoiceId: string; detailId: string }
    >()

  routerNeverTrailingSlashesLinkParams
    .parameter(0)
    .toEqualTypeOf<
      | {}
      | { invoiceId: string }
      | { postId: string }
      | { invoiceId: string; detailId: string }
    >()

  routerPreserveTrailingSlashesLinkParams
    .parameter(0)
    .toEqualTypeOf<
      | {}
      | { invoiceId: string }
      | { postId: string }
      | { invoiceId: string; detailId: string }
    >()
})

test('when navigating from a route with no params to a route with params', () => {
  const DefaultRouterLink = Link<
    DefaultRouter,
    '/invoices',
    './$invoiceId/edit'
  >

  const RouterAlwaysTrailingSlashesLink = Link<
    RouterAlwaysTrailingSlashes,
    '/invoices',
    './$invoiceId/edit/'
  >

  const RouterNeverTrailingSlashesLink = Link<
    RouterNeverTrailingSlashes,
    '/invoices',
    './$invoiceId/edit'
  >

  const RouterPreserveTrailingSlashesLink = Link<
    RouterNeverTrailingSlashes,
    '/invoices',
    './$invoiceId/edit' | './invoicesId/edit/'
  >

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .toMatchTypeOf<{ params: unknown }>()

  const defaultRouterLinkParams = expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('params')

  const routerAlwaysTrailingSlashesLinkParams = expectTypeOf(
    RouterAlwaysTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('params')

  const routerNeverTrailingSlashesLinkParams = expectTypeOf(
    RouterNeverTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('params')

  const routerPreserveTrailingSlashesLinkParams = expectTypeOf(
    RouterPreserveTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('params')

  defaultRouterLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId: string }>()

  routerAlwaysTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId: string }>()

  routerNeverTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId: string }>()

  routerPreserveTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId: string }>()

  defaultRouterLinkParams.returns.toEqualTypeOf<{ invoiceId: string }>()

  routerAlwaysTrailingSlashesLinkParams.returns.toEqualTypeOf<{
    invoiceId: string
  }>()

  routerNeverTrailingSlashesLinkParams.returns.toEqualTypeOf<{
    invoiceId: string
  }>()

  routerPreserveTrailingSlashesLinkParams.returns.toEqualTypeOf<{
    invoiceId: string
  }>()

  defaultRouterLinkParams.parameter(0).toEqualTypeOf<{}>()

  routerAlwaysTrailingSlashesLinkParams.parameter(0).toEqualTypeOf<{}>()

  routerNeverTrailingSlashesLinkParams.parameter(0).toEqualTypeOf<{}>()

  routerPreserveTrailingSlashesLinkParams.parameter(0).toEqualTypeOf<{}>()
})

test('when navigating from a route to a route with the same params', () => {
  const DefaultRouterLink = Link<
    DefaultRouter,
    '/invoices/$invoiceId',
    './edit'
  >

  const RouterAlwaysTrailingSlashesLink = Link<
    RouterAlwaysTrailingSlashes,
    '/invoices/$invoiceId',
    './edit/'
  >

  const RouterNeverTrailingSlashesLink = Link<
    RouterNeverTrailingSlashes,
    '/invoices/$invoiceId',
    './edit'
  >

  const RouterPreserveTrailingSlashesLink = Link<
    RouterNeverTrailingSlashes,
    '/invoices/$invoiceId',
    './edit' | './edit/'
  >

  const defaultRouterLinkParams = expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('params')

  const routerAlwaysTrailingSlashesLinkParams = expectTypeOf(
    RouterAlwaysTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('params')

  const routerNeverTrailingSlashesLinkParams = expectTypeOf(
    RouterNeverTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('params')

  const routerPreserveTrailingSlashesLinkParams = expectTypeOf(
    RouterPreserveTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('params')

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  defaultRouterLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId?: string | undefined } | undefined>()

  routerAlwaysTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId?: string | undefined } | undefined>()

  routerNeverTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId?: string | undefined } | undefined>()

  routerPreserveTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId?: string | undefined } | undefined>()

  defaultRouterLinkParams.returns.toEqualTypeOf<{
    invoiceId?: string | undefined
  }>()

  routerAlwaysTrailingSlashesLinkParams.returns.toEqualTypeOf<{
    invoiceId?: string | undefined
  }>()

  routerNeverTrailingSlashesLinkParams.returns.toEqualTypeOf<{
    invoiceId?: string | undefined
  }>()

  routerPreserveTrailingSlashesLinkParams.returns.toEqualTypeOf<{
    invoiceId?: string | undefined
  }>()

  defaultRouterLinkParams.parameter(0).toEqualTypeOf<{ invoiceId: string }>()

  routerAlwaysTrailingSlashesLinkParams
    .parameter(0)
    .toEqualTypeOf<{ invoiceId: string }>()

  routerNeverTrailingSlashesLinkParams
    .parameter(0)
    .toEqualTypeOf<{ invoiceId: string }>()

  routerPreserveTrailingSlashesLinkParams
    .parameter(0)
    .toEqualTypeOf<{ invoiceId: string }>()
})

test('when navigating from a route with params to a route with different params', () => {
  const DefaultRouterLink = Link<
    DefaultRouter,
    '/invoices/$invoiceId',
    '../../posts/$postId'
  >

  const RouterAlwaysTrailingSlashesLink = Link<
    RouterAlwaysTrailingSlashes,
    '/invoices/$invoiceId',
    '../../posts/$postId/'
  >

  const RouterNeverTrailingSlashesLink = Link<
    RouterNeverTrailingSlashes,
    '/invoices/$invoiceId',
    '../../posts/$postId'
  >

  const RouterPreserveTrailingSlashesLink = Link<
    RouterPreserveTrailingSlashes,
    '/invoices/$invoiceId',
    '../../posts/$postId' | '../../posts/$postId/'
  >

  const defaultRouterLinkParams = expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('params')

  const routerAlwaysTrailingSlashesLinkParams = expectTypeOf(
    RouterAlwaysTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('params')

  const routerNeverTrailingSlashesLinkParams = expectTypeOf(
    RouterNeverTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('params')

  const routerPreserveTrailingSlashesLinkParams = expectTypeOf(
    RouterPreserveTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('params')

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .toMatchTypeOf<{ params: unknown }>()

  defaultRouterLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ postId: string }>()

  routerAlwaysTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ postId: string }>()

  routerNeverTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ postId: string }>()

  routerPreserveTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ postId: string }>()

  defaultRouterLinkParams.returns.toEqualTypeOf<{ postId: string }>()

  routerAlwaysTrailingSlashesLinkParams.returns.toEqualTypeOf<{
    postId: string
  }>()

  routerNeverTrailingSlashesLinkParams.returns.toEqualTypeOf<{
    postId: string
  }>()

  routerPreserveTrailingSlashesLinkParams.returns.toEqualTypeOf<{
    postId: string
  }>()

  defaultRouterLinkParams.parameter(0).toEqualTypeOf<{ invoiceId: string }>()

  routerAlwaysTrailingSlashesLinkParams.parameter(0).toEqualTypeOf<{
    invoiceId: string
  }>()

  routerNeverTrailingSlashesLinkParams.parameter(0).toEqualTypeOf<{
    invoiceId: string
  }>()

  routerPreserveTrailingSlashesLinkParams
    .parameter(0)
    .toEqualTypeOf<{ invoiceId: string }>()
})

test('when navigating from a route with params to a route with an additional param', () => {
  const DefaultRouterLink = Link<
    DefaultRouter,
    '/invoices/$invoiceId',
    './details/$detailId'
  >

  const RouterAlwaysTrailingSlashesLink = Link<
    RouterAlwaysTrailingSlashes,
    '/invoices/$invoiceId',
    './details/$detailId/'
  >

  const RouterNeverTrailingSlashesLink = Link<
    RouterNeverTrailingSlashes,
    '/invoices/$invoiceId',
    './details/$detailId'
  >

  const RouterPreserveTrailingSlashesLink = Link<
    RouterPreserveTrailingSlashes,
    '/invoices/$invoiceId',
    './details/$detailId' | './details/$detailId'
  >

  const defaultRouterLinkParams = expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('params')

  const routerAlwaysTrailingSlashesLinkParams = expectTypeOf(
    RouterAlwaysTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('params')

  const routerNeverTrailingSlashesLinkParams = expectTypeOf(
    RouterNeverTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('params')

  const routerPreserveTrailingSlashesLinkParams = expectTypeOf(
    RouterPreserveTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('params')

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .toMatchTypeOf<{ params: unknown }>()

  defaultRouterLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId?: string | undefined; detailId: string }>()

  routerAlwaysTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId?: string | undefined; detailId: string }>()

  routerNeverTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId?: string | undefined; detailId: string }>()

  routerPreserveTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId?: string | undefined; detailId: string }>()

  defaultRouterLinkParams.returns.toEqualTypeOf<{
    invoiceId?: string
    detailId: string
  }>()

  routerAlwaysTrailingSlashesLinkParams.returns.toEqualTypeOf<{
    invoiceId?: string
    detailId: string
  }>()

  routerNeverTrailingSlashesLinkParams.returns.toEqualTypeOf<{
    invoiceId?: string
    detailId: string
  }>()

  routerPreserveTrailingSlashesLinkParams.returns.toEqualTypeOf<{
    invoiceId?: string
    detailId: string
  }>()
})

test('when navigating to a union of routes with params', () => {
  const DefaultRouterLink = Link<
    DefaultRouter,
    string,
    '/invoices/$invoiceId/edit' | '/posts/$postId'
  >

  const RouterAlwaysTrailingSlashesLink = Link<
    RouterAlwaysTrailingSlashes,
    string,
    '/invoices/$invoiceId/edit/' | '/posts/$postId/'
  >

  const RouterNeverTrailingSlashesLink = Link<
    RouterNeverTrailingSlashes,
    string,
    '/invoices/$invoiceId/edit' | '/posts/$postId'
  >

  const RouterPreserveTrailingSlashesLink = Link<
    RouterPreserveTrailingSlashes,
    string,
    | '/invoices/$invoiceId/edit'
    | '/invoices/$invoiceId/edit/'
    | '/posts/$postId'
    | '/posts/$postId/'
  >

  const defaultRouterLinkParams = expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('params')

  const routerAlwaysTrailingSlashesLinkParams = expectTypeOf(
    RouterAlwaysTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('params')

  const routerNeverTrailingSlashesLinkParams = expectTypeOf(
    RouterNeverTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('params')

  const routerPreserveTrailingSlashesLinkParams = expectTypeOf(
    RouterPreserveTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('params')

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  defaultRouterLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId: string } | { postId: string } | undefined>()

  routerAlwaysTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId: string } | { postId: string } | undefined>()

  routerNeverTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId: string } | { postId: string } | undefined>()

  routerPreserveTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId: string } | { postId: string } | undefined>()

  defaultRouterLinkParams.returns.toEqualTypeOf<
    { invoiceId: string } | { postId: string }
  >()

  routerAlwaysTrailingSlashesLinkParams.returns.toEqualTypeOf<
    { invoiceId: string } | { postId: string }
  >()

  routerNeverTrailingSlashesLinkParams.returns.toEqualTypeOf<
    { invoiceId: string } | { postId: string }
  >()

  routerPreserveTrailingSlashesLinkParams.returns.toEqualTypeOf<
    { invoiceId: string } | { postId: string }
  >()

  defaultRouterLinkParams
    .parameter(0)
    .toEqualTypeOf<
      | {}
      | { invoiceId: string }
      | { postId: string }
      | { invoiceId: string; detailId: string }
    >()

  routerAlwaysTrailingSlashesLinkParams
    .parameter(0)
    .toEqualTypeOf<
      | {}
      | { invoiceId: string }
      | { postId: string }
      | { invoiceId: string; detailId: string }
    >()

  routerNeverTrailingSlashesLinkParams
    .parameter(0)
    .toEqualTypeOf<
      | {}
      | { invoiceId: string }
      | { postId: string }
      | { invoiceId: string; detailId: string }
    >()

  routerPreserveTrailingSlashesLinkParams
    .parameter(0)
    .toEqualTypeOf<
      | {}
      | { invoiceId: string }
      | { postId: string }
      | { invoiceId: string; detailId: string }
    >()
})

test('when navigating to a union of routes including the root', () => {
  const DefaultRouterLink = Link<
    DefaultRouter,
    string,
    '/' | '/invoices/$invoiceId/edit' | '/posts/$postId'
  >

  const RouterAlwaysTrailingSlashesLink = Link<
    RouterAlwaysTrailingSlashes,
    string,
    '/' | '/invoices/$invoiceId/edit/' | '/posts/$postId/'
  >

  const RouterNeverTrailingSlashesLink = Link<
    RouterNeverTrailingSlashes,
    string,
    '/' | '/invoices/$invoiceId/edit' | '/posts/$postId'
  >

  const RouterPreserveTrailingSlashesLink = Link<
    RouterPreserveTrailingSlashes,
    string,
    | '/'
    | '/invoices/$invoiceId/edit'
    | '/invoices/$invoiceId/edit/'
    | '/posts/$postId'
    | '/posts/$postId/'
  >

  const defaultRouterLinkParams = expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('params')

  const routerAlwaysTrailingSlashesLinkParams = expectTypeOf(
    RouterAlwaysTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('params')

  const routerNeverTrailingSlashesLinkParams = expectTypeOf(
    RouterNeverTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('params')

  const routerPreserveTrailingSlashesLinkParams = expectTypeOf(
    RouterPreserveTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('params')

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ params: unknown }>()

  defaultRouterLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<
      { invoiceId: string } | { postId: string } | {} | undefined
    >()

  routerAlwaysTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<
      { invoiceId: string } | { postId: string } | {} | undefined
    >()

  routerNeverTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<
      { invoiceId: string } | { postId: string } | {} | undefined
    >()

  routerPreserveTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<
      { invoiceId: string } | { postId: string } | {} | undefined
    >()

  defaultRouterLinkParams.returns.toEqualTypeOf<
    { invoiceId: string } | { postId: string } | {}
  >()

  routerAlwaysTrailingSlashesLinkParams.returns.toEqualTypeOf<
    { invoiceId: string } | { postId: string } | {}
  >()

  routerNeverTrailingSlashesLinkParams.returns.toEqualTypeOf<
    { invoiceId: string } | { postId: string } | {}
  >()

  routerPreserveTrailingSlashesLinkParams.returns.toEqualTypeOf<
    { invoiceId: string } | { postId: string } | {}
  >()

  defaultRouterLinkParams
    .parameter(0)
    .toEqualTypeOf<
      | {}
      | { invoiceId: string }
      | { postId: string }
      | { invoiceId: string; detailId: string }
    >()
})

test('when navigating from a route with search params to the same route', () => {
  const DefaultRouterLink = Link<DefaultRouter, '/invoices/$invoiceId', string>

  const RouterAlwaysTrailingSlashesLink = Link<
    RouterAlwaysTrailingSlashes,
    '/invoices/$invoiceId',
    string
  >

  const RouterNeverTrailingSlashesLink = Link<
    RouterNeverTrailingSlashes,
    '/invoices/$invoiceId',
    string
  >

  const RouterPreserveTrailingSlashesLink = Link<
    RouterNeverTrailingSlashes,
    '/invoices/$invoiceId',
    string
  >

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('search')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('search')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('search')
    .extract<boolean>()
    .toEqualTypeOf<true>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('search')
    .extract<boolean>()
    .toEqualTypeOf<true>()
})

test('when navigating to a route with search params', () => {
  const DefaultRouterLink = Link<
    DefaultRouter,
    string,
    '/invoices/$invoiceId/edit'
  >

  const RouterAlwaysTrailingSlashesLink = Link<
    RouterAlwaysTrailingSlashes,
    string,
    '/invoices/$invoiceId/edit/'
  >

  const RouterNeverTrailingSlashesLink = Link<
    RouterNeverTrailingSlashes,
    string,
    '/invoices/$invoiceId/edit'
  >

  const RouterPreserveTrailingSlashesLink = Link<
    RouterPreserveTrailingSlashes,
    string,
    '/invoices/$invoiceId/edit' | '/invoices/$invoiceId/edit/'
  >

  const defaultRouterLinkSearch = expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('search')

  const routerAlwaysTrailingSlashesLinkSearch = expectTypeOf(
    RouterAlwaysTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('search')

  const routerNeverTrailingSlashesLinkSearch = expectTypeOf(
    RouterNeverTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('search')

  const routerPreserveTrailingSlashesLinkSearch = expectTypeOf(
    RouterPreserveTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('search')

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .toMatchTypeOf<{ search: unknown }>()

  defaultRouterLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page: number }>()

  routerAlwaysTrailingSlashesLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page: number }>()

  routerNeverTrailingSlashesLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page: number }>()

  routerPreserveTrailingSlashesLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page: number }>()

  defaultRouterLinkSearch.returns.toEqualTypeOf<{ page: number }>()

  routerAlwaysTrailingSlashesLinkSearch.returns.toEqualTypeOf<{
    page: number
  }>()

  routerNeverTrailingSlashesLinkSearch.returns.toEqualTypeOf<{ page: number }>()

  routerPreserveTrailingSlashesLinkSearch.returns.toEqualTypeOf<{
    page: number
  }>()

  defaultRouterLinkSearch
    .parameter(0)
    .toEqualTypeOf<{} | { page: number } | { page?: number }>()

  routerAlwaysTrailingSlashesLinkSearch
    .parameter(0)
    .toEqualTypeOf<{} | { page: number } | { page?: number }>()

  routerNeverTrailingSlashesLinkSearch
    .parameter(0)
    .toEqualTypeOf<{} | { page: number } | { page?: number }>()

  routerPreserveTrailingSlashesLinkSearch
    .parameter(0)
    .toEqualTypeOf<{} | { page: number } | { page?: number }>()
})

test('when navigating to a route with optional search params', () => {
  const DefaultRouterLink = Link<
    DefaultRouter,
    string,
    '/invoices/$invoiceId/details/$detailId'
  >

  const RouterAlwaysTrailingSlashesLink = Link<
    RouterAlwaysTrailingSlashes,
    string,
    '/invoices/$invoiceId/details/$detailId/'
  >

  const RouterNeverTrailingSlashesLink = Link<
    RouterNeverTrailingSlashes,
    string,
    '/invoices/$invoiceId/details/$detailId'
  >

  const RouterPreserveTrailingSlashesLink = Link<
    RouterPreserveTrailingSlashes,
    string,
    | '/invoices/$invoiceId/details/$detailId'
    | '/invoices/$invoiceId/details/$detailId/'
  >

  const defaultRouterLinkSearch = expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('search')

  const routerAlwaysTrailingSlashesLinkSearch = expectTypeOf(
    RouterAlwaysTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('search')

  const routerNeverTrailingSlashesLinkSearch = expectTypeOf(
    RouterNeverTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('search')

  const routerPreserveTrailingSlashesLinkSearch = expectTypeOf(
    RouterPreserveTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('search')

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .not.toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ search: unknown }>()

  defaultRouterLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page?: number | undefined } | undefined>()

  routerAlwaysTrailingSlashesLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page?: number | undefined } | undefined>()

  routerNeverTrailingSlashesLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page?: number | undefined } | undefined>()

  routerPreserveTrailingSlashesLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page?: number | undefined } | undefined>()

  defaultRouterLinkSearch.returns.toEqualTypeOf<{ page?: number }>()

  routerAlwaysTrailingSlashesLinkSearch.returns.toEqualTypeOf<{
    page?: number
  }>()

  routerNeverTrailingSlashesLinkSearch.returns.toEqualTypeOf<{
    page?: number
  }>()

  routerPreserveTrailingSlashesLinkSearch.returns.toEqualTypeOf<{
    page?: number
  }>()

  defaultRouterLinkSearch
    .parameter(0)
    .toEqualTypeOf<{} | { page: number } | { page?: number }>()

  routerAlwaysTrailingSlashesLinkSearch
    .parameter(0)
    .toEqualTypeOf<{} | { page: number } | { page?: number }>()

  routerNeverTrailingSlashesLinkSearch
    .parameter(0)
    .toEqualTypeOf<{} | { page: number } | { page?: number }>()

  routerPreserveTrailingSlashesLinkSearch
    .parameter(0)
    .toEqualTypeOf<{} | { page: number } | { page?: number }>()
})

test('when navigating from a route with no search params to a route with search params', () => {
  const DefaultRouterLink = Link<
    DefaultRouter,
    '/invoices/',
    './$invoiceId/edit'
  >

  const RouterAlwaysTrailingSlashesLink = Link<
    RouterAlwaysTrailingSlashes,
    '/invoices/',
    './$invoiceId/edit/'
  >

  const RouterNeverTrailingSlashesLink = Link<
    RouterNeverTrailingSlashes,
    '/invoices/',
    './$invoiceId/edit'
  >

  const RouterPreserveTrailingSlashesLink = Link<
    RouterPreserveTrailingSlashes,
    '/invoices/',
    './$invoiceId/edit/' | './$invoiceId/edit'
  >

  const defaultRouterLinkSearch = expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('search')

  const routerAlwaysTrailingSlashesLinkSearch = expectTypeOf(
    RouterAlwaysTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('search')

  const routerNeverTrailingSlashesLinkSearch = expectTypeOf(
    RouterNeverTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('search')

  const routerPreserveTrailingSlashesLinkSearch = expectTypeOf(
    RouterPreserveTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('search')

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .toMatchTypeOf<{ search: unknown }>()

  defaultRouterLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page: number }>()

  routerAlwaysTrailingSlashesLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page: number }>()

  routerNeverTrailingSlashesLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page: number }>()

  defaultRouterLinkSearch.returns.toEqualTypeOf<{ page: number }>()

  routerAlwaysTrailingSlashesLinkSearch.returns.toEqualTypeOf<{
    page: number
  }>()

  routerNeverTrailingSlashesLinkSearch.returns.toEqualTypeOf<{
    page: number
  }>()

  routerPreserveTrailingSlashesLinkSearch.returns.toEqualTypeOf<{
    page: number
  }>()

  defaultRouterLinkSearch.parameter(0).toEqualTypeOf<{}>()

  routerAlwaysTrailingSlashesLinkSearch.parameter(0).toEqualTypeOf<{}>()

  routerNeverTrailingSlashesLinkSearch.parameter(0).toEqualTypeOf<{}>()

  routerPreserveTrailingSlashesLinkSearch.parameter(0).toEqualTypeOf<{}>()
})

test('when navigating to a union of routes with search params', () => {
  const DefaultRouterLink = Link<
    DefaultRouter,
    string,
    '/invoices/$invoiceId/edit' | '/posts/$postId'
  >

  const RouterAlwaysTrailingSlashesLink = Link<
    RouterAlwaysTrailingSlashes,
    string,
    '/invoices/$invoiceId/edit/' | '/posts/$postId/'
  >

  const RouterNeverTrailingSlashesLink = Link<
    RouterNeverTrailingSlashes,
    string,
    '/invoices/$invoiceId/edit' | '/posts/$postId'
  >

  const RouterPreserveTrailingSlashesLink = Link<
    RouterPreserveTrailingSlashes,
    string,
    | '/invoices/$invoiceId/edit'
    | '/posts/$postId'
    | '/invoices/$invoiceId/edit/'
    | '/posts/$postId/'
  >

  const defaultRouterLinkSearch = expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('search')

  const routerAlwaysTrailingSlashesSearch = expectTypeOf(
    RouterAlwaysTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('search')

  const routerNeverTrailingSlashesSearch = expectTypeOf(
    RouterNeverTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('search')

  const routerPreserveTrailingSlashesSearch = expectTypeOf(
    RouterNeverTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('search')

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .not.toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ search: unknown }>()

  defaultRouterLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page: number } | {} | undefined>()

  routerAlwaysTrailingSlashesSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page: number } | {} | undefined>()

  routerNeverTrailingSlashesSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page: number } | {} | undefined>()

  routerPreserveTrailingSlashesSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page: number } | {} | undefined>()

  defaultRouterLinkSearch.returns.toEqualTypeOf<{ page: number } | {}>()

  routerAlwaysTrailingSlashesSearch.returns.toEqualTypeOf<
    { page: number } | {}
  >()

  routerNeverTrailingSlashesSearch.returns.toEqualTypeOf<
    { page: number } | {}
  >()

  routerPreserveTrailingSlashesSearch.returns.toEqualTypeOf<
    { page: number } | {}
  >()

  defaultRouterLinkSearch.returns.toEqualTypeOf<{ page: number } | {}>()

  routerAlwaysTrailingSlashesSearch.returns.toEqualTypeOf<
    { page: number } | {}
  >()

  routerNeverTrailingSlashesSearch.returns.toEqualTypeOf<
    { page: number } | {}
  >()

  routerPreserveTrailingSlashesSearch.returns.toEqualTypeOf<
    { page: number } | {}
  >()

  defaultRouterLinkSearch
    .parameter(0)
    .toEqualTypeOf<{} | { page: number } | { page?: number }>()

  routerAlwaysTrailingSlashesSearch
    .parameter(0)
    .toEqualTypeOf<{} | { page: number } | { page?: number }>()

  routerNeverTrailingSlashesSearch
    .parameter(0)
    .toEqualTypeOf<{} | { page: number } | { page?: number }>()

  routerPreserveTrailingSlashesSearch
    .parameter(0)
    .toEqualTypeOf<{} | { page: number } | { page?: number }>()
})

test('when navigating to a union of routes with search params including the root', () => {
  const DefaultRouterLink = Link<
    DefaultRouter,
    string,
    '/' | '/invoices/$invoiceId/edit' | '/posts/$postId'
  >

  const RouterAlwaysTrailingSlashesLink = Link<
    RouterAlwaysTrailingSlashes,
    string,
    '/' | '/invoices/$invoiceId/edit/' | '/posts/$postId/'
  >

  const RouterNeverTrailingSlashesLink = Link<
    RouterNeverTrailingSlashes,
    string,
    '/' | '/invoices/$invoiceId/edit' | '/posts/$postId'
  >

  const RouterPreserveTrailingSlashesLink = Link<
    RouterPreserveTrailingSlashes,
    string,
    | '/'
    | '/invoices/$invoiceId/edit'
    | '/posts/$postId'
    | '/invoices/$invoiceId/edit/'
    | '/posts/$postId/'
  >

  const defaultRouterSearch = expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('search')

  const routerAlwaysTrailingSlashesLinkSearch = expectTypeOf(
    RouterAlwaysTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('search')

  const routerNeverTrailingSlashesLinkSearch = expectTypeOf(
    RouterAlwaysTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('search')

  const routerPreserveTrailingSlashesLinkSearch = expectTypeOf(
    RouterAlwaysTrailingSlashesLink,
  )
    .parameter(0)
    .toHaveProperty('search')

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .not.toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .not.toMatchTypeOf<{ search: unknown }>()

  defaultRouterSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page: number } | {} | undefined>()

  routerAlwaysTrailingSlashesLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page: number } | {} | undefined>()

  routerNeverTrailingSlashesLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page: number } | {} | undefined>()

  routerPreserveTrailingSlashesLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page: number } | {} | undefined>()

  defaultRouterSearch.returns.toEqualTypeOf<{ page: number } | {}>()

  routerAlwaysTrailingSlashesLinkSearch.returns.toEqualTypeOf<
    { page: number } | {}
  >()

  routerNeverTrailingSlashesLinkSearch.returns.toEqualTypeOf<
    { page: number } | {}
  >()

  routerPreserveTrailingSlashesLinkSearch.returns.toEqualTypeOf<
    { page: number } | {}
  >()

  defaultRouterSearch
    .parameter(0)
    .toEqualTypeOf<{} | { page: number } | { page?: number }>()

  routerAlwaysTrailingSlashesLinkSearch
    .parameter(0)
    .toEqualTypeOf<{} | { page: number } | { page?: number }>()

  routerNeverTrailingSlashesLinkSearch
    .parameter(0)
    .toEqualTypeOf<{} | { page: number } | { page?: number }>()

  routerPreserveTrailingSlashesLinkSearch
    .parameter(0)
    .toEqualTypeOf<{} | { page: number } | { page?: number }>()
})
