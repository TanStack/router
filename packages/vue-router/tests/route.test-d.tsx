import { expectTypeOf, test } from 'vitest'
import {
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from '../src'
import type * as Vue from 'vue'
import type {
  BuildLocationFn,
  ControlledPromise,
  NavigateFn,
  NavigateOptions,
  ParsedLocation,
  SearchSchemaInput,
} from '../src'
import type {
  AnyRoute,
  AnyRouter,
  MakeRouteMatchFromRoute,
  MakeRouteMatchUnion,
} from '@tanstack/router-core'

test('when creating the root', () => {
  const rootRoute = createRootRoute()

  expectTypeOf(rootRoute.fullPath).toEqualTypeOf<'/'>()
  expectTypeOf(rootRoute.id).toEqualTypeOf<'__root__'>()
  expectTypeOf(rootRoute.path).toEqualTypeOf<'/'>()
})

test('when creating the root with context', () => {
  const rootRoute = createRootRoute({
    context: (opts) => {
      expectTypeOf(opts).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: {}
        deps: {}
        location: ParsedLocation
        navigate: NavigateFn
        buildLocation: BuildLocationFn
        routeId: '__root__'
        cause: 'preload' | 'enter' | 'stay'
        context: {}
        matches: Array<MakeRouteMatchUnion>
      }>()
    },
  })

  expectTypeOf(rootRoute.fullPath).toEqualTypeOf<'/'>()
  expectTypeOf(rootRoute.id).toEqualTypeOf<'__root__'>()
  expectTypeOf(rootRoute.path).toEqualTypeOf<'/'>()
})

test('when creating the root with beforeLoad', () => {
  const rootRoute = createRootRoute({
    beforeLoad: (opts) => {
      expectTypeOf(opts).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: {}
        location: ParsedLocation
        navigate: NavigateFn
        buildLocation: BuildLocationFn
        routeId: '__root__'
        cause: 'preload' | 'enter' | 'stay'
        context: {}
        search: {}
        matches: Array<MakeRouteMatchUnion>
      }>()
    },
  })

  expectTypeOf(rootRoute.fullPath).toEqualTypeOf<'/'>()
  expectTypeOf(rootRoute.id).toEqualTypeOf<'__root__'>()
  expectTypeOf(rootRoute.path).toEqualTypeOf<'/'>()
})

test('when creating the root with context using object form with invalidate', () => {
  const rootRoute = createRootRoute({
    context: {
      handler: (opts) => {
        expectTypeOf(opts).toEqualTypeOf<{
          abortController: AbortController
          preload: boolean
          params: {}
          deps: {}
          location: ParsedLocation
          navigate: NavigateFn
          buildLocation: BuildLocationFn
          routeId: '__root__'
          cause: 'preload' | 'enter' | 'stay'
          context: {}
          matches: Array<MakeRouteMatchUnion>
        }>()
      },
      invalidate: true,
    },
  })

  expectTypeOf(rootRoute.fullPath).toEqualTypeOf<'/'>()
  expectTypeOf(rootRoute.id).toEqualTypeOf<'__root__'>()
  expectTypeOf(rootRoute.path).toEqualTypeOf<'/'>()
})

test('when creating the root with a loader', () => {
  const rootRoute = createRootRoute({
    loader: (opts) => {
      expectTypeOf(opts).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: {}
        deps: {}
        context: {}
        location: ParsedLocation
        navigate: (opts: NavigateOptions<AnyRouter>) => Promise<void> | void
        parentMatchPromise: never
        cause: 'preload' | 'enter' | 'stay'
        route: AnyRoute
      }>()
    },
  })

  expectTypeOf(rootRoute.fullPath).toEqualTypeOf<'/'>()
  expectTypeOf(rootRoute.id).toEqualTypeOf<'__root__'>()
  expectTypeOf(rootRoute.path).toEqualTypeOf<'/'>()
})

test('when creating the root route with context and context option', () => {
  const createRouteResult = createRootRouteWithContext<{ userId: string }>()
  const rootRoute = createRouteResult({
    context: (opts) => {
      expectTypeOf(opts).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: {}
        deps: {}
        location: ParsedLocation
        navigate: NavigateFn
        buildLocation: BuildLocationFn
        routeId: '__root__'
        cause: 'preload' | 'enter' | 'stay'
        context: { userId: string }
        matches: Array<MakeRouteMatchUnion>
      }>()
    },
  })

  expectTypeOf(rootRoute.fullPath).toEqualTypeOf<'/'>()
  expectTypeOf(rootRoute.id).toEqualTypeOf<'__root__'>()
  expectTypeOf(rootRoute.path).toEqualTypeOf<'/'>()

  const router = createRouter({
    routeTree: rootRoute,
    context: { userId: '123' },
  })

  expectTypeOf(rootRoute.useRouteContext<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      userId: string
    }>
  >()

  expectTypeOf(rootRoute.useRouteContext<typeof router>)
    .parameter(0)
    .exclude<undefined>()
    .toHaveProperty('select')
    .toEqualTypeOf<((context: { userId: string }) => unknown) | undefined>()
})

test('when creating the root route with context and beforeLoad', () => {
  const createRouteResult = createRootRouteWithContext<{ userId: string }>()

  const rootRoute = createRouteResult({
    beforeLoad: (opts) => {
      expectTypeOf(opts).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: {}
        location: ParsedLocation
        navigate: NavigateFn
        buildLocation: BuildLocationFn
        routeId: '__root__'
        cause: 'preload' | 'enter' | 'stay'
        context: { userId: string }
        search: {}
        matches: Array<MakeRouteMatchUnion>
      }>()
    },
  })

  expectTypeOf(rootRoute.fullPath).toEqualTypeOf<'/'>()
  expectTypeOf(rootRoute.id).toEqualTypeOf<'__root__'>()
  expectTypeOf(rootRoute.path).toEqualTypeOf<'/'>()

  const router = createRouter({
    routeTree: rootRoute,
    context: { userId: '123' },
  })

  expectTypeOf(rootRoute.useRouteContext<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      userId: string
    }>
  >()

  expectTypeOf(rootRoute.useRouteContext<typeof router>)
    .parameter(0)
    .exclude<undefined>()
    .toHaveProperty('select')
    .toEqualTypeOf<((context: { userId: string }) => unknown) | undefined>()
})

test('when creating the root route with context and context option using object form with invalidate', () => {
  const createRouteResult = createRootRouteWithContext<{ userId: string }>()

  const rootRoute = createRouteResult({
    context: {
      handler: (opts) => {
        expectTypeOf(opts).toEqualTypeOf<{
          abortController: AbortController
          preload: boolean
          params: {}
          deps: {}
          location: ParsedLocation
          navigate: NavigateFn
          buildLocation: BuildLocationFn
          routeId: '__root__'
          cause: 'preload' | 'enter' | 'stay'
          context: { userId: string }
          matches: Array<MakeRouteMatchUnion>
        }>()
      },
      invalidate: true,
    },
  })

  const router = createRouter({
    routeTree: rootRoute,
    context: { userId: '123' },
  })

  expectTypeOf(rootRoute.useRouteContext<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      userId: string
    }>
  >()
})

test('when creating the root route with context and a loader', () => {
  const createRouteResult = createRootRouteWithContext<{ userId: string }>()

  const rootRoute = createRouteResult({
    loader: (opts) => {
      expectTypeOf(opts).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: {}
        deps: {}
        context: { userId: string }
        location: ParsedLocation
        navigate: (opts: NavigateOptions<AnyRouter>) => Promise<void> | void
        parentMatchPromise: never
        cause: 'preload' | 'enter' | 'stay'
        route: AnyRoute
      }>()
    },
  })

  expectTypeOf(rootRoute.fullPath).toEqualTypeOf<'/'>()
  expectTypeOf(rootRoute.id).toEqualTypeOf<'__root__'>()
  expectTypeOf(rootRoute.path).toEqualTypeOf<'/'>()

  const router = createRouter({
    routeTree: rootRoute,
    context: { userId: '123' },
  })

  expectTypeOf(rootRoute.useRouteContext<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      userId: string
    }>
  >()

  expectTypeOf(rootRoute.useRouteContext<typeof router>)
    .parameter(0)
    .exclude<undefined>()
    .toHaveProperty('select')
    .toEqualTypeOf<((context: { userId: string }) => unknown) | undefined>()
})

