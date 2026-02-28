import { describe, expectTypeOf, test } from 'vitest'
import * as Angular from '@angular/core'
import {
  createRootRoute,
  createRoute,
  createRouter,
  injectParams,
} from '../src'

describe('injectParams', () => {
  test('when there are no params', () => {
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

    expectTypeOf(injectParams<DefaultRouter>)
      .parameter(0)
      .toHaveProperty('from')
      .toMatchTypeOf<'/invoices' | '__root__' | '/invoices/' | '/' | undefined>()

    expectTypeOf(injectParams<DefaultRouter>)
      .parameter(0)
      .toHaveProperty('strict')
      .toEqualTypeOf<true | undefined>()

    expectTypeOf(injectParams<DefaultRouter, '/'>)
      .parameter(0)
      .toHaveProperty('select')
      .parameter(0)
      .toEqualTypeOf<{}>()

    expectTypeOf(injectParams<DefaultRouter, '/'>)
      .parameter(0)
      .toHaveProperty('select')
      .returns.toEqualTypeOf<unknown>()

    expectTypeOf(injectParams<DefaultRouter, '/'>).returns.toEqualTypeOf<
      Angular.Signal<{}>
    >()

    expectTypeOf(
      injectParams<DefaultRouter, '/', false>({
        strict: false,
      }),
    ).toEqualTypeOf<Angular.Signal<{}>>()
  })

  test('when there is one param', () => {
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

    expectTypeOf(injectParams<DefaultRouter, '/'>).returns.toEqualTypeOf<
      Angular.Signal<{}>
    >()

    expectTypeOf(
      injectParams<DefaultRouter, '/invoices/$invoiceId'>,
    ).returns.toEqualTypeOf<Angular.Signal<{ invoiceId: string }>>()

    expectTypeOf(injectParams<DefaultRouter, '/invoices/$invoiceId'>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<((search: { invoiceId: string }) => unknown) | undefined>()

    expectTypeOf(
      injectParams<DefaultRouter, '/invoices', false>,
    ).returns.toExtend<Angular.Signal<{ invoiceId?: string }>>()

    expectTypeOf(injectParams<DefaultRouter, '/invoices', false>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<
        ((search: { invoiceId?: string }) => unknown) | undefined
      >()

    expectTypeOf(
      injectParams<
        DefaultRouter,
        '/invoices',
        /* strict */ false,
        /* shouldThrow */ true,
        number
      >,
    ).returns.toEqualTypeOf<Angular.Signal<number>>()
  })

  test('when there are multiple params', () => {
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

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
    })

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
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
    })

    type DefaultRouter = typeof defaultRouter

    expectTypeOf(injectParams<DefaultRouter, '/'>).returns.toEqualTypeOf<
      Angular.Signal<{}>
    >()

    expectTypeOf(
      injectParams<DefaultRouter, '/invoices/$invoiceId'>,
    ).returns.toEqualTypeOf<Angular.Signal<{ invoiceId: string }>>()

    expectTypeOf(injectParams<DefaultRouter, '/invoices/$invoiceId'>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<((search: { invoiceId: string }) => unknown) | undefined>()

    expectTypeOf(
      injectParams<DefaultRouter, '/invoices', false>,
    ).returns.toExtend<
      Angular.Signal<{ invoiceId?: string; postId?: string }>
    >()

    expectTypeOf(injectParams<DefaultRouter, '/invoices', false>)
      .parameter(0)
      .toHaveProperty('select')
      .toEqualTypeOf<
        | ((search: { invoiceId?: string; postId?: string }) => unknown)
        | undefined
      >()

    expectTypeOf(
      injectParams<
        DefaultRouter,
        '/invoices',
        /* strict */ true,
        /* shouldThrow */ true,
        { func: () => void }
      >,
    )
      .parameter(0)
      .exclude<undefined>()
      .toHaveProperty('select')
      .toEqualTypeOf<
        | ((search: {}) => {
          func: () => void
        })
        | undefined
      >()
  })

  describe('shouldThrow', () => {
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
    const invoiceRoute = createRoute({
      getParentRoute: () => invoicesRoute,
      path: '$id',
    })

    const routeTree = rootRoute.addChildren([
      invoicesRoute.addChildren([invoiceRoute]),
      indexRoute,
    ])

    const router = createRouter({ routeTree })

    const from = '/invoices/$id'
    test('return type is `{ id: string }` when shouldThrow = true', () => {
      const shouldThrow = true
      const params = injectParams<
        typeof router,
        typeof from,
        /* strict */ true,
        typeof shouldThrow
      >({ from, shouldThrow })

      expectTypeOf(params).toEqualTypeOf<Angular.Signal<{ id: string }>>()
    })

    test('return type is `{id: string} | undefined` when shouldThrow = false', () => {
      const shouldThrow = false
      const params = injectParams<
        typeof router,
        typeof from,
        /* strict */ true,
        typeof shouldThrow
      >({ from, shouldThrow })

      expectTypeOf(params).toEqualTypeOf<
        Angular.Signal<{ id: string } | undefined>
      >()
    })
  })
})


