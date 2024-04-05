import { expectTypeOf, test } from 'vitest'
import { createFileRoute, createRootRoute } from '../src'

const rootRoute = createRootRoute()

const indexRoute = createFileRoute('/')()

const invoicesRoute = createFileRoute('/invoices')()

const invoiceRoute = createFileRoute('/invoices/$invoiceId')()

const postLayoutRoute = createFileRoute('/_postLayout')()

const postsRoute = createFileRoute('/_postLayout/posts')()

const postRoute = createFileRoute('/_postLayout/posts/$postId_')()

const authRoute = createFileRoute('/(auth)')()

const protectedRoute = createFileRoute('/(auth)/protected')()

declare module '../src/fileRoute' {
  interface FileRoutesByPath {
    '/': {
      preLoaderRoute: typeof indexRoute
      parentRoute: typeof rootRoute
    }
    '/(auth)': {
      preLoaderRoute: typeof authRoute
      parentRoute: typeof rootRoute
    }
    '/(auth)/protected': {
      preLoaderRoute: typeof protectedRoute
      parentRoute: typeof authRoute
    }
    '/invoices': {
      preLoaderRoute: typeof invoicesRoute
      parentRoute: typeof indexRoute
    }
    '/invoices/$invoiceId': {
      preLoaderRoute: typeof invoiceRoute
      parentRoute: typeof invoicesRoute
    }
    '/_postLayout': {
      preLoaderRoute: typeof postLayoutRoute
      parentRoute: typeof rootRoute
    }
    '/_postLayout/posts': {
      preLoaderRoute: typeof postsRoute
      parentRoute: typeof postLayoutRoute
    }
    '/_postLayout/posts/$postId_': {
      preLoaderRoute: typeof postRoute
      parentRoute: typeof postsRoute
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
  expectTypeOf<'/protected'>(protectedRoute.path)
  expectTypeOf<'/protected'>(protectedRoute.id)
})
