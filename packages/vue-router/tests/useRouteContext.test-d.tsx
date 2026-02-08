import { expectTypeOf, test } from 'vitest'
import {
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  useRouteContext,
} from '../src'
import type * as Vue from 'vue'

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

  const defaultRouter = createRouter({
    routeTree,
  })

  type DefaultRouter = typeof defaultRouter

  expectTypeOf(useRouteContext<DefaultRouter>)
    .parameter(0)
    .toHaveProperty('from')
    .toEqualTypeOf<'/invoices' | '__root__' | '/invoices/' | '/'>()

  expectTypeOf(useRouteContext<DefaultRouter>)
    .parameter(0)
    .toHaveProperty('strict')
    .toEqualTypeOf<true | undefined>()

  expectTypeOf(useRouteContext<DefaultRouter, '/'>)
    .parameter(0)
    .toHaveProperty('select')
    .parameter(0)
    .toEqualTypeOf<{}>()

  expectTypeOf(useRouteContext<DefaultRouter, '/'>)
    .parameter(0)
    .toHaveProperty('select')
    .returns.toEqualTypeOf<unknown>()

  expectTypeOf(useRouteContext<DefaultRouter, '/'>).returns.toEqualTypeOf<
    Vue.Ref<{}>
  >()

  expectTypeOf(
    useRouteContext<DefaultRouter, '/', false>({
      strict: false,
    }),
  ).toEqualTypeOf<Vue.Ref<{}>>()
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

  const defaultRouter = createRouter({
    routeTree,
    context: { userId: 'userId' },
  })

  type DefaultRouter = typeof defaultRouter

  expectTypeOf(useRouteContext<DefaultRouter, '/'>).returns.toEqualTypeOf<
    Vue.Ref<{
      userId: string
    }>
  >()

  expectTypeOf(
    useRouteContext<DefaultRouter, '/invoices/$invoiceId'>,
  ).returns.toEqualTypeOf<Vue.Ref<{ userId: string }>>()

  expectTypeOf(useRouteContext<DefaultRouter, '/invoices/$invoiceId'>)
    .parameter(0)
    .toHaveProperty('select')
    .toEqualTypeOf<((search: { userId: string }) => unknown) | undefined>()

  expectTypeOf(
    useRouteContext<DefaultRouter, '/invoices', false>,
  ).returns.toEqualTypeOf<Vue.Ref<{ userId?: string }>>()

  expectTypeOf(useRouteContext<DefaultRouter, '/invoices', false>)
    .parameter(0)
    .toHaveProperty('select')
    .toEqualTypeOf<((search: { userId?: string }) => unknown) | undefined>()

  expectTypeOf(
    useRouteContext<DefaultRouter, '/invoices', false, number>,
  ).returns.toEqualTypeOf<Vue.Ref<number>>()
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

  const defaultRouter = createRouter({
    routeTree,
    context: { userId: 'userId' },
  })

  type DefaultRouter = typeof defaultRouter

  expectTypeOf(useRouteContext<DefaultRouter, '/'>).returns.toEqualTypeOf<
    Vue.Ref<{
      userId: string
    }>
  >()

  expectTypeOf(
    useRouteContext<DefaultRouter, '/invoices/$invoiceId'>,
  ).returns.toEqualTypeOf<Vue.Ref<{ userId: string }>>()

  expectTypeOf(useRouteContext<DefaultRouter, '/invoices/$invoiceId'>)
    .parameter(0)
    .toHaveProperty('select')
    .toEqualTypeOf<((search: { userId: string }) => unknown) | undefined>()

  expectTypeOf(
    useRouteContext<DefaultRouter, '/invoices', false>,
  ).returns.toEqualTypeOf<Vue.Ref<{ userId?: string; username?: string }>>()

  expectTypeOf(useRouteContext<DefaultRouter, '/invoices', false>)
    .parameter(0)
    .toHaveProperty('select')
    .toEqualTypeOf<
      ((search: { userId?: string; username?: string }) => unknown) | undefined
    >()
})