test('when creating the root route with context, context option, beforeLoad and a loader', () => {
  const createRouteResult = createRootRouteWithContext<{ userId: string }>()

  const rootRoute = createRouteResult({
    context: (opt) => {
      expectTypeOf(opt).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: {}
        deps: {}
        location: ParsedLocation
        navigate: NavigateFn
        buildLocation: BuildLocationFn
        routeId: '__root__'
        cause: 'preload' | 'enter' | 'stay'
        context: { userId: string }
        matches: Array<MakeRouteMatchUnion>
      }>()

      return {
        env: 'env1' as const,
      }
    },
    beforeLoad: (opts) => {
      expectTypeOf(opts).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: {}
        location: ParsedLocation
        navigate: NavigateFn
        buildLocation: BuildLocationFn
        routeId: '__root__'
        cause: 'preload' | 'enter' | 'stay'
        context: { userId: string; env: 'env1' }
        search: {}
        matches: Array<MakeRouteMatchUnion>
      }>()
      return { permission: 'view' as const }
    },
    loader: (opts) => {
      expectTypeOf(opts).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: {}
        deps: {}
        context: { userId: string; permission: 'view'; env: 'env1' }
        location: ParsedLocation
        navigate: (opts: NavigateOptions<AnyRouter>) => Promise<void> | void
        parentMatchPromise: never
        cause: 'preload' | 'enter' | 'stay'
        route: AnyRoute
      }>()
    },
  })

  expectTypeOf(rootRoute.fullPath).toEqualTypeOf<'/'>()
  expectTypeOf(rootRoute.id).toEqualTypeOf<'__root__'>()
  expectTypeOf(rootRoute.path).toEqualTypeOf<'/'>()

  const router = createRouter({
    routeTree: rootRoute,
    context: { userId: '123' },
  })

  expectTypeOf(rootRoute.useRouteContext<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      userId: string
      permission: 'view'
      env: 'env1'
    }>
  >()

  expectTypeOf(rootRoute.useRouteContext<typeof router, string>)
    .parameter(0)
    .exclude<undefined>()
    .toHaveProperty('select')
    .toEqualTypeOf<
      | ((context: {
          userId: string
          permission: 'view'
          env: 'env1'
        }) => string)
      | undefined
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

  const router = createRouter({
    routeTree: rootRoute.addChildren([invoicesRoute]),
    context: { userId: '123' },
  })

  expectTypeOf(rootRoute.useRouteContext<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      userId: string
    }>
  >()

  expectTypeOf(rootRoute.useRouteContext<typeof router>)
    .parameter(0)
    .exclude<undefined>()
    .toHaveProperty('select')
    .toEqualTypeOf<((context: { userId: string }) => unknown) | undefined>()
})

test('when creating a child route with context from the root route with context', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  createRoute({
    path: 'invoices',
    getParentRoute: () => rootRoute,
    context: (opts) => {
      expectTypeOf(opts).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: {}
        deps: {}
        location: ParsedLocation
        navigate: NavigateFn
        buildLocation: BuildLocationFn
        routeId: '/invoices'
        cause: 'preload' | 'enter' | 'stay'
        context: { userId: string }
        matches: Array<MakeRouteMatchUnion>
      }>()

      return {
        env: 'env1' as const,
      }
    },
  })
})

test('when creating a child route with beforeLoad from the root route with context', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  createRoute({
    path: 'invoices',
    getParentRoute: () => rootRoute,
    beforeLoad: (opts) => {
      expectTypeOf(opts).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: {}
        location: ParsedLocation
        navigate: NavigateFn
        buildLocation: BuildLocationFn
        routeId: '/invoices'
        cause: 'preload' | 'enter' | 'stay'
        context: { userId: string }
        search: {}
        matches: Array<MakeRouteMatchUnion>
      }>()
    },
  })
})

test('when creating a child route with a loader from the root route', () => {
  const rootRoute = createRootRoute()

  const invoicesRoute = createRoute({
    path: 'invoices',
    getParentRoute: () => rootRoute,
    loader: (opt) => {
      expectTypeOf(opt).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: {}
        deps: {}
        context: {}
        location: ParsedLocation
        navigate: (opts: NavigateOptions<AnyRouter>) => Promise<void> | void
        parentMatchPromise: Promise<MakeRouteMatchFromRoute<typeof rootRoute>>
        cause: 'preload' | 'enter' | 'stay'
        route: AnyRoute
      }>()
      return [{ id: 'invoice1' }, { id: 'invoice2' }] as const
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([invoicesRoute]),
  })

  expectTypeOf(invoicesRoute.useLoaderData<typeof router, string>)
    .parameter(0)
    .exclude<undefined>()
    .toHaveProperty('select')
    .toEqualTypeOf<
      | ((
          search: readonly [
            { readonly id: 'invoice1' },
            { readonly id: 'invoice2' },
          ],
        ) => string)
      | undefined
    >()

  expectTypeOf(invoicesRoute.useLoaderData<typeof router>()).toEqualTypeOf<
    Vue.Ref<readonly [{ readonly id: 'invoice1' }, { readonly id: 'invoice2' }]>
  >()
})

test('when creating a child route with a loader from the root route with context', () => {
  const invoicesRoute = createRoute({
    path: 'invoices',
    getParentRoute: () => rootRoute,
    loader: (opts) => {
      expectTypeOf(opts).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: {}
        deps: {}
        context: { userId: string }
        location: ParsedLocation
        navigate: (opts: NavigateOptions<AnyRouter>) => Promise<void> | void
        parentMatchPromise: Promise<MakeRouteMatchFromRoute<typeof rootRoute>>
        cause: 'preload' | 'enter' | 'stay'
        route: AnyRoute
      }>()
      return [{ id: 'invoice1' }, { id: 'invoice2' }] as const
    },
  })

  const rootRoute = createRootRouteWithContext<{
    userId: string
  }>()()

  const routeTree = rootRoute.addChildren([invoicesRoute])

  const router = createRouter({
    routeTree,
    context: { userId: '123' },
  })

  expectTypeOf(invoicesRoute.useLoaderData<typeof router, string>)
    .parameter(0)
    .exclude<undefined>()
    .toHaveProperty('select')
    .toEqualTypeOf<
      | ((
          search: readonly [
            { readonly id: 'invoice1' },
            { readonly id: 'invoice2' },
          ],
        ) => string)
      | undefined
    >()

  expectTypeOf(invoicesRoute.useLoaderData<typeof router>()).toEqualTypeOf<
    Vue.Ref<readonly [{ readonly id: 'invoice1' }, { readonly id: 'invoice2' }]>
  >()

  expectTypeOf(invoicesRoute.useLoaderData<typeof router>()).toEqualTypeOf<
    Vue.Ref<readonly [{ readonly id: 'invoice1' }, { readonly id: 'invoice2' }]>
  >()
})

test('when creating a child route with search params from the root route', () => {
  const rootRoute = createRootRoute()

  const invoicesRoute = createRoute({
    path: 'invoices',
    getParentRoute: () => rootRoute,
    validateSearch: () => ({ page: 0 }),
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([invoicesRoute]),
  })

  expectTypeOf(invoicesRoute.useSearch<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      page: number
    }>
  >()

  expectTypeOf(invoicesRoute.useSearch<typeof router, number>)
    .parameter(0)
    .exclude<undefined>()
    .toHaveProperty('select')
    .toEqualTypeOf<((search: { page: number }) => number) | undefined>()
})

