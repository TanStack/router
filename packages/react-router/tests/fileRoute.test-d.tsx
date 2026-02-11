import { expectTypeOf, test } from 'vitest'
import { createFileRoute, createRootRoute } from '../src'

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

test('file route object lifecycle options compile', () => {
  const objectRoute = createFileRoute('/invoices')({
    context: {
      handler: () => ({ createdAt: new Date() }),
      revalidate: true,
      dehydrate: ({ data }) => ({
        createdAt: data.createdAt.toISOString(),
      }),
      hydrate: ({ data }) => ({
        createdAt: new Date(data.createdAt),
      }),
    },
    beforeLoad: {
      handler: (ctx) => {
        expectTypeOf(ctx.context).toEqualTypeOf<{ createdAt: Date }>()
        return { permission: 'view' as const }
      },
      dehydrate: true,
    },
    loader: {
      handler: (ctx) => {
        expectTypeOf(ctx.context).toEqualTypeOf<{
          createdAt: Date
          permission: 'view'
        }>()
        return { loadedAt: new Date() }
      },
      dehydrate: ({ data }) => ({
        loadedAt: data.loadedAt.toISOString(),
      }),
      hydrate: ({ data }) => ({
        loadedAt: new Date(data.loadedAt),
      }),
    },
  })

  expectTypeOf(objectRoute.fullPath).toEqualTypeOf<'/invoices'>()
})

test('file route dehydrate fn requires hydrate', () => {
  createFileRoute('/invoices')({
    // @ts-expect-error dehydrate function requires hydrate
    context: {
      handler: () => ({ createdAt: new Date() }),
      dehydrate: ({ data }) => ({
        createdAt: data.createdAt.toISOString(),
      }),
    },
  })
})