test('when context returns context', () => {
  interface Context {
    userId: string
  }

  const rootRoute = createRootRouteWithContext<Context>()()

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
    context: () => ({ invoicePermissions: true }),
  })

  const invoiceRoute = createRoute({
    getParentRoute: () => invoicesRoute,
    path: '$invoiceId',
  })

  const routeTree = rootRoute.addChildren([
    invoicesRoute.addChildren([invoiceRoute]),
  ])

  const defaultRouter = createRouter({
    routeTree,
    context: { userId: 'userId' },
  })

  type DefaultRouter = typeof defaultRouter

  expectTypeOf(
    useRouteContext<DefaultRouter, '/invoices'>,
  ).returns.toEqualTypeOf<
    Vue.Ref<{
      userId: string
      invoicePermissions: boolean
    }>
  >()

  // child inherits parent context
  expectTypeOf(
    useRouteContext<DefaultRouter, '/invoices/$invoiceId'>,
  ).returns.toEqualTypeOf<
    Vue.Ref<{
      userId: string
      invoicePermissions: boolean
    }>
  >()
})

test('when context with invalidate returns context', () => {
  interface Context {
    userId: string
  }

  const rootRoute = createRootRouteWithContext<Context>()()

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
    context: { handler: () => ({ invoiceList: [1, 2, 3] }), invalidate: true },
  })

  const invoiceRoute = createRoute({
    getParentRoute: () => invoicesRoute,
    path: '$invoiceId',
  })

  const routeTree = rootRoute.addChildren([
    invoicesRoute.addChildren([invoiceRoute]),
  ])

  const defaultRouter = createRouter({
    routeTree,
    context: { userId: 'userId' },
  })

  type DefaultRouter = typeof defaultRouter

  expectTypeOf(
    useRouteContext<DefaultRouter, '/invoices'>,
  ).returns.toEqualTypeOf<
    Vue.Ref<{
      userId: string
      invoiceList: Array<number>
    }>
  >()

  // child inherits parent context
  expectTypeOf(
    useRouteContext<DefaultRouter, '/invoices/$invoiceId'>,
  ).returns.toEqualTypeOf<
    Vue.Ref<{
      userId: string
      invoiceList: Array<number>
    }>
  >()
})

test('when context + beforeLoad all return context', () => {
  interface Context {
    userId: string
  }

  const rootRoute = createRootRouteWithContext<Context>()()

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
    context: () => ({ fromContext: 'match-data' }),
    beforeLoad: () => ({ fromBeforeLoad: 'before-data' }),
  })

  const routeTree = rootRoute.addChildren([invoicesRoute])

  const defaultRouter = createRouter({
    routeTree,
    context: { userId: 'userId' },
  })

  type DefaultRouter = typeof defaultRouter

  expectTypeOf(
    useRouteContext<DefaultRouter, '/invoices'>,
  ).returns.toEqualTypeOf<
    Vue.Ref<{
      userId: string
      fromContext: string
      fromBeforeLoad: string
    }>
  >()
})

test('when child route sees parent context + beforeLoad context', () => {
  interface Context {
    userId: string
  }

  const rootRoute = createRootRouteWithContext<Context>()()

  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'parent',
    context: () => ({ parentContext: 'match' }),
    beforeLoad: () => ({ parentBeforeLoad: 'before' }),
  })

  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: 'child',
    context: () => ({ childContext: 'child-match' }),
    beforeLoad: () => ({ childBeforeLoad: 'child-before' }),
  })

  const routeTree = rootRoute.addChildren([
    parentRoute.addChildren([childRoute]),
  ])

  const defaultRouter = createRouter({
    routeTree,
    context: { userId: 'userId' },
  })

  type DefaultRouter = typeof defaultRouter

  // parent only has its own context
  expectTypeOf(useRouteContext<DefaultRouter, '/parent'>).returns.toEqualTypeOf<
    Vue.Ref<{
      userId: string
      parentContext: string
      parentBeforeLoad: string
    }>
  >()

  // child inherits all parent context plus its own
  expectTypeOf(
    useRouteContext<DefaultRouter, '/parent/child'>,
  ).returns.toEqualTypeOf<
    Vue.Ref<{
      userId: string
      parentContext: string
      parentBeforeLoad: string
      childContext: string
      childBeforeLoad: string
    }>
  >()
})