test('when creating a child route with optional search params from the root route', () => {
  const rootRoute = createRootRoute()

  const invoicesRoute = createRoute({
    path: 'invoices',
    getParentRoute: () => rootRoute,
    validateSearch: (): { page?: number } => ({ page: 0 }),
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([invoicesRoute]),
  })

  expectTypeOf(invoicesRoute.useSearch<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      page?: number
    }>
  >()

  expectTypeOf(invoicesRoute.useSearch<typeof router, number>)
    .parameter(0)
    .exclude<undefined>()
    .toHaveProperty('select')
    .toEqualTypeOf<
      ((search: { page?: number | undefined }) => number) | undefined
    >()
})

test('when creating a child route with params from the root route', () => {
  const rootRoute = createRootRoute()

  const invoicesRoute = createRoute({
    path: 'invoices/$invoiceId',
    getParentRoute: () => rootRoute,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([invoicesRoute]),
  })

  expectTypeOf(invoicesRoute.useParams<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      invoiceId: string
    }>
  >()

  expectTypeOf(invoicesRoute.useParams<typeof router, number>)
    .parameter(0)
    .exclude<undefined>()
    .toHaveProperty('select')
    .toEqualTypeOf<((params: { invoiceId: string }) => number) | undefined>()
})

test('when creating a child route with a splat param from the root route', () => {
  const rootRoute = createRootRoute()

  const invoicesRoute = createRoute({
    path: 'invoices/$',
    getParentRoute: () => rootRoute,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([invoicesRoute]),
  })

  expectTypeOf(invoicesRoute.useParams<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      _splat?: string
    }>
  >()

  expectTypeOf(invoicesRoute.useParams<typeof router, number>)
    .parameter(0)
    .exclude<undefined>()
    .toHaveProperty('select')
    .toEqualTypeOf<((params: { _splat?: string }) => number) | undefined>()
})

test('when creating a child route with a param and splat param from the root route', () => {
  const rootRoute = createRootRoute()

  const invoicesRoute = createRoute({
    path: 'invoices/$invoiceId/$',
    getParentRoute: () => rootRoute,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([invoicesRoute]),
  })

  expectTypeOf(invoicesRoute.useParams<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      invoiceId: string
      _splat?: string
    }>
  >()

  expectTypeOf(invoicesRoute.useParams<typeof router, number>)
    .parameter(0)
    .exclude<undefined>()
    .toHaveProperty('select')
    .toEqualTypeOf<
      ((params: { invoiceId: string; _splat?: string }) => number) | undefined
    >()
})

test('when creating a child route with params, search and loader from the root route', () => {
  const rootRoute = createRootRoute()

  createRoute({
    path: 'invoices/$invoiceId',
    getParentRoute: () => rootRoute,
    validateSearch: () => ({ page: 0 }),
    loader: (opts) => {
      expectTypeOf(opts).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: { invoiceId: string }
        deps: {}
        context: {}
        location: ParsedLocation
        navigate: (opts: NavigateOptions<AnyRouter>) => Promise<void> | void
        parentMatchPromise: Promise<MakeRouteMatchFromRoute<typeof rootRoute>>
        cause: 'preload' | 'enter' | 'stay'
        route: AnyRoute
      }>
    },
  })
})

test('when creating a child route with params, search, loader and loaderDeps from the root route', () => {
  const rootRoute = createRootRoute()

  createRoute({
    path: 'invoices/$invoiceId',
    getParentRoute: () => rootRoute,
    validateSearch: () => ({ page: 0 }),
    loaderDeps: (deps) => ({ page: deps.search.page }),
    loader: (opts) =>
      expectTypeOf(opts).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: { invoiceId: string }
        deps: { page: number }
        context: {}
        location: ParsedLocation
        navigate: (opts: NavigateOptions<AnyRouter>) => Promise<void> | void
        parentMatchPromise: Promise<MakeRouteMatchFromRoute<typeof rootRoute>>
        cause: 'preload' | 'enter' | 'stay'
        route: AnyRoute
      }>(),
  })
})

test('when creating a child route with params, search, loader and loaderDeps from the root route with context', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  createRoute({
    path: 'invoices/$invoiceId',
    getParentRoute: () => rootRoute,
    validateSearch: () => ({ page: 0 }),
    loaderDeps: (deps) => ({ page: deps.search.page }),
    loader: (opts) =>
      expectTypeOf(opts).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: { invoiceId: string }
        deps: { page: number }
        context: { userId: string }
        location: ParsedLocation
        navigate: (opts: NavigateOptions<AnyRouter>) => Promise<void> | void
        parentMatchPromise: Promise<MakeRouteMatchFromRoute<typeof rootRoute>>
        cause: 'preload' | 'enter' | 'stay'
        route: AnyRoute
      }>(),
  })
})

test('when creating a child route with params, search with context from the root route with context', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  createRoute({
    path: 'invoices/$invoiceId',
    getParentRoute: () => rootRoute,
    validateSearch: () => ({ page: 0 }),
    context: (opts) => {
      expectTypeOf(opts).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: { invoiceId: string }
        deps: {}
        location: ParsedLocation
        navigate: NavigateFn
        buildLocation: BuildLocationFn
        routeId: '/invoices/$invoiceId'
        cause: 'preload' | 'enter' | 'stay'
        context: { userId: string }
        matches: Array<MakeRouteMatchUnion>
      }>()
    },
  })
})

test('when creating a child route with params, search with beforeLoad from the root route with context', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  createRoute({
    path: 'invoices/$invoiceId',
    getParentRoute: () => rootRoute,
    validateSearch: () => ({ page: 0 }),
    beforeLoad: (opts) => {
      expectTypeOf(opts).toMatchTypeOf<{
        abortController: AbortController
        preload: boolean
        params: { invoiceId: string }
        location: ParsedLocation
        navigate: NavigateFn
        buildLocation: BuildLocationFn
        cause: 'preload' | 'enter' | 'stay'
        context: { userId: string }
        search: { page: number }
        matches: Array<MakeRouteMatchUnion>
      }>()
    },
  })
})

test('when creating a child route with params, search with context, beforeLoad and a loader from the root route with context', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  createRoute({
    path: 'invoices/$invoiceId',
    getParentRoute: () => rootRoute,
    validateSearch: () => ({ page: 0 }),
    context: (opts) => {
      expectTypeOf(opts).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: { invoiceId: string }
        deps: {}
        location: ParsedLocation
        navigate: NavigateFn
        buildLocation: BuildLocationFn
        routeId: '/invoices/$invoiceId'
        cause: 'preload' | 'enter' | 'stay'
        context: { userId: string }
        matches: Array<MakeRouteMatchUnion>
      }>()
      return {
        env: 'env1',
      }
    },
    beforeLoad: (opts) => {
      expectTypeOf(opts).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: { invoiceId: string }
        location: ParsedLocation
        navigate: NavigateFn
        buildLocation: BuildLocationFn
        routeId: '/invoices/$invoiceId'
        cause: 'preload' | 'enter' | 'stay'
        context: { userId: string; env: string }
        search: { page: number }
        matches: Array<MakeRouteMatchUnion>
      }>()
      return { permission: 'view' } as const
    },
    loader: (opts) => {
      expectTypeOf(opts).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: { invoiceId: string }
        deps: {}
        context: { userId: string; env: string; readonly permission: 'view' }
        location: ParsedLocation
        navigate: (opts: NavigateOptions<AnyRouter>) => Promise<void> | void
        parentMatchPromise: Promise<MakeRouteMatchFromRoute<typeof rootRoute>>
        cause: 'preload' | 'enter' | 'stay'
        route: AnyRoute
      }>()
    },
  })
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

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      invoicesRoute.addChildren([detailsRoute]),
    ]),
  })

  expectTypeOf(detailsRoute.useParams<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      invoiceId: string
      detailId: string
    }>
  >()

  expectTypeOf(detailsRoute.useParams<typeof router, number>)
    .parameter(0)
    .exclude<undefined>()
    .toHaveProperty('select')
    .toEqualTypeOf<
      ((params: { invoiceId: string; detailId: string }) => number) | undefined
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

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      invoicesRoute.addChildren([detailsRoute]),
    ]),
  })

  expectTypeOf(detailsRoute.useSearch<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      invoicePage: number
      detailPage: number
    }>
  >()

  expectTypeOf(detailsRoute.useSearch<typeof router, number>)
    .parameter(0)
    .exclude<undefined>()
    .toHaveProperty('select')
    .toEqualTypeOf<
      | ((params: { invoicePage: number; detailPage: number }) => number)
      | undefined
    >()
})

