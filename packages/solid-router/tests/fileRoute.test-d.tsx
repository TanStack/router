import { expectTypeOf, test } from 'vitest'
import { createFileRoute, createRootRoute } from '../src'
import type {
  AnyContext,
  AnyRoute,
  DefaultLifecycleDehydrateFn,
  Route,
} from '@tanstack/router-core'

declare module '@tanstack/router-core' {
  interface FilebaseRouteOptionsInterface<
    TRegister,
    TParentRoute extends AnyRoute = AnyRoute,
    TId extends string = string,
    TPath extends string = string,
    TSearchValidator = undefined,
    TParams = {},
    TLoaderDeps extends Record<string, any> = {},
    TLoaderFn = undefined,
    TRouterContext = {},
    TContextFn = AnyContext,
    TBeforeLoadFn = AnyContext,
    TRemountDepsFn = AnyContext,
    TSSR = unknown,
    TServerMiddlewares = unknown,
    THandlers = undefined,
    TContextDehydrateFn = DefaultLifecycleDehydrateFn<TContextFn>,
    TBeforeLoadDehydrateFn = DefaultLifecycleDehydrateFn<TBeforeLoadFn>,
    TLoaderDehydrateFn = DefaultLifecycleDehydrateFn<TLoaderFn>,
  > {
    server?: {
      middleware?: TServerMiddlewares
    }
  }

  interface RouteTypes<
    in out TRegister,
    in out TParentRoute extends AnyRoute,
    in out TPath extends string,
    in out TFullPath extends string,
    in out TCustomId extends string,
    in out TId extends string,
    in out TSearchValidator,
    in out TParams,
    in out TRouterContext,
    in out TContextFn,
    in out TBeforeLoadFn,
    in out TLoaderDeps,
    in out TLoaderFn,
    in out TChildren,
    in out TFileRouteTypes,
    in out TSSR,
    in out TServerMiddlewares,
    in out THandlers,
  > {
    middleware: TServerMiddlewares
  }
}

const rootRoute = createRootRoute()

const indexRoute = createFileRoute('/')()

const invoicesRoute = createFileRoute('/invoices')()

const invoiceRoute = createFileRoute('/invoices/$invoiceId')()

const postLayoutRoute = createFileRoute('/_postLayout')()

const postsRoute = createFileRoute('/_postLayout/posts')()

const postRoute = createFileRoute('/_postLayout/posts/$postId_')()

const protectedRoute = createFileRoute('/(auth)/protected')()

declare module '@tanstack/router-core' {
  interface FileRoutesByPath {
    '/': {
      preLoaderRoute: typeof indexRoute
      parentRoute: typeof rootRoute
      id: string
      fullPath: string
      path: string
    }
    '/(auth)/protected': {
      preLoaderRoute: typeof protectedRoute
      parentRoute: typeof rootRoute
      id: '/protected'
      fullPath: '/protected'
      path: '(auth)/protected'
    }
    '/invoices': {
      preLoaderRoute: typeof invoicesRoute
      parentRoute: typeof indexRoute
      id: '/invoices'
      fullPath: '/invoices'
      path: 'invoices'
    }
    '/invoices/$invoiceId': {
      preLoaderRoute: typeof invoiceRoute
      parentRoute: typeof invoicesRoute
      id: '/invoices/$invoiceId'
      fullPath: '/invoices/$invoiceId'
      path: '/$invoiceId'
    }
    '/_postLayout': {
      preLoaderRoute: typeof postLayoutRoute
      parentRoute: typeof rootRoute
      id: string
      fullPath: string
      path: string
    }
    '/_postLayout/posts': {
      preLoaderRoute: typeof postsRoute
      parentRoute: typeof postLayoutRoute
      id: '/_postLayout/posts'
      fullPath: '/posts'
      path: '/posts'
    }
    '/_postLayout/posts/$postId_': {
      preLoaderRoute: typeof postRoute
      parentRoute: typeof postsRoute
      id: '/_postLayout/posts/$postId_'
      fullPath: '/posts/$postId'
      path: '/$postId_'
    }
  }
}

test('when creating a file route with a static route', () => {
  expectTypeOf<'/invoices'>(invoicesRoute.fullPath)
  expectTypeOf<'/invoices'>(invoicesRoute.id)
  expectTypeOf<'invoices'>(invoicesRoute.path)
})

test('when creating a file route with params', () => {
  expectTypeOf<'/invoices/$invoiceId'>(invoiceRoute.fullPath)
  expectTypeOf<'/invoices/$invoiceId'>(invoiceRoute.id)
  expectTypeOf<'/$invoiceId'>(invoiceRoute.path)
})

test('when creating a layout route', () => {
  expectTypeOf<'/posts'>(postsRoute.fullPath)
  expectTypeOf<'/_postLayout/posts'>(postsRoute.id)
  expectTypeOf<'/posts'>(postsRoute.path)
})

test('when creating a _ suffix route', () => {
  expectTypeOf<'/posts/$postId'>(postRoute.fullPath)
  expectTypeOf<'/$postId_'>(postRoute.path)
  expectTypeOf<'/_postLayout/posts/$postId_'>(postRoute.id)
})

test('when creating a folder group', () => {
  expectTypeOf<'/protected'>(protectedRoute.fullPath)
  expectTypeOf<'(auth)/protected'>(protectedRoute.path)
  expectTypeOf<'/protected'>(protectedRoute.id)
})

test('when creating a file route with middleware options', () => {
  type Middleware = { readonly middleware: 'middleware' }
  const middleware = { middleware: 'middleware' } as const

  const route = createFileRoute('/invoices')({
    server: {
      middleware: [middleware],
    },
  })

  type ExtractMiddlewares<TRoute> =
    TRoute extends Route<
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      infer TMiddlewares,
      any
    >
      ? TMiddlewares
      : never

  expectTypeOf<ExtractMiddlewares<typeof route>>().toEqualTypeOf<
    readonly [Middleware]
  >()
})