test('when context uses as const return type', () => {
  interface Context {
    userId: string
  }

  const rootRoute = createRootRouteWithContext<Context>()()

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
    context: () => ({ status: 'active' }) as const,
  })

  const routeTree = rootRoute.addChildren([invoicesRoute])

  const defaultRouter = createRouter({
    routeTree,
    context: { userId: 'userId' },
  })

  type DefaultRouter = typeof defaultRouter

  expectTypeOf(
    useRouteContext<DefaultRouter, '/invoices'>,
  ).returns.toEqualTypeOf<
    Vue.Ref<{
      userId: string
      readonly status: 'active'
    }>
  >()
})

test('when overlapping keys across context and beforeLoad', () => {
  interface Context {
    userId: string
  }

  const rootRoute = createRootRouteWithContext<Context>()()

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
    context: () => ({ shared: 'from-context' }) as const,
    beforeLoad: () => ({ shared: 'from-beforeLoad' }) as const,
  })

  const routeTree = rootRoute.addChildren([invoicesRoute])

  const defaultRouter = createRouter({
    routeTree,
    context: { userId: 'userId' },
  })

  type DefaultRouter = typeof defaultRouter

  // beforeLoad wins because it's the last Assign in the chain
  expectTypeOf(
    useRouteContext<DefaultRouter, '/invoices'>,
  ).returns.toEqualTypeOf<
    Vue.Ref<{
      userId: string
      readonly shared: 'from-beforeLoad'
    }>
  >()
})

test('when non-strict mode with context across routes', () => {
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
    context: () => ({ invoiceData: 'data' }),
  })

  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'posts',
    context: { handler: () => ({ postData: 'data' }), invalidate: true },
  })

  const routeTree = rootRoute.addChildren([
    indexRoute,
    invoicesRoute,
    postsRoute,
  ])

  const defaultRouter = createRouter({
    routeTree,
    context: { userId: 'userId' },
  })

  type DefaultRouter = typeof defaultRouter

  // non-strict mode unions all possible context shapes
  expectTypeOf(
    useRouteContext<DefaultRouter, '/invoices', false>,
  ).returns.toEqualTypeOf<
    Vue.Ref<{
      userId?: string
      invoiceData?: string
      postData?: string
    }>
  >()
})

test('when root route has context', () => {
  interface Context {
    userId: string
  }

  const rootRoute = createRootRouteWithContext<Context>()({
    context: () => ({ rootContext: 'root-match' }),
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
    context: () => ({ invoiceContext: 'inv-match' }),
  })

  const routeTree = rootRoute.addChildren([indexRoute, invoicesRoute])

  const defaultRouter = createRouter({
    routeTree,
    context: { userId: 'userId' },
  })

  type DefaultRouter = typeof defaultRouter

  // index route inherits root context
  expectTypeOf(useRouteContext<DefaultRouter, '/'>).returns.toEqualTypeOf<
    Vue.Ref<{
      userId: string
      rootContext: string
    }>
  >()

  // invoices route has root + its own context
  expectTypeOf(
    useRouteContext<DefaultRouter, '/invoices'>,
  ).returns.toEqualTypeOf<
    Vue.Ref<{
      userId: string
      rootContext: string
      invoiceContext: string
    }>
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

  const defaultRouter = createRouter({
    routeTree,
    context: { userId: 'userId' },
  })

  type DefaultRouter = typeof defaultRouter

  expectTypeOf(useRouteContext<DefaultRouter, '/'>).returns.toEqualTypeOf<
    Vue.Ref<{
      userId: string
    }>
  >

  expectTypeOf(
    useRouteContext<DefaultRouter, '/invoices/$invoiceId'>,
  ).returns.toEqualTypeOf<
    Vue.Ref<{
      userId: string
      readonly username: 'username2'
    }>
  >()

  expectTypeOf(useRouteContext<DefaultRouter, '/invoices/$invoiceId'>)
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
    useRouteContext<DefaultRouter, '/invoices', false>,
  ).returns.toEqualTypeOf<
    Vue.Ref<{
      userId?: string
      username?: 'username1' | 'username2'
    }>
  >()

  expectTypeOf(useRouteContext<DefaultRouter, '/invoices', false>)
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