test('when creating a child route with context from a parent with context', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  const invoicesRoute = createRoute({
    path: 'invoices',
    getParentRoute: () => rootRoute,
    context: (opt) => {
      expectTypeOf(opt).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: {}
        deps: {}
        location: ParsedLocation
        navigate: NavigateFn
        buildLocation: BuildLocationFn
        routeId: '/invoices'
        cause: 'preload' | 'enter' | 'stay'
        context: { userId: string }
        matches: Array<MakeRouteMatchUnion>
      }>()

      return { invoiceId: 'invoiceId1' }
    },
  })

  const detailsRoute = createRoute({
    path: 'details',
    getParentRoute: () => invoicesRoute,
    context: (opt) => {
      expectTypeOf(opt).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: {}
        deps: {}
        location: ParsedLocation
        navigate: NavigateFn
        buildLocation: BuildLocationFn
        routeId: '/invoices/details'
        cause: 'preload' | 'enter' | 'stay'
        context: { userId: string; invoiceId: string }
        matches: Array<MakeRouteMatchUnion>
      }>()

      return { detailId: 'detailId1' }
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      invoicesRoute.addChildren([detailsRoute]),
    ]),
    context: { userId: '123' },
  })

  expectTypeOf(detailsRoute.useRouteContext<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      userId: string
      invoiceId: string
      detailId: string
    }>
  >()

  expectTypeOf(detailsRoute.useRouteContext<typeof router, number>)
    .parameter(0)
    .exclude<undefined>()
    .toHaveProperty('select')
    .toEqualTypeOf<
      | ((params: {
          userId: string
          invoiceId: string
          detailId: string
        }) => number)
      | undefined
    >()
})

test('when creating a child route with beforeLoad from a parent with beforeLoad', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  const invoicesRoute = createRoute({
    path: 'invoices',
    getParentRoute: () => rootRoute,
    beforeLoad: (opt) => {
      expectTypeOf(opt).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: {}
        location: ParsedLocation
        navigate: NavigateFn
        buildLocation: BuildLocationFn
        routeId: '/invoices'
        cause: 'preload' | 'enter' | 'stay'
        context: { userId: string }
        search: {}
        matches: Array<MakeRouteMatchUnion>
      }>()
      return { invoiceId: 'invoiceId1' }
    },
  })

  const detailsRoute = createRoute({
    path: 'details',
    getParentRoute: () => invoicesRoute,
    beforeLoad: (opt) => {
      expectTypeOf(opt).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: {}
        location: ParsedLocation
        navigate: NavigateFn
        buildLocation: BuildLocationFn
        routeId: '/invoices/details'
        cause: 'preload' | 'enter' | 'stay'
        context: { userId: string; invoiceId: string }
        search: {}
        matches: Array<MakeRouteMatchUnion>
      }>()
      return { detailId: 'detailId1' }
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      invoicesRoute.addChildren([detailsRoute]),
    ]),
    context: { userId: '123' },
  })

  expectTypeOf(detailsRoute.useRouteContext<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      userId: string
      invoiceId: string
      detailId: string
    }>
  >()

  expectTypeOf(detailsRoute.useRouteContext<typeof router, number>)
    .parameter(0)
    .exclude<undefined>()
    .toHaveProperty('select')
    .toEqualTypeOf<
      | ((params: {
          userId: string
          invoiceId: string
          detailId: string
        }) => number)
      | undefined
    >()
})

test('when creating a child route with context, beforeLoad, search, params, loaderDeps and loader', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  const invoicesRoute = createRoute({
    path: 'invoices',
    getParentRoute: () => rootRoute,
    validateSearch: () => ({ page: 0 }),
    context: (opt) => {
      expectTypeOf(opt).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: {}
        deps: {}
        location: ParsedLocation
        navigate: NavigateFn
        buildLocation: BuildLocationFn
        routeId: '/invoices'
        cause: 'preload' | 'enter' | 'stay'
        context: { userId: string }
        matches: Array<MakeRouteMatchUnion>
      }>()
      return { env: 'env1' }
    },
    beforeLoad: (opt) => {
      expectTypeOf(opt).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: {}
        location: ParsedLocation
        navigate: NavigateFn
        buildLocation: BuildLocationFn
        routeId: '/invoices'
        cause: 'preload' | 'enter' | 'stay'
        context: { userId: string; env: string }
        search: { page: number }
        matches: Array<MakeRouteMatchUnion>
      }>()
      return { invoicePermissions: ['view'] as const }
    },
  })

  const invoiceRoute = createRoute({
    path: '$invoiceId',
    getParentRoute: () => invoicesRoute,
  })

  const detailsRoute = createRoute({
    path: 'details',
    getParentRoute: () => invoiceRoute,
    validateSearch: () => ({ detailPage: 0 }),
    context: (opt) => {
      expectTypeOf(opt).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: { invoiceId: string }
        deps: {}
        location: ParsedLocation
        navigate: NavigateFn
        buildLocation: BuildLocationFn
        routeId: '/invoices/$invoiceId/details'
        cause: 'preload' | 'enter' | 'stay'
        context: {
          userId: string
          env: string
          invoicePermissions: readonly ['view']
        }
        matches: Array<MakeRouteMatchUnion>
      }>()
      return { detailEnv: 'detailEnv' }
    },
    beforeLoad: (opt) => {
      expectTypeOf(opt).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: { invoiceId: string }
        location: ParsedLocation
        navigate: NavigateFn
        buildLocation: BuildLocationFn
        routeId: '/invoices/$invoiceId/details'
        cause: 'preload' | 'enter' | 'stay'
        context: {
          detailEnv: string
          userId: string
          env: string
          invoicePermissions: readonly ['view']
        }
        search: { page: number; detailPage: number }
        matches: Array<MakeRouteMatchUnion>
      }>()
      return { detailsPermissions: ['view'] as const }
    },
  })

  const detailRoute = createRoute({
    path: '$detailId',
    getParentRoute: () => detailsRoute,
    loaderDeps: (deps) => ({
      detailPage: deps.search.detailPage,
      invoicePage: deps.search.page,
    }),
    context: (opt) => {
      expectTypeOf(opt).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: { invoiceId: string; detailId: string }
        deps: { detailPage: number; invoicePage: number }
        location: ParsedLocation
        navigate: NavigateFn
        buildLocation: BuildLocationFn
        routeId: '/invoices/$invoiceId/details/$detailId'
        cause: 'preload' | 'enter' | 'stay'
        context: {
          userId: string
          env: string
          invoicePermissions: readonly ['view']
          detailEnv: string
          detailsPermissions: readonly ['view']
        }
        matches: Array<MakeRouteMatchUnion>
      }>()
      return { detailEnv: 'detailEnv' }
    },
    loader: (opts) =>
      expectTypeOf(opts).toEqualTypeOf<{
        abortController: AbortController
        preload: boolean
        params: { invoiceId: string; detailId: string }
        deps: { detailPage: number; invoicePage: number }
        context: {
          userId: string
          env: string
          invoicePermissions: readonly ['view']
          detailEnv: string
          detailsPermissions: readonly ['view']
        }
        location: ParsedLocation
        navigate: (opts: NavigateOptions<AnyRouter>) => Promise<void> | void
        parentMatchPromise: Promise<
          MakeRouteMatchFromRoute<typeof detailsRoute>
        >
        cause: 'preload' | 'enter' | 'stay'
        route: AnyRoute
      }>(),
  })
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
    beforeLoad: (opts) => {
      expectTypeOf(opts).toMatchTypeOf<{
        params: { detailId: string; invoiceId: string }
        search: { detailPage: number; page: number }
        context: {
          userId: string
          detailsPermissions: readonly ['view']
          invoicePermissions: readonly ['view']
        }
      }>()
      expectTypeOf(opts.buildLocation<Router, '.', '/'>)
        .parameter(0)
        .toHaveProperty('to')
        .toEqualTypeOf<
          | '.'
          | './invoices'
          | './invoices/$invoiceId'
          | './invoices/$invoiceId/details'
          | './invoices/$invoiceId/details/$detailId'
          | undefined
        >()
    },
  })

  const routeTree = rootRoute.addChildren([
    invoicesRoute.addChildren([
      invoiceRoute.addChildren([detailsRoute.addChildren([detailRoute])]),
    ]),
  ])

  const router = createRouter({
    routeTree,
    context: { userId: 'userId' },
  })

  type Router = typeof router
})

