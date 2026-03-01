import { expectTypeOf, test } from 'vitest'
import { createFileRoute, createLazyFileRoute, createRootRoute } from '../src'

const _rootRoute = createRootRoute()

const _indexRoute = createFileRoute('/')()
const invoicesRoute = createFileRoute('/invoices')()
const invoiceRoute = createFileRoute('/invoices/$invoiceId')()
const _postLayoutRoute = createFileRoute('/_postLayout')()
const postsRoute = createFileRoute('/_postLayout/posts')()
const postRoute = createFileRoute('/_postLayout/posts/$postId_')()
const protectedRoute = createFileRoute('/(auth)/protected')()

declare module '@tanstack/router-core' {
  interface FileRoutesByPath {
    '/': {
      preLoaderRoute: typeof _indexRoute
      parentRoute: typeof _rootRoute
      id: string
      fullPath: string
      path: string
    }
    '/(auth)/protected': {
      preLoaderRoute: typeof protectedRoute
      parentRoute: typeof _rootRoute
      id: '/protected'
      fullPath: '/protected'
      path: '(auth)/protected'
    }
    '/invoices': {
      preLoaderRoute: typeof invoicesRoute
      parentRoute: typeof _indexRoute
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
      preLoaderRoute: typeof _postLayoutRoute
      parentRoute: typeof _rootRoute
      id: string
      fullPath: string
      path: string
    }
    '/_postLayout/posts': {
      preLoaderRoute: typeof postsRoute
      parentRoute: typeof _postLayoutRoute
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

test('createLazyFileRoute supports typed lazy route for file id', () => {
  const lazyInvoiceRoute = createLazyFileRoute('/invoices/$invoiceId')({})
  expectTypeOf(lazyInvoiceRoute.injectParams).toBeFunction()
  expectTypeOf(lazyInvoiceRoute.injectNavigate).toBeFunction()
})
