import { expectTypeOf, test } from 'vitest'
import {
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  injectRouterContext,
} from '../src'
import type * as Angular from '@angular/core'

test('when there is no context', () => {
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

  const routeTree = rootRoute.addChildren([
    invoicesRoute.addChildren([invoicesIndexRoute]),
    indexRoute,
  ])

  const _defaultRouter = createRouter({
    routeTree,
  })

  type DefaultRouter = typeof _defaultRouter

  expectTypeOf(injectRouterContext<DefaultRouter>)
    .parameter(0)
    .toHaveProperty('from')
    .toExtend<'/invoices' | '__root__' | '/invoices/' | '/' | undefined>()

  expectTypeOf(injectRouterContext<DefaultRouter>)
    .parameter(0)
    .toHaveProperty('strict')
    .toEqualTypeOf<true | undefined>()

  expectTypeOf(injectRouterContext<DefaultRouter, '/'>)
    .parameter(0)
    .toHaveProperty('select')
    .parameter(0)
    .toEqualTypeOf<{}>()

  expectTypeOf(injectRouterContext<DefaultRouter, '/'>)
    .parameter(0)
    .toHaveProperty('select')
    .returns.toEqualTypeOf<unknown>()

  expectTypeOf(injectRouterContext<DefaultRouter, '/'>).returns.toEqualTypeOf<
    Angular.Signal<{}>
  >()

  expectTypeOf(
    injectRouterContext<DefaultRouter, '/', false>({
      strict: false,
    }),
  ).toEqualTypeOf<Angular.Signal<{}>>()
})

test('when there is the root context', () => {
  interface Context {
    userId: string
  }

  const rootRoute = createRootRouteWithContext<Context>()()

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
    context: { userId: 'userId' },
  })

  type DefaultRouter = typeof _defaultRouter

  expectTypeOf(injectRouterContext<DefaultRouter, '/'>).returns.toEqualTypeOf<
    Angular.Signal<{
      userId: string
    }>
  >()

  expectTypeOf(
    injectRouterContext<DefaultRouter, '/invoices/$invoiceId'>,
  ).returns.toEqualTypeOf<Angular.Signal<{ userId: string }>>()

  expectTypeOf(injectRouterContext<DefaultRouter, '/invoices/$invoiceId'>)
    .parameter(0)
    .toHaveProperty('select')
    .toEqualTypeOf<((search: { userId: string }) => unknown) | undefined>()

  expectTypeOf(
    injectRouterContext<DefaultRouter, '/invoices', false>,
  ).returns.toEqualTypeOf<Angular.Signal<{ userId?: string }>>()

  expectTypeOf(injectRouterContext<DefaultRouter, '/invoices', false>)
    .parameter(0)
    .toHaveProperty('select')
    .toEqualTypeOf<((search: { userId?: string }) => unknown) | undefined>()

  expectTypeOf(
    injectRouterContext<DefaultRouter, '/invoices', false, number>,
  ).returns.toEqualTypeOf<Angular.Signal<number>>()
})

test('when there are multiple contexts', () => {
  interface Context {
    userId: string
  }

  const rootRoute = createRootRouteWithContext<Context>()()

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

  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'posts',
  })

  const postRoute = createRoute({
    getParentRoute: () => postsRoute,
    path: '$postId',
    beforeLoad: () => ({ username: 'username' }),
  })

  const routeTree = rootRoute.addChildren([
    invoicesRoute.addChildren([
      invoicesIndexRoute,
      invoiceRoute,
      postsRoute.addChildren([postRoute]),
    ]),
    indexRoute,
  ])

  const _defaultRouter = createRouter({
    routeTree,
    context: { userId: 'userId' },
  })

  type DefaultRouter = typeof _defaultRouter

  expectTypeOf(injectRouterContext<DefaultRouter, '/'>).returns.toEqualTypeOf<
    Angular.Signal<{
      userId: string
    }>
  >()

  expectTypeOf(
    injectRouterContext<DefaultRouter, '/invoices/$invoiceId'>,
  ).returns.toEqualTypeOf<Angular.Signal<{ userId: string }>>()

  expectTypeOf(injectRouterContext<DefaultRouter, '/invoices/$invoiceId'>)
    .parameter(0)
    .toHaveProperty('select')
    .toEqualTypeOf<((search: { userId: string }) => unknown) | undefined>()

  expectTypeOf(
    injectRouterContext<DefaultRouter, '/invoices', false>,
  ).returns.toEqualTypeOf<
    Angular.Signal<{ userId?: string; username?: string }>
  >()

  expectTypeOf(injectRouterContext<DefaultRouter, '/invoices', false>)
    .parameter(0)
    .toHaveProperty('select')
    .toEqualTypeOf<
      ((search: { userId?: string; username?: string }) => unknown) | undefined
    >()
})

test('when there are overlapping contexts', () => {
  interface Context {
    userId: string
  }

  const rootRoute = createRootRouteWithContext<Context>()()

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
    beforeLoad: () => ({ username: 'username2' }) as const,
  })

  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'posts',
  })

  const postRoute = createRoute({
    getParentRoute: () => postsRoute,
    path: '$postId',
    beforeLoad: () => ({ username: 'username1' }) as const,
  })

  const routeTree = rootRoute.addChildren([
    invoicesRoute.addChildren([
      invoicesIndexRoute,
      invoiceRoute,
      postsRoute.addChildren([postRoute]),
    ]),
    indexRoute,
  ])

  const _defaultRouter = createRouter({
    routeTree,
    context: { userId: 'userId' },
  })

  type DefaultRouter = typeof _defaultRouter

  expectTypeOf(injectRouterContext<DefaultRouter, '/'>).returns.toEqualTypeOf<
    Angular.Signal<{
      userId: string
    }>
  >

  expectTypeOf(
    injectRouterContext<DefaultRouter, '/invoices/$invoiceId'>,
  ).returns.toEqualTypeOf<
    Angular.Signal<{
      userId: string
      readonly username: 'username2'
    }>
  >()

  expectTypeOf(injectRouterContext<DefaultRouter, '/invoices/$invoiceId'>)
    .parameter(0)
    .toHaveProperty('select')
    .toEqualTypeOf<
      | ((search: {
        userId: string
        readonly username: 'username2'
      }) => unknown)
      | undefined
    >()

  expectTypeOf(
    injectRouterContext<DefaultRouter, '/invoices', false>,
  ).returns.toEqualTypeOf<
    Angular.Signal<{
      userId?: string
      username?: 'username1' | 'username2'
    }>
  >()

  expectTypeOf(injectRouterContext<DefaultRouter, '/invoices', false>)
    .parameter(0)
    .toHaveProperty('select')
    .toEqualTypeOf<
      | ((search: {
        userId?: string
        username?: 'username2' | 'username1'
      }) => unknown)
      | undefined
    >()
})