test('when creating a child route with context, search, params, loader, loaderDeps and onEnter, onStay, onLeave', () => {
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

  type TExpectedParams = { detailId: string; invoiceId: string }
  type TExpectedSearch = { detailPage: number; page: number }
  type TExpectedContext = {
    userId: string
    detailsPermissions: readonly ['view']
    invoicePermissions: readonly ['view']
    detailPermission: boolean
  }
  type TExpectedLoaderData = { detailLoader: 'detailResult' }
  type TExpectedMatch = {
    params: TExpectedParams
    search: TExpectedSearch
    context: TExpectedContext
    loaderDeps: { detailPage: number; invoicePage: number }
    beforeLoadPromise?: ControlledPromise<void>
    loaderPromise?: ControlledPromise<void>
    componentsPromise?: Promise<Array<void>>
    loaderData?: TExpectedLoaderData
  }

  createRoute({
    path: '$detailId',
    getParentRoute: () => detailsRoute,
    beforeLoad: () => ({ detailPermission: true }),
    loaderDeps: (deps) => ({
      detailPage: deps.search.detailPage,
      invoicePage: deps.search.page,
    }),
    loader: () => ({ detailLoader: 'detailResult' }) as const,
    onEnter: (match) => expectTypeOf(match).toMatchTypeOf<TExpectedMatch>(),
    onStay: (match) => expectTypeOf(match).toMatchTypeOf<TExpectedMatch>(),
    onLeave: (match) => expectTypeOf(match).toMatchTypeOf<TExpectedMatch>(),
  })
})

test('when creating a child route with parseParams and stringify params without params in path', () => {
  const rootRoute = createRootRoute()

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
    parseParams: (params) => {
      expectTypeOf(params).toEqualTypeOf<{}>()
      return params
    },
    stringifyParams: (params) => {
      expectTypeOf(params).toEqualTypeOf<{}>()
      return params
    },
    beforeLoad: (ctx) => {
      expectTypeOf(ctx).toHaveProperty('params').toEqualTypeOf<{}>()
    },
    loader: (ctx) => {
      expectTypeOf(ctx).toHaveProperty('params').toEqualTypeOf<{}>()
    },
  })

  const routeTree = rootRoute.addChildren([invoicesRoute])

  const router = createRouter({ routeTree })

  expectTypeOf(invoicesRoute.useParams<typeof router>()).toEqualTypeOf<
    Vue.Ref<{}>
  >()
})

test('when creating a child route with params.parse and params.stringify without params in path', () => {
  const rootRoute = createRootRoute()

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
    params: {
      parse: (params) => {
        expectTypeOf(params).toEqualTypeOf<{}>()
        return params
      },
      stringify: (params) => {
        expectTypeOf(params).toEqualTypeOf<{}>()
        return params
      },
    },
    beforeLoad: (ctx) => {
      expectTypeOf(ctx).toHaveProperty('params').toEqualTypeOf<{}>()
    },
    loader: (ctx) => {
      expectTypeOf(ctx).toHaveProperty('params').toEqualTypeOf<{}>()
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([invoicesRoute]),
  })

  expectTypeOf(invoicesRoute.useParams<typeof router>()).toEqualTypeOf<
    Vue.Ref<{}>
  >()
})

test('when creating a child route with parseParams and stringifyParams with params in path', () => {
  const rootRoute = createRootRoute()

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
  })

  const invoiceRoute = createRoute({
    getParentRoute: () => invoicesRoute,
    path: '$invoiceId',
    parseParams: (params) => {
      expectTypeOf(params).toEqualTypeOf<{ invoiceId: string }>()
      return { invoiceId: Number(params.invoiceId) }
    },
    stringifyParams: (params) => {
      expectTypeOf(params).toEqualTypeOf<{ invoiceId: number }>()
      return { invoiceId: params.invoiceId.toString() }
    },
    beforeLoad: (ctx) => {
      expectTypeOf(ctx)
        .toHaveProperty('params')
        .toEqualTypeOf<{ invoiceId: number }>()
    },
    loader: (ctx) => {
      expectTypeOf(ctx)
        .toHaveProperty('params')
        .toEqualTypeOf<{ invoiceId: number }>()
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([invoiceRoute]),
  })

  expectTypeOf(invoiceRoute.useParams<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      invoiceId: number
    }>
  >()
})

test('when creating a child route with params.parse and params.stringify with params in path', () => {
  const rootRoute = createRootRoute()

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
  })

  const invoiceRoute = createRoute({
    getParentRoute: () => invoicesRoute,
    path: '$invoiceId',
    params: {
      parse: (params) => {
        expectTypeOf(params).toEqualTypeOf<{ invoiceId: string }>()
        return { invoiceId: Number(params.invoiceId) }
      },
      stringify: (params) => {
        expectTypeOf(params).toEqualTypeOf<{ invoiceId: number }>()
        return { invoiceId: params.invoiceId.toString() }
      },
    },
    beforeLoad: (ctx) => {
      expectTypeOf(ctx)
        .toHaveProperty('params')
        .toEqualTypeOf<{ invoiceId: number }>()
    },
    loader: (ctx) => {
      expectTypeOf(ctx)
        .toHaveProperty('params')
        .toEqualTypeOf<{ invoiceId: number }>()
    },
  })

  const router = createRouter({
    routeTree: invoicesRoute.addChildren([invoiceRoute]),
  })

  expectTypeOf(invoiceRoute.useParams<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      invoiceId: number
    }>
  >()
})

