import { expectTypeOf, test } from 'vitest'
import {
  Link,
  type SearchSchemaInput,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

const rootRoute = createRootRoute({
  validateSearch: (): { rootPage?: number } => ({ rootPage: 0 }),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: () => ({ rootIndexPage: 0 }),
})

const postsRoute = createRoute({
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

const linesRoute = createRoute({
  getParentRoute: () => detailRoute,
  path: 'lines',
  validateSearch: (input: { linesPage?: number } & SearchSchemaInput) => {
    if (typeof input.linesPage !== 'number') throw new Error()

    return {
      linesPage: input.linesPage,
    }
  },
})

const routeTreeTuples = rootRoute.addChildren([
  postsRoute.addChildren([postRoute, postsIndexRoute]),
  invoicesRoute.addChildren([
    invoicesIndexRoute,
    invoiceRoute.addChildren([
      invoiceEditRoute,
      invoiceDetailsRoute.addChildren([detailRoute.addChildren([linesRoute])]),
    ]),
  ]),
  indexRoute,
])

const routeTreeObjects = rootRoute.addChildren({
  postsRoute: postsRoute.addChildren({ postRoute, postsIndexRoute }),
  invoicesRoute: invoicesRoute.addChildren({
    invoicesIndexRoute,
    invoiceRoute: invoiceRoute.addChildren({
      invoiceEditRoute,
      invoiceDetailsRoute: invoiceDetailsRoute.addChildren({
        detailRoute: detailRoute.addChildren({ linesRoute }),
      }),
    }),
  }),
  indexRoute,
})

const defaultRouter = createRouter({
  routeTree: routeTreeTuples,
})

const defaultRouterObjects = createRouter({
  routeTree: routeTreeObjects,
})

const routerAlwaysTrailingSlashes = createRouter({
  routeTree: routeTreeTuples,
  trailingSlash: 'always',
})

const routerNeverTrailingSlashes = createRouter({
  routeTree: routeTreeTuples,
  trailingSlash: 'never',
})

const routerPreserveTrailingSlashes = createRouter({
  routeTree: routeTreeTuples,
  trailingSlash: 'preserve',
})

type DefaultRouter = typeof defaultRouter

type DefaultRouterObjects = typeof defaultRouterObjects

type RouterAlwaysTrailingSlashes = typeof routerAlwaysTrailingSlashes

type RouterNeverTrailingSlashes = typeof routerNeverTrailingSlashes

type RouterPreserveTrailingSlashes = typeof routerPreserveTrailingSlashes

test('when navigating to the root', () => {
  const DefaultRouterLink = Link<DefaultRouter, string, '/'>
  const DefaultRouterObjectsLink = Link<DefaultRouterObjects, string, '/'>
  const RouterAlwaysTrailingSlashLink = Link<
    RouterAlwaysTrailingSlashes,
    string,
    '/'
  >
  const RouterNeverTrailingSlashLink = Link<
    RouterNeverTrailingSlashes,
    string,
    '/'
  >
  const RouterPreserveTrailingSlashLink = Link<
    RouterPreserveTrailingSlashes,
    string,
    '/'
  >

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '../'
      | './'
      | '/'
      | '/invoices'
      | '/invoices/$invoiceId'
      | '/invoices/$invoiceId/details/$detailId'
      | '/invoices/$invoiceId/details'
      | '/invoices/$invoiceId/details/$detailId/lines'
      | '/invoices/$invoiceId/edit'
      | '/posts'
      | '/posts/$postId'
      | undefined
    >()

  expectTypeOf(DefaultRouterObjectsLink)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '../'
      | './'
      | '/'
      | '/invoices'
      | '/invoices/$invoiceId'
      | '/invoices/$invoiceId/details/$detailId'
      | '/invoices/$invoiceId/details/$detailId/lines'
      | '/invoices/$invoiceId/details'
      | '/invoices/$invoiceId/edit'
      | '/posts'
      | '/posts/$postId'
      | undefined
    >()

  expectTypeOf(RouterAlwaysTrailingSlashLink)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '../'
      | './'
      | '/'
      | '/invoices/'
      | '/invoices/$invoiceId/'
      | '/invoices/$invoiceId/details/$detailId/'
      | '/invoices/$invoiceId/details/$detailId/lines/'
      | '/invoices/$invoiceId/details/'
      | '/invoices/$invoiceId/edit/'
      | '/posts/'
      | '/posts/$postId/'
      | undefined
    >()

  expectTypeOf(RouterNeverTrailingSlashLink)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '../'
      | './'
      | '/'
      | '/invoices'
      | '/invoices/$invoiceId'
      | '/invoices/$invoiceId/details/$detailId'
      | '/invoices/$invoiceId/details/$detailId/lines'
      | '/invoices/$invoiceId/details'
      | '/invoices/$invoiceId/edit'
      | '/posts'
      | '/posts/$postId'
      | undefined
    >()

  expectTypeOf(RouterPreserveTrailingSlashLink)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '../'
      | './'
      | '/'
      | '/invoices'
      | '/invoices/'
      | '/invoices/$invoiceId'
      | '/invoices/$invoiceId/'
      | '/invoices/$invoiceId/details/$detailId'
      | '/invoices/$invoiceId/details/$detailId/'
      | '/invoices/$invoiceId/details/$detailId/lines'
      | '/invoices/$invoiceId/details/$detailId/lines/'
      | '/invoices/$invoiceId/details'
      | '/invoices/$invoiceId/details/'
      | '/invoices/$invoiceId/edit'
      | '/invoices/$invoiceId/edit/'
      | '/posts'
      | '/posts/'
      | '/posts/$postId'
      | '/posts/$postId/'
      | undefined
    >()

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(DefaultRouterObjectsLink)
    .parameter(0)
    .toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterAlwaysTrailingSlashLink)
    .parameter(0)
    .toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterNeverTrailingSlashLink)
    .parameter(0)
    .toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(RouterPreserveTrailingSlashLink)
    .parameter(0)
    .toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ rootPage?: number; rootIndexPage: number }>()

  expectTypeOf(DefaultRouterObjectsLink)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ rootPage?: number; rootIndexPage: number }>()

  expectTypeOf(RouterAlwaysTrailingSlashLink)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ rootPage?: number; rootIndexPage: number }>()

  expectTypeOf(RouterNeverTrailingSlashLink)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ rootPage?: number; rootIndexPage: number }>()

  expectTypeOf(RouterPreserveTrailingSlashLink)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ rootPage?: number; rootIndexPage: number }>()

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{
      page?: number
      rootIndexPage?: number
      rootPage?: number
      linesPage?: number
    }>()

  expectTypeOf(DefaultRouterObjectsLink)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{
      page?: number
      rootIndexPage?: number
      rootPage?: number
      linesPage?: number
    }>()

  expectTypeOf(RouterAlwaysTrailingSlashLink)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{
      page?: number
      rootIndexPage?: number
      rootPage?: number
      linesPage?: number
    }>()

  expectTypeOf(RouterNeverTrailingSlashLink)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{
      page?: number
      rootIndexPage?: number
      rootPage?: number
      linesPage?: number
    }>()

  expectTypeOf(RouterPreserveTrailingSlashLink)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{
      page?: number
      rootIndexPage?: number
      rootPage?: number
      linesPage?: number
    }>()

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{ rootPage?: number; rootIndexPage: number }>()

  expectTypeOf(DefaultRouterObjectsLink)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{ rootPage?: number; rootIndexPage: number }>()

  expectTypeOf(RouterAlwaysTrailingSlashLink)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{ rootPage?: number; rootIndexPage: number }>()

  expectTypeOf(RouterNeverTrailingSlashLink)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{ rootPage?: number; rootIndexPage: number }>()

  expectTypeOf(RouterPreserveTrailingSlashLink)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{ rootPage?: number; rootIndexPage: number }>()
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
      | '/invoices/$invoiceId/details/$detailId/lines'
      | '/posts'
      | '/posts/$postId'
      | '$postId'
      | undefined
    >()

  expectTypeOf(Link<DefaultRouterObjects, '/posts', '/'>)
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
      | '/invoices/$invoiceId/details/$detailId/lines'
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
      | '/invoices/$invoiceId/details/$detailId/lines/'
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
      | '/invoices/$invoiceId/details/$detailId/lines'
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
      | '/invoices/$invoiceId/details/$detailId/lines'
      | '/invoices/$invoiceId/details/$detailId/lines/'
      | '/posts'
      | '/posts/'
      | '/posts/$postId'
      | '/posts/$postId/'
      | '$postId'
      | '$postId/'
      | undefined
    >()

  expectTypeOf(Link<DefaultRouter, '/posts', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function>().toEqualTypeOf<{
    rootPage?: number
    rootIndexPage: number
  }>

  expectTypeOf(Link<DefaultRouterObjects, '/posts', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function>().toEqualTypeOf<{
    rootPage?: number
    rootIndexPage: number
  }>

  expectTypeOf(Link<RouterAlwaysTrailingSlashes, '/posts/', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function>().toEqualTypeOf<{
    rootPage?: number
    rootIndexPage: number
  }>

  expectTypeOf(Link<RouterNeverTrailingSlashes, '/posts', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function>().toEqualTypeOf<{
    rootPage?: number
    rootIndexPage: number
  }>

  expectTypeOf(Link<RouterPreserveTrailingSlashes, '/posts' | '/posts/', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function>().toEqualTypeOf<{
    rootPage?: number
    rootIndexPage: number
  }>

  expectTypeOf(Link<DefaultRouter, '/posts', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{
      rootPage?: number
      rootIndexPage: number
    }>()

  expectTypeOf(Link<DefaultRouterObjects, '/posts', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{
      rootPage?: number
      rootIndexPage: number
    }>()

  expectTypeOf(Link<RouterAlwaysTrailingSlashes, '/posts/', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{
      rootPage?: number
      rootIndexPage: number
    }>()

  expectTypeOf(Link<RouterNeverTrailingSlashes, '/posts', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{
      rootPage?: number
      rootIndexPage: number
    }>()

  expectTypeOf(Link<RouterPreserveTrailingSlashes, '/posts' | '/posts/', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{
      rootPage?: number
      rootIndexPage: number
    }>()

  expectTypeOf(Link<DefaultRouter, '/posts', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{ rootPage?: number }>()

  expectTypeOf(Link<DefaultRouterObjects, '/posts', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{ rootPage?: number }>()

  expectTypeOf(Link<RouterAlwaysTrailingSlashes, '/posts/', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{ rootPage?: number }>()

  expectTypeOf(Link<RouterNeverTrailingSlashes, '/posts', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{ rootPage?: number }>()

  expectTypeOf(Link<RouterPreserveTrailingSlashes, '/posts' | '/posts/', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{ rootPage?: number }>()
})

test('when navigating from a route with no params and no search to the current route', () => {
  expectTypeOf(Link<DefaultRouter, '/posts/', './'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<'./$postId' | undefined | './'>()

  expectTypeOf(Link<DefaultRouterObjects, '/posts/', './'>)
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

  expectTypeOf(Link<DefaultRouter, '/posts/', './'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function>()
    .toEqualTypeOf<{ rootPage?: number } | undefined | true>()

  expectTypeOf(Link<DefaultRouterObjects, '/posts/', './'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function>()
    .toEqualTypeOf<{ rootPage?: number } | undefined | true>()

  expectTypeOf(Link<RouterAlwaysTrailingSlashes, '/posts/', './'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function>()
    .toEqualTypeOf<{ rootPage?: number } | undefined | true>()

  expectTypeOf(Link<RouterNeverTrailingSlashes, '/posts/', './'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function>()
    .toEqualTypeOf<{ rootPage?: number } | undefined | true>()

  expectTypeOf(Link<RouterPreserveTrailingSlashes, '/posts/', './'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function>()
    .toEqualTypeOf<{ rootPage?: number } | undefined | true>()

  expectTypeOf(Link<DefaultRouter, '/posts/', './'>)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{ rootPage?: number }>()

  expectTypeOf(Link<DefaultRouterObjects, '/posts/', './'>)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{ rootPage?: number }>()

  expectTypeOf(Link<RouterAlwaysTrailingSlashes, '/posts/', './'>)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{ rootPage?: number }>()

  expectTypeOf(Link<RouterNeverTrailingSlashes, '/posts/', './'>)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{ rootPage?: number }>()

  expectTypeOf(Link<RouterPreserveTrailingSlashes, '/posts/', './'>)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{ rootPage?: number }>()

  expectTypeOf(Link<DefaultRouter, '/posts/', './'>)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{ rootPage?: number }>()

  expectTypeOf(Link<DefaultRouterObjects, '/posts/', './'>)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{ rootPage?: number }>()

  expectTypeOf(Link<RouterAlwaysTrailingSlashes, '/posts/', './'>)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{ rootPage?: number }>()

  expectTypeOf(Link<RouterNeverTrailingSlashes, '/posts/', './'>)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{ rootPage?: number }>()

  expectTypeOf(Link<RouterPreserveTrailingSlashes, '/posts/', './'>)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{ rootPage?: number }>()
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
      | '../invoices/$invoiceId/details/$detailId/lines'
      | '../invoices'
      | '../'
      | undefined
    >()

  expectTypeOf(Link<DefaultRouterObjects, '/posts', '../'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '../posts'
      | '../posts/$postId'
      | '../invoices/$invoiceId'
      | '../invoices/$invoiceId/edit'
      | '../invoices/$invoiceId/details'
      | '../invoices/$invoiceId/details/$detailId'
      | '../invoices/$invoiceId/details/$detailId/lines'
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
      | '../invoices/$invoiceId/details/$detailId/lines/'
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
      | '../invoices/$invoiceId/details/$detailId/lines'
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
      | '../invoices/$invoiceId/details/$detailId/lines'
      | '../invoices/$invoiceId/details/$detailId/lines/'
      | '../invoices'
      | '../invoices/'
      | '../'
      | undefined
    >()
})

test('cannot navigate to a branch with an index', () => {
  expectTypeOf(Link<DefaultRouter, string, '/invoices/$invoiceId'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '/'
      | '/posts'
      | '/posts/$postId'
      | '/invoices'
      | '/invoices/$invoiceId'
      | '/invoices/$invoiceId/edit'
      | '/invoices/$invoiceId/details'
      | '/invoices/$invoiceId/details/$detailId'
      | '/invoices/$invoiceId/details/$detailId/lines'
      | './'
      | '../'
      | undefined
    >()

  expectTypeOf(Link<DefaultRouterObjects, string, '/invoices/$invoiceId'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '/'
      | '/posts'
      | '/posts/$postId'
      | '/invoices'
      | '/invoices/$invoiceId'
      | '/invoices/$invoiceId/edit'
      | '/invoices/$invoiceId/details'
      | '/invoices/$invoiceId/details/$detailId'
      | '/invoices/$invoiceId/details/$detailId/lines'
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
      | '/posts/'
      | '/posts/$postId/'
      | '/invoices/'
      | '/invoices/$invoiceId/'
      | '/invoices/$invoiceId/edit/'
      | '/invoices/$invoiceId/details/'
      | '/invoices/$invoiceId/details/$detailId/'
      | '/invoices/$invoiceId/details/$detailId/lines/'
      | './'
      | '../'
      | undefined
    >()

  expectTypeOf(Link<RouterNeverTrailingSlashes, string, '/invoices/$invoiceId'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '/'
      | '/posts'
      | '/posts/$postId'
      | '/invoices'
      | '/invoices/$invoiceId'
      | '/invoices/$invoiceId/edit'
      | '/invoices/$invoiceId/details'
      | '/invoices/$invoiceId/details/$detailId'
      | '/invoices/$invoiceId/details/$detailId/lines'
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
      | '/'
      | '/posts'
      | '/posts/'
      | '/posts/$postId'
      | '/posts/$postId/'
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
      | '/invoices/$invoiceId/details/$detailId/lines'
      | '/invoices/$invoiceId/details/$detailId/lines/'
      | './'
      | '../'
      | undefined
    >()
})

test('from autocompletes to all absolute routes', () => {
  const DefaultRouterLink = Link<DefaultRouter, '/', '/'>
  const DefaultRouterObjectsLink = Link<DefaultRouterObjects, '/', '/'>

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('from')
    .toEqualTypeOf<
      | '/'
      | '/posts/$postId'
      | '/posts/'
      | '/posts'
      | '/invoices'
      | '/invoices/'
      | '/invoices/$invoiceId'
      | '/invoices/$invoiceId/edit'
      | '/invoices/$invoiceId/details'
      | '/invoices/$invoiceId/details/$detailId'
      | '/invoices/$invoiceId/details/$detailId/lines'
      | undefined
    >()

  expectTypeOf(DefaultRouterObjectsLink)
    .parameter(0)
    .toHaveProperty('from')
    .toEqualTypeOf<
      | '/'
      | '/posts/$postId'
      | '/posts/'
      | '/posts'
      | '/invoices'
      | '/invoices/'
      | '/invoices/$invoiceId'
      | '/invoices/$invoiceId/edit'
      | '/invoices/$invoiceId/details'
      | '/invoices/$invoiceId/details/$detailId'
      | '/invoices/$invoiceId/details/$detailId/lines'
      | undefined
    >()
})

test('from does not allow invalid routes', () => {
  const DefaultRouterLink = Link<DefaultRouter, '/invalid', '/'>
  const DefaultRouterObjectsLink = Link<DefaultRouterObjects, '/invalid', '/'>

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('from')
    .toEqualTypeOf<
      | '/'
      | '/posts/$postId'
      | '/posts/'
      | '/posts'
      | '/invoices'
      | '/invoices/'
      | '/invoices/$invoiceId'
      | '/invoices/$invoiceId/edit'
      | '/invoices/$invoiceId/details'
      | '/invoices/$invoiceId/details/$detailId'
      | '/invoices/$invoiceId/details/$detailId/lines'
      | undefined
    >()

  expectTypeOf(DefaultRouterObjectsLink)
    .parameter(0)
    .toHaveProperty('from')
    .toEqualTypeOf<
      | '/'
      | '/posts/$postId'
      | '/posts/'
      | '/posts'
      | '/invoices'
      | '/invoices/'
      | '/invoices/$invoiceId'
      | '/invoices/$invoiceId/edit'
      | '/invoices/$invoiceId/details'
      | '/invoices/$invoiceId/details/$detailId'
      | '/invoices/$invoiceId/details/$detailId/lines'
      | undefined
    >()
})

test('when navigating to the same route', () => {
  const DefaultRouterLink = Link<DefaultRouter, string, string>
  const DefaultRouterObjectsLink = Link<DefaultRouterObjects, string, string>
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

  expectTypeOf(DefaultRouterObjectsLink)
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

  expectTypeOf(DefaultRouterObjectsLink)
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

  expectTypeOf(DefaultRouterObjectsLink)
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

  expectTypeOf(DefaultRouterObjectsLink)
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
  const DefaultRouterObjectsLink = Link<DefaultRouterObjects, string, '..'>

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

  expectTypeOf(DefaultRouterObjectsLink)
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

  expectTypeOf(DefaultRouterObjectsLink)
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

  expectTypeOf(DefaultRouterObjectsLink)
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

  expectTypeOf(DefaultRouterObjectsLink)
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
  const DefaultRouterObjectsLink = Link<
    DefaultRouterObjects,
    '/posts/$postId',
    string
  >

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

  expectTypeOf(DefaultRouterObjectsLink)
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

  expectTypeOf(DefaultRouterObjectsLink)
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

  const DefaultRouterObjectsLink = Link<
    DefaultRouterObjects,
    string,
    '/posts/$postId'
  >

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

  expectTypeOf(DefaultRouterObjectsLink)
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

  const defaultRouterObjectsLinkParams = expectTypeOf(DefaultRouterObjectsLink)
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

  defaultRouterObjectsLinkParams
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

  defaultRouterObjectsLinkParams.returns.toEqualTypeOf<{ postId: string }>()

  routerAlwaysTrailingSlashesLinkParams.returns.toEqualTypeOf<{
    postId: string
  }>()

  routerNeverTrailingSlashesLinkParams.returns.toEqualTypeOf<{
    postId: string
  }>()

  routerPreserveTrailingSlashesLinkParams.returns.toEqualTypeOf<{
    postId: string
  }>()

  defaultRouterLinkParams.parameter(0).toEqualTypeOf<{
    invoiceId?: string
    postId?: string
    detailId?: string
  }>()

  defaultRouterObjectsLinkParams.parameter(0).toEqualTypeOf<{
    invoiceId?: string
    postId?: string
    detailId?: string
  }>()

  routerAlwaysTrailingSlashesLinkParams.parameter(0).toEqualTypeOf<{
    invoiceId?: string
    postId?: string
    detailId?: string
  }>()

  routerNeverTrailingSlashesLinkParams.parameter(0).toEqualTypeOf<{
    invoiceId?: string
    postId?: string
    detailId?: string
  }>()

  routerPreserveTrailingSlashesLinkParams.parameter(0).toEqualTypeOf<{
    invoiceId?: string
    postId?: string
    detailId?: string
  }>()
})

test('when navigating from a route with no params to a route with params', () => {
  const DefaultRouterLink = Link<
    DefaultRouter,
    '/invoices',
    './$invoiceId/edit'
  >

  const DefaultRouterObjectsLink = Link<
    DefaultRouterObjects,
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

  expectTypeOf(DefaultRouterObjectsLink)
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

  const defaultRouterObjectsLinkParams = expectTypeOf(DefaultRouterLink)
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

  defaultRouterObjectsLinkParams
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

  defaultRouterObjectsLinkParams.returns.toEqualTypeOf<{ invoiceId: string }>()

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

  defaultRouterObjectsLinkParams.parameter(0).toEqualTypeOf<{}>()

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

  const DefaultRouterObjectsLink = Link<
    DefaultRouterObjects,
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

  const defaultRouterObjectsLinkParams = expectTypeOf(DefaultRouterLink)
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

  expectTypeOf(DefaultRouterObjectsLink)
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

  defaultRouterObjectsLinkParams
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

  defaultRouterObjectsLinkParams.returns.toEqualTypeOf<{
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

  defaultRouterObjectsLinkParams
    .parameter(0)
    .toEqualTypeOf<{ invoiceId: string }>()

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

  const DefaultRouterObjectsLink = Link<
    DefaultRouterObjects,
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

  const defaultRouterObjectsLinkParams = expectTypeOf(DefaultRouterLink)
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

  expectTypeOf(DefaultRouterObjectsLink)
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

  defaultRouterObjectsLinkParams
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

  defaultRouterObjectsLinkParams.returns.toEqualTypeOf<{ postId: string }>()

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

  defaultRouterObjectsLinkParams
    .parameter(0)
    .toEqualTypeOf<{ invoiceId: string }>()

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

  const DefaultRouterObjectsLink = Link<
    DefaultRouterObjects,
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

  const defaultRouterObjectsLinkParams = expectTypeOf(DefaultRouterObjectsLink)
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

  expectTypeOf(DefaultRouterObjectsLink)
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

  defaultRouterObjectsLinkParams
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

  defaultRouterObjectsLinkParams.returns.toEqualTypeOf<{
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

  const DefaultRouterObjectsLink = Link<
    DefaultRouterObjects,
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

  const defaultRouterObjectsLinkParams = expectTypeOf(DefaultRouterLink)
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

  expectTypeOf(DefaultRouterObjectsLink)
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
    .toEqualTypeOf<{ invoiceId: string } | { postId: string }>()

  defaultRouterObjectsLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId: string } | { postId: string }>()

  routerAlwaysTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId: string } | { postId: string }>()

  routerNeverTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId: string } | { postId: string }>()

  routerPreserveTrailingSlashesLinkParams
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ invoiceId: string } | { postId: string }>()

  defaultRouterLinkParams.returns.toEqualTypeOf<
    { invoiceId: string } | { postId: string }
  >()

  defaultRouterObjectsLinkParams.returns.toEqualTypeOf<
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

  defaultRouterLinkParams.parameter(0).toEqualTypeOf<{
    invoiceId?: string
    postId?: string
    detailId?: string
  }>()

  defaultRouterObjectsLinkParams.parameter(0).toEqualTypeOf<{
    invoiceId?: string
    postId?: string
    detailId?: string
  }>()

  routerAlwaysTrailingSlashesLinkParams.parameter(0).toEqualTypeOf<{
    invoiceId?: string
    postId?: string
    detailId?: string
  }>()

  routerNeverTrailingSlashesLinkParams.parameter(0).toEqualTypeOf<{
    invoiceId?: string
    postId?: string
    detailId?: string
  }>()

  routerPreserveTrailingSlashesLinkParams.parameter(0).toEqualTypeOf<{
    invoiceId?: string
    postId?: string
    detailId?: string
  }>()
})

test('when navigating to a union of routes including the root', () => {
  const DefaultRouterLink = Link<
    DefaultRouter,
    string,
    '/' | '/invoices/$invoiceId/edit' | '/posts/$postId'
  >

  const DefaultRouterObjectsLink = Link<
    DefaultRouterObjects,
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

  const defaultRouterObjectsLinkParams = expectTypeOf(DefaultRouterLink)
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

  expectTypeOf(DefaultRouterObjectsLink)
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

  defaultRouterObjectsLinkParams
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

  defaultRouterObjectsLinkParams.returns.toEqualTypeOf<
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

  defaultRouterLinkParams.parameter(0).toEqualTypeOf<{
    invoiceId?: string
    postId?: string
    detailId?: string
  }>()

  defaultRouterObjectsLinkParams.parameter(0).toEqualTypeOf<{
    invoiceId?: string
    postId?: string
    detailId?: string
  }>()

  routerAlwaysTrailingSlashesLinkParams.parameter(0).toEqualTypeOf<{
    invoiceId?: string
    postId?: string
    detailId?: string
  }>()

  routerNeverTrailingSlashesLinkParams.parameter(0).toEqualTypeOf<{
    invoiceId?: string
    postId?: string
    detailId?: string
  }>()

  routerPreserveTrailingSlashesLinkParams.parameter(0).toEqualTypeOf<{
    invoiceId?: string
    postId?: string
    detailId?: string
  }>()
})

test('when navigating from a route with search params to the same route', () => {
  const DefaultRouterLink = Link<DefaultRouter, '/invoices/$invoiceId', string>

  const DefaultRouterObjectsLink = Link<
    DefaultRouterObjects,
    '/invoices/$invoiceId',
    string
  >

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

  expectTypeOf(DefaultRouterObjectsLink)
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

  expectTypeOf(DefaultRouterObjectsLink)
    .parameter(0)
    .toMatchTypeOf<{ search: unknown }>()

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

  const DefaultRouterObjectsLink = Link<
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

  const defaultRouterObjectsLinkSearch = expectTypeOf(DefaultRouterLink)
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

  expectTypeOf(DefaultRouterObjectsLink)
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
    .toEqualTypeOf<{ rootPage?: number; page: number }>()

  defaultRouterObjectsLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ rootPage?: number; page: number }>()

  routerAlwaysTrailingSlashesLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ rootPage?: number; page: number }>()

  routerNeverTrailingSlashesLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ rootPage?: number; page: number }>()

  routerPreserveTrailingSlashesLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ rootPage?: number; page: number }>()

  defaultRouterLinkSearch.returns.toEqualTypeOf<{
    page: number
    rootPage?: number
  }>()

  defaultRouterObjectsLinkSearch.returns.toEqualTypeOf<{
    page: number
    rootPage?: number
  }>()

  routerAlwaysTrailingSlashesLinkSearch.returns.toEqualTypeOf<{
    page: number
    rootPage?: number
  }>()

  routerNeverTrailingSlashesLinkSearch.returns.toEqualTypeOf<{
    rootPage?: number
    page: number
  }>()

  routerPreserveTrailingSlashesLinkSearch.returns.toEqualTypeOf<{
    page: number
    rootPage?: number
  }>()

  defaultRouterLinkSearch.parameter(0).toEqualTypeOf<{
    page?: number
    rootIndexPage?: number
    rootPage?: number
    linesPage?: number
  }>()

  defaultRouterObjectsLinkSearch.parameter(0).toEqualTypeOf<{
    page?: number
    rootIndexPage?: number
    rootPage?: number
    linesPage?: number
  }>()

  routerAlwaysTrailingSlashesLinkSearch.parameter(0).toEqualTypeOf<{
    page?: number
    rootIndexPage?: number
    rootPage?: number
    linesPage?: number
  }>()

  routerNeverTrailingSlashesLinkSearch.parameter(0).toEqualTypeOf<{
    page?: number
    rootIndexPage?: number
    rootPage?: number
    linesPage?: number
  }>()

  routerPreserveTrailingSlashesLinkSearch.parameter(0).toEqualTypeOf<{
    page?: number
    rootIndexPage?: number
    rootPage?: number
    linesPage?: number
  }>()
})

test('when navigating to a route with optional search params', () => {
  const DefaultRouterLink = Link<
    DefaultRouter,
    string,
    '/invoices/$invoiceId/details/$detailId'
  >

  const DefaultRouterObjectsLink = Link<
    DefaultRouterObjects,
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

  const defaultRouterObjectsLinkSearch = expectTypeOf(DefaultRouterObjectsLink)
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

  expectTypeOf(DefaultRouterObjectsLink)
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

  defaultRouterLinkSearch.exclude<Function | boolean>().toEqualTypeOf<
    | {
        rootPage?: number
        page?: number
      }
    | undefined
  >()

  defaultRouterObjectsLinkSearch.exclude<Function | boolean>().toEqualTypeOf<
    | {
        rootPage?: number
        page?: number
      }
    | undefined
  >()

  routerAlwaysTrailingSlashesLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<
      | {
          rootPage?: number
          page?: number
        }
      | undefined
    >()

  routerNeverTrailingSlashesLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<
      | {
          rootPage?: number
          page?: number
        }
      | undefined
    >()

  routerPreserveTrailingSlashesLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<
      | {
          rootPage?: number
          page?: number
        }
      | undefined
    >()

  defaultRouterLinkSearch.returns.toEqualTypeOf<{
    rootPage?: number
    page?: number
  }>()

  defaultRouterObjectsLinkSearch.returns.toEqualTypeOf<{
    rootPage?: number
    page?: number
  }>()

  routerAlwaysTrailingSlashesLinkSearch.returns.toEqualTypeOf<{
    rootPage?: number
    page?: number
  }>()

  routerNeverTrailingSlashesLinkSearch.returns.toEqualTypeOf<{
    rootPage?: number
    page?: number
  }>()

  routerPreserveTrailingSlashesLinkSearch.returns.toEqualTypeOf<{
    rootPage?: number
    page?: number
  }>()

  defaultRouterLinkSearch.parameter(0).toEqualTypeOf<{
    page?: number
    rootIndexPage?: number
    rootPage?: number
    linesPage?: number
  }>()

  defaultRouterObjectsLinkSearch.parameter(0).toEqualTypeOf<{
    page?: number
    rootIndexPage?: number
    rootPage?: number
    linesPage?: number
  }>()

  routerAlwaysTrailingSlashesLinkSearch.parameter(0).toEqualTypeOf<{
    page?: number
    rootIndexPage?: number
    rootPage?: number
    linesPage?: number
  }>()

  routerNeverTrailingSlashesLinkSearch.parameter(0).toEqualTypeOf<{
    page?: number
    rootIndexPage?: number
    rootPage?: number
    linesPage?: number
  }>()

  routerPreserveTrailingSlashesLinkSearch.parameter(0).toEqualTypeOf<{
    page?: number
    rootIndexPage?: number
    rootPage?: number
    linesPage?: number
  }>()
})

test('when navigating from a route with no search params to a route with search params', () => {
  const DefaultRouterLink = Link<
    DefaultRouter,
    '/invoices/',
    './$invoiceId/edit'
  >

  const DefaultRouterObjectsLink = Link<
    DefaultRouterObjects,
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

  const defaultRouterObjectsLinkSearch = expectTypeOf(DefaultRouterLink)
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

  expectTypeOf(DefaultRouterObjectsLink)
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

  defaultRouterLinkSearch.exclude<Function | boolean>().toEqualTypeOf<{
    rootPage?: number
    page: number
  }>()

  defaultRouterObjectsLinkSearch.exclude<Function | boolean>().toEqualTypeOf<{
    rootPage?: number
    page: number
  }>()

  routerAlwaysTrailingSlashesLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{
      rootPage?: number
      page: number
    }>()

  routerNeverTrailingSlashesLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<{
      rootPage?: number
      page: number
    }>()

  defaultRouterLinkSearch.returns.toEqualTypeOf<{
    rootPage?: number
    page: number
  }>()

  defaultRouterObjectsLinkSearch.returns.toEqualTypeOf<{
    rootPage?: number
    page: number
  }>()

  routerAlwaysTrailingSlashesLinkSearch.returns.toEqualTypeOf<{
    rootPage?: number
    page: number
  }>()

  routerNeverTrailingSlashesLinkSearch.returns.toEqualTypeOf<{
    rootPage?: number
    page: number
  }>()

  routerPreserveTrailingSlashesLinkSearch.returns.toEqualTypeOf<{
    rootPage?: number
    page: number
  }>()

  defaultRouterLinkSearch.parameter(0).toEqualTypeOf<{ rootPage?: number }>()

  defaultRouterObjectsLinkSearch
    .parameter(0)
    .toEqualTypeOf<{ rootPage?: number }>()

  routerAlwaysTrailingSlashesLinkSearch
    .parameter(0)
    .toEqualTypeOf<{ rootPage?: number }>()

  routerNeverTrailingSlashesLinkSearch
    .parameter(0)
    .toEqualTypeOf<{ rootPage?: number }>()

  routerPreserveTrailingSlashesLinkSearch
    .parameter(0)
    .toEqualTypeOf<{ rootPage?: number }>()
})

test('when navigating to a union of routes with search params', () => {
  const DefaultRouterLink = Link<
    DefaultRouter,
    string,
    '/invoices/$invoiceId/edit' | '/posts/$postId'
  >

  const DefaultRouterObjectsLink = Link<
    DefaultRouterObjects,
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

  const defaultRouterObjectsLinkSearch = expectTypeOf(DefaultRouterLink)
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

  expectTypeOf(DefaultRouterObjectsLink)
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
    .toEqualTypeOf<
      { rootPage?: number; page: number } | { rootPage?: number } | undefined
    >()

  defaultRouterObjectsLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<
      { rootPage?: number; page: number } | { rootPage?: number } | undefined
    >()

  routerAlwaysTrailingSlashesSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<
      { rootPage?: number; page: number } | { rootPage?: number } | undefined
    >()

  routerNeverTrailingSlashesSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<
      { rootPage?: number; page: number } | { rootPage?: number } | undefined
    >()

  routerPreserveTrailingSlashesSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<
      { rootPage?: number; page: number } | { rootPage?: number } | undefined
    >()

  defaultRouterLinkSearch.returns.toEqualTypeOf<
    { rootPage?: number; page: number } | { rootPage?: number }
  >()

  defaultRouterObjectsLinkSearch.returns.toEqualTypeOf<
    { rootPage?: number; page: number } | { rootPage?: number }
  >()

  routerAlwaysTrailingSlashesSearch.returns.toEqualTypeOf<
    { rootPage?: number; page: number } | { rootPage?: number }
  >()

  routerNeverTrailingSlashesSearch.returns.toEqualTypeOf<
    { rootPage?: number; page: number } | { rootPage?: number }
  >()

  routerPreserveTrailingSlashesSearch.returns.toEqualTypeOf<
    { rootPage?: number; page: number } | { rootPage?: number }
  >()

  defaultRouterLinkSearch.parameter(0).toEqualTypeOf<{
    page?: number
    rootIndexPage?: number
    rootPage?: number
    linesPage?: number
  }>()

  defaultRouterObjectsLinkSearch.parameter(0).toEqualTypeOf<{
    page?: number
    rootIndexPage?: number
    rootPage?: number
    linesPage?: number
  }>()

  routerAlwaysTrailingSlashesSearch.parameter(0).toEqualTypeOf<{
    page?: number
    rootIndexPage?: number
    rootPage?: number
    linesPage?: number
  }>()

  routerNeverTrailingSlashesSearch.parameter(0).toEqualTypeOf<{
    page?: number
    rootIndexPage?: number
    rootPage?: number
    linesPage?: number
  }>()

  routerPreserveTrailingSlashesSearch.parameter(0).toEqualTypeOf<{
    page?: number
    rootIndexPage?: number
    rootPage?: number
    linesPage?: number
  }>()
})

test('when navigating to a union of routes with search params including the root', () => {
  const DefaultRouterLink = Link<
    DefaultRouter,
    string,
    '/' | '/invoices/$invoiceId/edit' | '/posts/$postId'
  >

  const DefaultRouterObjectsLink = Link<
    DefaultRouterObjects,
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

  const defaultRouterObjectsSearch = expectTypeOf(DefaultRouterLink)
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

  expectTypeOf(DefaultRouterObjectsLink)
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
    .toEqualTypeOf<
      | { rootPage?: number }
      | { rootPage?: number; page: number }
      | { rootPage?: number; rootIndexPage: number }
      | undefined
    >()

  defaultRouterObjectsSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<
      | { rootPage?: number }
      | { rootPage?: number; page: number }
      | { rootPage?: number; rootIndexPage: number }
      | undefined
    >()

  routerAlwaysTrailingSlashesLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<
      | { rootPage?: number }
      | { rootPage?: number; page: number }
      | { rootPage?: number; rootIndexPage: number }
      | undefined
    >()

  routerNeverTrailingSlashesLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<
      | { rootPage?: number }
      | { rootPage?: number; page: number }
      | { rootPage?: number; rootIndexPage: number }
      | undefined
    >()

  routerPreserveTrailingSlashesLinkSearch
    .exclude<Function | boolean>()
    .toEqualTypeOf<
      | { rootPage?: number }
      | { rootPage?: number; page: number }
      | { rootPage?: number; rootIndexPage: number }
      | undefined
    >()

  defaultRouterSearch.returns.toEqualTypeOf<
    | { rootPage?: number; page: number }
    | { rootPage?: number; rootIndexPage: number }
    | { rootPage?: number }
  >()

  defaultRouterObjectsSearch.returns.toEqualTypeOf<
    | { rootPage?: number; page: number }
    | { rootPage?: number; rootIndexPage: number }
    | { rootPage?: number }
  >()

  routerAlwaysTrailingSlashesLinkSearch.returns.toEqualTypeOf<
    | { rootPage?: number; page: number }
    | { rootPage?: number; rootIndexPage: number }
    | { rootPage?: number }
  >()

  routerNeverTrailingSlashesLinkSearch.returns.toEqualTypeOf<
    | { rootPage?: number; page: number }
    | { rootPage?: number; rootIndexPage: number }
    | { rootPage?: number }
  >()

  routerPreserveTrailingSlashesLinkSearch.returns.toEqualTypeOf<
    | { rootPage?: number; page: number }
    | { rootPage?: number; rootIndexPage: number }
    | { rootPage?: number }
  >()

  defaultRouterSearch.parameter(0).toEqualTypeOf<{
    page?: number
    rootIndexPage?: number
    rootPage?: number
    linesPage?: number
  }>()

  defaultRouterObjectsSearch.parameter(0).toEqualTypeOf<{
    page?: number
    rootIndexPage?: number
    rootPage?: number
    linesPage?: number
  }>()

  routerAlwaysTrailingSlashesLinkSearch.parameter(0).toEqualTypeOf<{
    page?: number
    rootIndexPage?: number
    rootPage?: number
    linesPage?: number
  }>()

  routerNeverTrailingSlashesLinkSearch.parameter(0).toEqualTypeOf<{
    page?: number
    rootIndexPage?: number
    rootPage?: number
    linesPage?: number
  }>()

  routerPreserveTrailingSlashesLinkSearch.parameter(0).toEqualTypeOf<{
    page?: number
    rootIndexPage?: number
    rootPage?: number
    linesPage?: number
  }>()
})

test('when navigating from the root to /posts', () => {
  const DefaultRouterLink = Link<DefaultRouter, '/', '/posts'>

  const DefaultRouterObjectsLink = Link<DefaultRouterObjects, '/', '/posts'>

  const RouterAlwaysTrailingSlashesLink = Link<
    RouterAlwaysTrailingSlashes,
    '/',
    '/posts/'
  >

  const RouterNeverTrailingSlashesLink = Link<
    RouterNeverTrailingSlashes,
    '/',
    '/posts'
  >

  const RouterPreserveTrailingSlashesLink = Link<
    RouterPreserveTrailingSlashes,
    '/',
    '/posts' | '/posts/'
  >

  expectTypeOf(DefaultRouterLink).not.toMatchTypeOf<{ search: unknown }>()

  expectTypeOf(DefaultRouterObjectsLink).not.toMatchTypeOf<{
    search: unknown
  }>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink).not.toMatchTypeOf<{
    search: unknown
  }>()

  expectTypeOf(RouterNeverTrailingSlashesLink).not.toMatchTypeOf<{
    search: unknown
  }>()

  expectTypeOf(RouterPreserveTrailingSlashesLink).not.toMatchTypeOf<{
    search: unknown
  }>()

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ rootPage?: number } | undefined>()

  expectTypeOf(DefaultRouterObjectsLink)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ rootPage?: number } | undefined>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ rootPage?: number } | undefined>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ rootPage?: number } | undefined>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ rootPage?: number } | undefined>()

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<
      { rootPage?: number } | { rootPage?: number; rootIndexPage: number }
    >()

  expectTypeOf(DefaultRouterObjectsLink)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<
      { rootPage?: number } | { rootPage?: number; rootIndexPage: number }
    >()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<
      { rootPage?: number } | { rootPage?: number; rootIndexPage: number }
    >()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<
      { rootPage?: number } | { rootPage?: number; rootIndexPage: number }
    >()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<
      { rootPage?: number } | { rootPage?: number; rootIndexPage: number }
    >()

  expectTypeOf(DefaultRouterLink)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{ rootPage?: number }>()

  expectTypeOf(DefaultRouterObjectsLink)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{ rootPage?: number }>()

  expectTypeOf(RouterAlwaysTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{ rootPage?: number }>()

  expectTypeOf(RouterNeverTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{ rootPage?: number }>()

  expectTypeOf(RouterPreserveTrailingSlashesLink)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{ rootPage?: number }>()
})

test('when navigating to a route with SearchSchemaInput', () => {
  expectTypeOf(
    Link<
      DefaultRouter,
      '/invoices/$invoiceId/details/$detailId/lines',
      '/invoices/$invoiceId/details/$detailId/lines'
    >,
  )
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function | true>()
    .toEqualTypeOf<
      { rootPage?: number; page?: number; linesPage?: number } | undefined
    >()

  expectTypeOf(
    Link<
      DefaultRouterObjects,
      '/invoices/$invoiceId/details/$detailId/lines',
      '/invoices/$invoiceId/details/$detailId/lines'
    >,
  )
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function | true>()
    .toEqualTypeOf<
      { rootPage?: number; page?: number; linesPage?: number } | undefined
    >()

  expectTypeOf(
    Link<
      RouterAlwaysTrailingSlashes,
      '/invoices/$invoiceId/details/$detailId/lines',
      '/invoices/$invoiceId/details/$detailId/lines/'
    >,
  )
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function | true>()
    .toEqualTypeOf<
      { rootPage?: number; page?: number; linesPage?: number } | undefined
    >()

  expectTypeOf(
    Link<
      RouterNeverTrailingSlashes,
      '/invoices/$invoiceId/details/$detailId/lines',
      '/invoices/$invoiceId/details/$detailId/lines'
    >,
  )
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function | true>()
    .toEqualTypeOf<
      { rootPage?: number; page?: number; linesPage?: number } | undefined
    >()

  expectTypeOf(
    Link<
      RouterPreserveTrailingSlashes,
      '/invoices/$invoiceId/details/$detailId/lines',
      | '/invoices/$invoiceId/details/$detailId/lines/'
      | '/invoices/$invoiceId/details/$detailId/lines'
    >,
  )
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function | true>()
    .toEqualTypeOf<
      { rootPage?: number; page?: number; linesPage?: number } | undefined
    >()

  expectTypeOf(
    Link<DefaultRouter, string, '/invoices/$invoiceId/details/$detailId/lines'>,
  )
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{
      rootPage?: number
      page?: number
      linesPage?: number
    }>()

  expectTypeOf(
    Link<
      DefaultRouterObjects,
      '/invoices/$invoiceId/details/$detailId/lines',
      '/invoices/$invoiceId/details/$detailId/lines'
    >,
  )
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{
      rootPage?: number
      page?: number
      linesPage?: number
    }>()

  expectTypeOf(
    Link<
      RouterAlwaysTrailingSlashes,
      '/invoices/$invoiceId/details/$detailId/lines',
      '/invoices/$invoiceId/details/$detailId/lines/'
    >,
  )
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{
      rootPage?: number
      page?: number
      linesPage?: number
    }>()

  expectTypeOf(
    Link<
      RouterNeverTrailingSlashes,
      '/invoices/$invoiceId/details/$detailId/lines',
      '/invoices/$invoiceId/details/$detailId/lines'
    >,
  )
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{
      rootPage?: number
      page?: number
      linesPage?: number
    }>()

  expectTypeOf(
    Link<
      RouterPreserveTrailingSlashes,
      '/invoices/$invoiceId/details/$detailId/lines',
      | '/invoices/$invoiceId/details/$detailId/lines/'
      | '/invoices/$invoiceId/details/$detailId/lines'
    >,
  )
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{
      rootPage?: number
      page?: number
      linesPage?: number
    }>()

  expectTypeOf(
    Link<
      DefaultRouter,
      '/invoices/$invoiceId/details/$detailId/lines',
      '/invoices/$invoiceId/details/$detailId/lines'
    >,
  )
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{ rootPage?: number; page?: number; linesPage: number }>()

  expectTypeOf(
    Link<
      DefaultRouterObjects,
      '/invoices/$invoiceId/details/$detailId/lines',
      '/invoices/$invoiceId/details/$detailId/lines'
    >,
  )
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{ rootPage?: number; page?: number; linesPage: number }>()

  expectTypeOf(
    Link<
      RouterAlwaysTrailingSlashes,
      '/invoices/$invoiceId/details/$detailId/lines',
      '/invoices/$invoiceId/details/$detailId/lines/'
    >,
  )
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{ rootPage?: number; page?: number; linesPage: number }>()

  expectTypeOf(
    Link<
      RouterNeverTrailingSlashes,
      '/invoices/$invoiceId/details/$detailId/lines',
      '/invoices/$invoiceId/details/$detailId/lines/'
    >,
  )
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{ rootPage?: number; page?: number; linesPage: number }>()

  expectTypeOf(
    Link<
      RouterPreserveTrailingSlashes,
      '/invoices/$invoiceId/details/$detailId/lines',
      | '/invoices/$invoiceId/details/$detailId/lines/'
      | '/invoices/$invoiceId/details/$detailId/lines'
    >,
  )
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{ rootPage?: number; page?: number; linesPage: number }>()
})