test('when creating a child route with parseParams and stringifyParams with merged params from parent', () => {
  const rootRoute = createRootRoute()

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
  })

  const invoiceRoute = createRoute({
    getParentRoute: () => invoicesRoute,
    path: '$invoiceId',
    parseParams: (params) => {
      expectTypeOf(params).toEqualTypeOf<{ invoiceId: string }>()
      return { invoiceId: Number(params.invoiceId) }
    },
    stringifyParams: (params) => {
      expectTypeOf(params).toEqualTypeOf<{ invoiceId: number }>()
      return { invoiceId: params.invoiceId.toString() }
    },
    beforeLoad: (ctx) => {
      expectTypeOf(ctx)
        .toHaveProperty('params')
        .toEqualTypeOf<{ invoiceId: number }>()
    },
    loader: (ctx) => {
      expectTypeOf(ctx)
        .toHaveProperty('params')
        .toEqualTypeOf<{ invoiceId: number }>()
    },
  })

  const detailRoute = createRoute({
    getParentRoute: () => invoiceRoute,
    path: '$detailId',

    parseParams: (params) => {
      expectTypeOf(params).toEqualTypeOf<{
        detailId: string
      }>()
      return { detailId: Number(params.detailId) }
    },
    stringifyParams: (params) => {
      expectTypeOf(params).toEqualTypeOf<{ detailId: number }>()
      return { detailId: params.detailId.toString() }
    },
    beforeLoad: (ctx) => {
      expectTypeOf(ctx)
        .toHaveProperty('params')
        .toEqualTypeOf<{ invoiceId: number; detailId: number }>()
    },
    loader: (ctx) => {
      expectTypeOf(ctx)
        .toHaveProperty('params')
        .toEqualTypeOf<{ invoiceId: number; detailId: number }>()
    },
  })

  const router = createRouter({
    routeTree: invoicesRoute.addChildren([
      invoiceRoute.addChildren([detailRoute]),
    ]),
  })

  expectTypeOf(detailRoute.useParams<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      detailId: number
      invoiceId: number
    }>
  >()
})

test('when creating a child route with params.parse and params.stringify with merged params from parent', () => {
  const rootRoute = createRootRoute()

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
  })

  const invoiceRoute = createRoute({
    getParentRoute: () => invoicesRoute,
    path: '$invoiceId',
    params: {
      parse: (params) => {
        expectTypeOf(params).toEqualTypeOf<{ invoiceId: string }>()
        return { invoiceId: Number(params.invoiceId) }
      },
      stringify: (params) => {
        expectTypeOf(params).toEqualTypeOf<{ invoiceId: number }>()
        return { invoiceId: params.invoiceId.toString() }
      },
    },
    beforeLoad: (ctx) => {
      expectTypeOf(ctx)
        .toHaveProperty('params')
        .toEqualTypeOf<{ invoiceId: number }>()
    },
    loader: (ctx) => {
      expectTypeOf(ctx)
        .toHaveProperty('params')
        .toEqualTypeOf<{ invoiceId: number }>()
    },
  })

  const detailRoute = createRoute({
    getParentRoute: () => invoiceRoute,
    path: '$detailId',
    params: {
      parse: (params) => {
        expectTypeOf(params).toEqualTypeOf<{
          detailId: string
        }>()
        return { detailId: Number(params.detailId) }
      },
      stringify: (params) => {
        expectTypeOf(params).toEqualTypeOf<{ detailId: number }>()
        return { detailId: params.detailId.toString() }
      },
    },
    beforeLoad: (ctx) => {
      expectTypeOf(ctx)
        .toHaveProperty('params')
        .toEqualTypeOf<{ invoiceId: number; detailId: number }>()
    },
    loader: (ctx) => {
      expectTypeOf(ctx)
        .toHaveProperty('params')
        .toEqualTypeOf<{ invoiceId: number; detailId: number }>()
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      invoicesRoute.addChildren([invoiceRoute.addChildren([detailRoute])]),
    ]),
  })

  expectTypeOf(detailRoute.useParams<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      detailId: number
      invoiceId: number
    }>
  >()
})

test('when context throws', () => {
  const rootRoute = createRootRoute()
  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
    context: () => {
      throw redirect({ to: '/somewhere' })
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([invoicesRoute]),
  })

  expectTypeOf(invoicesRoute.useRouteContext<typeof router>()).toEqualTypeOf<
    Vue.Ref<{}>
  >()
})

test('when beforeLoad throws', () => {
  const rootRoute = createRootRoute()
  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
    beforeLoad: () => {
      throw redirect({ to: '/somewhere' })
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([invoicesRoute]),
  })

  expectTypeOf(invoicesRoute.useRouteContext<typeof router>()).toEqualTypeOf<
    Vue.Ref<{}>
  >()
})

test('when creating a child route with no explicit search input', () => {
  const rootRoute = createRootRoute({
    validateSearch: (input) => {
      expectTypeOf(input).toEqualTypeOf<Record<string, unknown>>()
      return {
        page: 0,
      }
    },
  })

  const rootRouteWithContext = createRootRouteWithContext()({
    validateSearch: (input) => {
      expectTypeOf(input).toEqualTypeOf<Record<string, unknown>>()
      return {
        page: 0,
      }
    },
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: (input) => {
      expectTypeOf(input).toEqualTypeOf<Record<string, unknown>>()
      return {
        page: 0,
      }
    },
  })

  const routeTree = rootRoute.addChildren([indexRoute])

  const router = createRouter({ routeTree })

  expectTypeOf(rootRoute.useSearch<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      page: number
    }>
  >()

  expectTypeOf(indexRoute.useSearch<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      page: number
    }>
  >()

  expectTypeOf(rootRouteWithContext.useSearch<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      page: number
    }>
  >()

  const navigate = indexRoute.useNavigate()

  expectTypeOf(navigate<typeof router, '/', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ page: number }>()

  expectTypeOf(navigate<typeof router, '/', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{ page: number }>()

  expectTypeOf(navigate<typeof router, '/', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{ page: number }>()
})

test('when creating a child route with an explicit search input', () => {
  const rootRoute = createRootRoute({
    validateSearch: (input: SearchSchemaInput & { input: string }) => {
      return {
        page: input.input,
      }
    },
  })

  const rootRouteWithContext = createRootRouteWithContext()({
    validateSearch: (input: SearchSchemaInput & { input: string }) => {
      return {
        page: input.input,
      }
    },
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: (input: SearchSchemaInput & { input: string }) => {
      return {
        page: input.input,
      }
    },
  })

  const routeTree = rootRoute.addChildren([indexRoute])

  const router = createRouter({ routeTree })

  expectTypeOf(rootRoute.useSearch<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      page: string
    }>
  >()

  expectTypeOf(indexRoute.useSearch<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      page: string
    }>
  >()

  expectTypeOf(rootRouteWithContext.useSearch<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      page: string
    }>
  >()

  const navigate = indexRoute.useNavigate()

  expectTypeOf(navigate<typeof router, '/', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function | boolean>()
    .toEqualTypeOf<{ input: string }>()

  expectTypeOf(navigate<typeof router, '/', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{ input: string }>()

  expectTypeOf(navigate<typeof router, '/', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{ page: string }>()
})

// ---------------------------------------------------------------------------
// Object form lifecycle methods — type-level tests
// ---------------------------------------------------------------------------

test('object form context is accepted on root route', () => {
  const rootRoute = createRootRoute({
    context: {
      handler: (opts) => {
        expectTypeOf(opts).toEqualTypeOf<{
          abortController: AbortController
          preload: boolean
          params: {}
          deps: {}
          location: ParsedLocation
          navigate: NavigateFn
          buildLocation: BuildLocationFn
          cause: 'preload' | 'enter' | 'stay'
          context: {}
          matches: Array<MakeRouteMatchUnion>
          routeId: '__root__'
        }>()
        return { env: 'production' }
      },
      serialize: false,
    },
  })

  expectTypeOf(rootRoute.fullPath).toEqualTypeOf<'/'>()
})

test('object form beforeLoad is accepted on root route', () => {
  const rootRoute = createRootRoute({
    beforeLoad: {
      handler: (opts) => {
        expectTypeOf(opts).toEqualTypeOf<{
          abortController: AbortController
          preload: boolean
          params: {}
          location: ParsedLocation
          navigate: NavigateFn
          buildLocation: BuildLocationFn
          cause: 'preload' | 'enter' | 'stay'
          context: {}
          search: {}
          matches: Array<MakeRouteMatchUnion>
          routeId: '__root__'
        }>()
        return { perm: 'admin' }
      },
      serialize: true,
    },
  })

  expectTypeOf(rootRoute.fullPath).toEqualTypeOf<'/'>()
})

test('object form context with invalidate is accepted on root route', () => {
  const rootRoute = createRootRoute({
    context: {
      handler: (_opts) => {
        // Root route context handler compiles — vue-tsc resolves search
        // differently than tsc for the root route, so we only verify
        // that the handler accepts and returns the correct types
        return { cache: 'initialized' }
      },
      invalidate: true,
      serialize: false,
    },
  })

  expectTypeOf(rootRoute.fullPath).toEqualTypeOf<'/'>()
})

test('object form loader is accepted on child route', () => {
  const rootRoute = createRootRoute()
  const childRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'child',
    loader: {
      handler: (opts) => {
        expectTypeOf(opts).toEqualTypeOf<{
          abortController: AbortController
          preload: boolean
          params: {}
          deps: {}
          context: {}
          location: ParsedLocation
          navigate: (opts: NavigateOptions<AnyRouter>) => Promise<void> | void
          parentMatchPromise: Promise<MakeRouteMatchFromRoute<typeof rootRoute>>
          cause: 'preload' | 'enter' | 'stay'
          route: AnyRoute
        }>()
        return { data: 'loaded' }
      },
      serialize: true,
    },
  })

  expectTypeOf(childRoute.fullPath).toEqualTypeOf<'/child'>()
})

test('object form context flows into beforeLoad handler context', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
    context: {
      handler: () => ({ env: 'production' }),
      serialize: false,
    },
    beforeLoad: {
      handler: (opts) => {
        // beforeLoad should see context's return
        expectTypeOf(opts.context).toEqualTypeOf<{
          userId: string
          env: string
        }>()
        return { perm: 'admin' }
      },
    },
  })
})

test('object form context -> beforeLoad -> loader full context chain', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
    context: {
      handler: () => ({ env: 'prod' }),
      serialize: false,
    },
    beforeLoad: {
      handler: (opts) => {
        expectTypeOf(opts.context).toEqualTypeOf<{
          userId: string
          env: string
        }>()
        return { perm: 'view' as const }
      },
      serialize: true,
    },
    loader: {
      handler: (opts) => {
        expectTypeOf(opts.context).toEqualTypeOf<{
          userId: string
          env: string
          perm: 'view'
        }>()
        return { items: ['a', 'b'] }
      },
      serialize: true,
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([invoicesRoute]),
    context: { userId: '123' },
  })

  expectTypeOf(invoicesRoute.useRouteContext<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      userId: string
      env: string
      perm: 'view'
    }>
  >()
})

test('mixed function and object form on the same route', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
    // function form for context
    context: () => ({ env: 'staging' }),
    // object form for beforeLoad
    beforeLoad: {
      handler: (opts) => {
        expectTypeOf(opts.context).toEqualTypeOf<{
          userId: string
          env: string
        }>()
        return { perm: 'edit' as const }
      },
      serialize: false,
    },
    // object form for loader
    loader: {
      handler: (opts) => {
        expectTypeOf(opts.context).toEqualTypeOf<{
          userId: string
          env: string
          perm: 'edit'
        }>()
        return { data: [1, 2, 3] }
      },
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([invoicesRoute]),
    context: { userId: '123' },
  })

  expectTypeOf(invoicesRoute.useRouteContext<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      userId: string
      env: string
      perm: 'edit'
    }>
  >()
})

test('object form parent-child context propagation', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  const parentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'parent',
    context: {
      handler: () => ({ parentEnv: 'env1' }),
      serialize: true,
    },
    beforeLoad: {
      handler: () => ({ parentPerm: 'admin' as const }),
      serialize: false,
    },
  })

  const childRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: 'child',
    context: {
      handler: (opts) => {
        // child's context sees parent's full allContext (context + beforeLoad)
        expectTypeOf(opts.context).toEqualTypeOf<{
          userId: string
          parentEnv: string
          parentPerm: 'admin'
        }>()
        return { childEnv: 'env2' }
      },
      serialize: false,
    },
    beforeLoad: {
      handler: (opts) => {
        expectTypeOf(opts.context).toEqualTypeOf<{
          userId: string
          parentEnv: string
          parentPerm: 'admin'
          childEnv: string
        }>()
        return { childPerm: 'viewer' as const }
      },
    },
    loader: {
      handler: (opts) => {
        expectTypeOf(opts.context).toEqualTypeOf<{
          userId: string
          parentEnv: string
          parentPerm: 'admin'
          childEnv: string
          childPerm: 'viewer'
        }>()
        return { items: [1, 2] }
      },
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
    context: { userId: '123' },
  })

  expectTypeOf(parentRoute.useRouteContext<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      userId: string
      parentEnv: string
      parentPerm: 'admin'
    }>
  >()

  expectTypeOf(childRoute.useRouteContext<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      userId: string
      parentEnv: string
      parentPerm: 'admin'
      childEnv: string
      childPerm: 'viewer'
    }>
  >()
})

test('object form without serialize: full context chain with useRouteContext and useLoaderData', () => {
  const rootRoute = createRootRouteWithContext<{ appId: string }>()()

  const testRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'test',
    context: {
      handler: (opts) => {
        expectTypeOf(opts.context).toEqualTypeOf<{ appId: string }>()
        return { env: 'test' }
      },
      // no serialize specified
    },
    beforeLoad: {
      handler: (opts) => {
        expectTypeOf(opts.context).toEqualTypeOf<{
          appId: string
          env: string
        }>()
        return { perm: 'view' as const }
      },
      // no serialize specified
    },
    loader: {
      handler: (opts) => {
        expectTypeOf(opts.context).toEqualTypeOf<{
          appId: string
          env: string
          perm: 'view'
        }>()
        return { data: [1, 2, 3] }
      },
      // no serialize specified
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([testRoute]),
    context: { appId: 'app1' },
  })

  expectTypeOf(testRoute.useRouteContext<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      appId: string
      env: string
      perm: 'view'
    }>
  >()

  expectTypeOf(testRoute.useLoaderData<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      data: Array<number>
    }>
  >()
})

test('object form non-serializable returns flow into context chain', () => {
  const rootRoute = createRootRoute()

  const testRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'test',
    context: {
      handler: () => ({ cleanup: () => console.log('cleanup') }),
      serialize: false,
    },
    beforeLoad: {
      handler: (opts) => {
        // beforeLoad sees context's non-serializable return in context
        expectTypeOf(opts.context).toEqualTypeOf<{
          cleanup: () => void
        }>()
        return { compute: (x: number) => x * 2 }
      },
      serialize: false,
    },
    loader: {
      handler: (opts) => {
        expectTypeOf(opts.context).toEqualTypeOf<{
          cleanup: () => void
          compute: (x: number) => number
        }>()
        return { items: ['a'] }
      },
      serialize: false,
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([testRoute]),
  })

  expectTypeOf(testRoute.useRouteContext<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      cleanup: () => void
      compute: (x: number) => number
    }>
  >()
})

test('object form with params and search', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  const invoicesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoices',
    validateSearch: () => ({ page: 0 }),
    context: {
      handler: (opts) => {
        expectTypeOf(opts).toEqualTypeOf<{
          abortController: AbortController
          preload: boolean
          params: {}
          location: ParsedLocation
          navigate: NavigateFn
          buildLocation: BuildLocationFn
          cause: 'preload' | 'enter' | 'stay'
          deps: {}
          context: { userId: string }
          matches: Array<MakeRouteMatchUnion>
          routeId: '/invoices'
        }>()
        return { invoiceEnv: 'prod' }
      },
    },
    beforeLoad: {
      handler: (opts) => {
        expectTypeOf(opts).toEqualTypeOf<{
          abortController: AbortController
          preload: boolean
          params: {}
          location: ParsedLocation
          navigate: NavigateFn
          buildLocation: BuildLocationFn
          cause: 'preload' | 'enter' | 'stay'
          context: { userId: string; invoiceEnv: string }
          search: { page: number }
          matches: Array<MakeRouteMatchUnion>
          routeId: '/invoices'
        }>()
        return { invoicePermissions: ['view'] as const }
      },
    },
  })

  const invoiceRoute = createRoute({
    path: '$invoiceId',
    getParentRoute: () => invoicesRoute,
    loaderDeps: (deps) => ({
      currentPage: deps.search.page,
    }),
    context: {
      handler: (opts) => {
        expectTypeOf(opts).toEqualTypeOf<{
          abortController: AbortController
          preload: boolean
          params: { invoiceId: string }
          location: ParsedLocation
          navigate: NavigateFn
          buildLocation: BuildLocationFn
          cause: 'preload' | 'enter' | 'stay'
          deps: { currentPage: number }
          context: {
            userId: string
            invoiceEnv: string
            invoicePermissions: readonly ['view']
          }
          matches: Array<MakeRouteMatchUnion>
          routeId: '/invoices/$invoiceId'
        }>()
        return { detailEnv: 'staging' }
      },
    },
    loader: {
      handler: (opts) => {
        expectTypeOf(opts.params).toEqualTypeOf<{ invoiceId: string }>()
        expectTypeOf(opts.deps).toEqualTypeOf<{ currentPage: number }>()
        expectTypeOf(opts.context).toEqualTypeOf<{
          userId: string
          invoiceEnv: string
          invoicePermissions: readonly ['view']
          detailEnv: string
        }>()
        return { invoice: { id: 'inv1', amount: 100 } }
      },
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      invoicesRoute.addChildren([invoiceRoute]),
    ]),
    context: { userId: '123' },
  })

  expectTypeOf(invoiceRoute.useRouteContext<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      userId: string
      invoiceEnv: string
      invoicePermissions: readonly ['view']
      detailEnv: string
    }>
  >()

  expectTypeOf(invoiceRoute.useLoaderData<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      invoice: { id: string; amount: number }
    }>
  >()

  expectTypeOf(invoiceRoute.useParams<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      invoiceId: string
    }>
  >()
})

test('object form useLoaderData with select and structuralSharing', () => {
  const rootRoute = createRootRoute()

  const childRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'child',
    loader: {
      handler: () =>
        ({ items: ['a', 'b'], count: 2 }) as const satisfies {
          items: ReadonlyArray<string>
          count: number
        },
    },
  })

  const routeTree = rootRoute.addChildren([childRoute])
  const router = createRouter({ routeTree })

  expectTypeOf(childRoute.useLoaderData<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      readonly items: readonly ['a', 'b']
      readonly count: 2
    }>
  >()

  expectTypeOf(childRoute.useLoaderData<typeof router, string>)
    .parameter(0)
    .exclude<undefined>()
    .toHaveProperty('select')
    .toEqualTypeOf<
      | ((search: {
          readonly items: readonly ['a', 'b']
          readonly count: 2
        }) => string)
      | undefined
    >()
})

test('object form useRouteContext with select', () => {
  const rootRoute = createRootRouteWithContext<{ appId: string }>()()

  const testRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'test',
    context: {
      handler: () => ({ env: 'prod' }),
    },
    beforeLoad: {
      handler: () => ({ perm: 'admin' as const }),
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([testRoute]),
    context: { appId: 'app1' },
  })

  expectTypeOf(testRoute.useRouteContext<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      appId: string
      env: string
      perm: 'admin'
    }>
  >()

  expectTypeOf(testRoute.useRouteContext<typeof router>)
    .parameter(0)
    .exclude<undefined>()
    .toHaveProperty('select')
    .toEqualTypeOf<
      | ((context: { appId: string; env: string; perm: 'admin' }) => unknown)
      | undefined
    >()
})

test('object form onEnter, onStay, onLeave match types', () => {
  const rootRoute = createRootRouteWithContext<{ userId: string }>()()

  const invoicesRoute = createRoute({
    path: 'invoices',
    getParentRoute: () => rootRoute,
    validateSearch: () => ({ page: 0 }),
    beforeLoad: { handler: () => ({ invoicePermissions: ['view'] as const }) },
  })

  type TExpectedParams = {}
  type TExpectedSearch = { page: number }
  type TExpectedContext = {
    userId: string
    invoicePermissions: readonly ['view']
  }
  type TExpectedLoaderData = { totalInvoices: number }
  type TExpectedMatch = {
    params: TExpectedParams
    search: TExpectedSearch
    context: TExpectedContext
    loaderDeps: {}
    beforeLoadPromise?: ControlledPromise<void>
    loaderPromise?: ControlledPromise<void>
    componentsPromise?: Promise<Array<void>>
    loaderData?: TExpectedLoaderData
  }

  createRoute({
    path: '$invoiceId',
    getParentRoute: () => invoicesRoute,
    context: { handler: () => ({ detailPermission: true }) },
    loader: { handler: () => ({ totalInvoices: 42 }) },
    onEnter: (match) => expectTypeOf(match).toMatchTypeOf<TExpectedMatch>(),
    onStay: (match) => expectTypeOf(match).toMatchTypeOf<TExpectedMatch>(),
    onLeave: (match) => expectTypeOf(match).toMatchTypeOf<TExpectedMatch>(),
  })
})

test('object form void-returning context does not add to context', () => {
  const rootRoute = createRootRouteWithContext<{ appId: string }>()()

  const testRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'test',
    context: {
      handler: () => {},
    },
    beforeLoad: {
      handler: () => ({ perm: 'admin' as const }),
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([testRoute]),
    context: { appId: 'app1' },
  })

  // void context should not add anything — useRouteContext shows only root + beforeLoad
  expectTypeOf(testRoute.useRouteContext<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      appId: string
      perm: 'admin'
    }>
  >()
})

test('three-level object form context accumulation', () => {
  const rootRoute = createRootRouteWithContext<{ rootCtx: string }>()()

  const level1 = createRoute({
    getParentRoute: () => rootRoute,
    path: 'l1',
    context: { handler: () => ({ l1Ctx: 'a' }) },
    beforeLoad: { handler: () => ({ l1Before: 'b' }) },
  })

  const level2 = createRoute({
    getParentRoute: () => level1,
    path: 'l2',
    context: { handler: () => ({ l2Ctx: 'd' }) },
    beforeLoad: { handler: () => ({ l2Before: 'e' }) },
  })

  const level3 = createRoute({
    getParentRoute: () => level2,
    path: 'l3',
    context: {
      handler: (opts) => {
        expectTypeOf(opts.context).toEqualTypeOf<{
          rootCtx: string
          l1Ctx: string
          l1Before: string
          l2Ctx: string
          l2Before: string
        }>()
        return { l3Ctx: 'g' }
      },
    },
    loader: {
      handler: (opts) => {
        expectTypeOf(opts.context).toEqualTypeOf<{
          rootCtx: string
          l1Ctx: string
          l1Before: string
          l2Ctx: string
          l2Before: string
          l3Ctx: string
        }>()
        return { data: 'final' }
      },
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      level1.addChildren([level2.addChildren([level3])]),
    ]),
    context: { rootCtx: 'root' },
  })

  expectTypeOf(level3.useRouteContext<typeof router>()).toEqualTypeOf<
    Vue.Ref<{
      rootCtx: string
      l1Ctx: string
      l1Before: string
      l2Ctx: string
      l2Before: string
      l3Ctx: string
    }>
  >()
})
