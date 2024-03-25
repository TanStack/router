import { test, expectTypeOf } from 'vitest'
import { Link, createRoute } from '../src'
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

const routeTree = rootRoute.addChildren([
  postsRoute.addChildren([postRoute, postsIndexRoute]),
  invoicesRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
  indexRoute,
])

type RouteTree = typeof routeTree

test('when navigating to the root, to autocompletes to all routes, ../ and ./', () => {
  expectTypeOf(Link<RouteTree, string, '/'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '/'
      | '/posts'
      | '/posts/'
      | '/posts/$postId'
      | '/invoices'
      | '/invoices/'
      | '/invoices/$invoiceId'
      | '../'
      | './'
      | undefined
    >()
})

test('when navigating from a static route to the root, to autocompletes to all routes', () => {
  expectTypeOf(Link<RouteTree, '/posts/', '/'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '/'
      | '/posts'
      | '/posts/'
      | '/posts/$postId'
      | '/invoices'
      | '/invoices/'
      | '/invoices/$invoiceId'
      | '../'
      | './'
      | undefined
    >()
})

test('when navigating from a static route to the current route, to autocompletes to relative routes', () => {
  expectTypeOf(Link<RouteTree, '/posts/', './'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<'./$postId' | undefined | './'>()
})

test('when navigating from a static route to the parent route, to autocompletes to relative routes', () => {
  expectTypeOf(Link<RouteTree, '/posts', '../'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '../posts'
      | '../posts/'
      | '../posts/$postId'
      | '../invoices/$invoiceId'
      | '../invoices'
      | '../invoices/'
      | '../'
      | undefined
    >()
})

test('from autocompletes to all absolute routes', () => {
  const TestLink = Link<RouteTree, '/', '/'>
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
      | undefined
    >()
})

test('when navigating to the same route params is optional', () => {
  const TestLink = Link<RouteTree, string, string>
  expectTypeOf(TestLink).parameter(0).not.toMatchTypeOf<{ params: unknown }>()
})

test('when naviating to the same route params can be true', () => {
  const TestLink = Link<RouteTree, string, string>
  expectTypeOf(TestLink)
    .parameter(0)
    .toHaveProperty('params')
    .extract<boolean>()
    .toEqualTypeOf<true>()
})

test('when navigating to the parent route params is optional', () => {
  const TestLink = Link<RouteTree, string, '..'>
  expectTypeOf(TestLink).parameter(0).not.toMatchTypeOf<{ params: unknown }>()
})

test('when navigating to the parent route params can be true', () => {
  const TestLink = Link<RouteTree, string, '..'>
  expectTypeOf(TestLink)
    .parameter(0)
    .toHaveProperty('params')
    .extract<boolean>()
    .toEqualTypeOf<true>()
})

test('when navigating from a route with params to the same route, params is optional', () => {
  const TestLink = Link<RouteTree, '/posts/$postId', string>
  expectTypeOf(TestLink).parameter(0).not.toMatchTypeOf<{ params: unknown }>()
})

test('when navigating from a route with params to the same route, params can be true', () => {
  const TestLink = Link<RouteTree, '/posts/$postId', string>
  expectTypeOf(TestLink)
    .parameter(0)
    .toHaveProperty('params')
    .extract<boolean>()
    .toEqualTypeOf<true>()
})

test('when navigating to a route with params, params is required', () => {
  const TestLink = Link<RouteTree, string, '/posts/$postId/'>
  expectTypeOf(TestLink).parameter(0).toMatchTypeOf<{ params: unknown }>()
})

test('when navigating to a route with params, params can be a object of required params', () => {
  const TestLink = Link<RouteTree, string, '/posts/$postId/'>
  const params = expectTypeOf(TestLink).parameter(0).toHaveProperty('params')

  params.exclude<Function | boolean>().toMatchTypeOf<{ postId: string }>()
})

test('when navigating to a route with params, params is a function from all params to next params', () => {
  const TestLink = Link<RouteTree, string, '/posts/$postId/'>
  const params = expectTypeOf(TestLink)
    .parameter(0)
    .toHaveProperty('params')
    .extract<Function>()

  params.returns.toEqualTypeOf<{ postId: string }>()
  params
    .parameter(0)
    .toEqualTypeOf<{} | { invoiceId: string } | { postId: string }>()
})

test('when navigating from a route with no params to a route with params, params are required', () => {
  const TestLink = Link<RouteTree, '/invoices/', './$invoiceId/'>

  expectTypeOf(TestLink).parameter(0).toMatchTypeOf<{ params: unknown }>()
})

test('when navigating from a route with no params to a route with params, params can be an object of required params', () => {
  const TestLink = Link<RouteTree, '/invoices/', './$invoiceId/'>
  const params = expectTypeOf(TestLink).parameter(0).toHaveProperty('params')

  params.exclude<Function | boolean>().toMatchTypeOf<{ invoiceId: string }>()
})

test('when navigating from a route with no params to a route with params, params is a function from no params to next params', () => {
  const TestLink = Link<RouteTree, '/invoices/', './$invoiceId/'>
  const params = expectTypeOf(TestLink)
    .parameter(0)
    .toHaveProperty('params')
    .extract<Function>()

  params.returns.branded.toEqualTypeOf<{ invoiceId: string }>()
  params.parameter(0).toEqualTypeOf<{}>()
})

test('when navigating to the same route search is optional', () => {
  const TestLink = Link<RouteTree, string, string>
  expectTypeOf(TestLink).parameter(0).not.toMatchTypeOf<{ search: unknown }>()
})

test('when navigating to the same search params can be true', () => {
  const TestLink = Link<RouteTree, string, string>
  expectTypeOf(TestLink)
    .parameter(0)
    .toHaveProperty('search')
    .extract<boolean>()
    .toEqualTypeOf<true>()
})

test('when navigating to the parent route search params is optional', () => {
  const TestLink = Link<RouteTree, string, '..'>
  expectTypeOf(TestLink).parameter(0).not.toMatchTypeOf<{ search: unknown }>()
})

test('when navigating to the parent route search params can be true', () => {
  const TestLink = Link<RouteTree, string, '..'>
  expectTypeOf(TestLink)
    .parameter(0)
    .toHaveProperty('search')
    .extract<boolean>()
    .toEqualTypeOf<true>()
})

test('when navigating from a route with search params to the same route, search params is required', () => {
  const TestLink = Link<RouteTree, '/invoices/$invoiceId/', string>
  expectTypeOf(TestLink).parameter(0).toMatchTypeOf<{ search: unknown }>()
})

test('when navigating from a route with search params to the same route, search params can be true', () => {
  const TestLink = Link<RouteTree, '/invoices/$invoiceId', string>
  expectTypeOf(TestLink)
    .parameter(0)
    .toHaveProperty('search')
    .extract<boolean>()
    .toEqualTypeOf<true>()
})

test('when navigating to a route with search params, search params is required', () => {
  const TestLink = Link<RouteTree, string, '/invoices/$invoiceId/'>
  expectTypeOf(TestLink).parameter(0).toMatchTypeOf<{ search: unknown }>()
})

test('when navigating to a route with search params, search params can be a object of required params', () => {
  const TestLink = Link<RouteTree, string, '/invoices/$invoiceId/'>
  const params = expectTypeOf(TestLink).parameter(0).toHaveProperty('search')

  params.exclude<Function | boolean>().toMatchTypeOf<{ page: number }>()
})

test('when navigating to a route with search params, search params is a function from all params to current params', () => {
  const TestLink = Link<RouteTree, string, '/invoices/$invoiceId'>
  const params = expectTypeOf(TestLink)
    .parameter(0)
    .toHaveProperty('search')
    .extract<Function>()

  params.returns.toEqualTypeOf<{ page: number }>()
  params.parameter(0).toEqualTypeOf<{} | { page: number }>()
})

test('when navigating from a route with no search params to a route with search params, search params are required', () => {
  const TestLink = Link<RouteTree, '/invoices/', './$invoiceId/'>

  expectTypeOf(TestLink).parameter(0).toMatchTypeOf<{ search: unknown }>()
})

test('when navigating from a route with no search params to a route with search params, search params can be an object of required params', () => {
  const TestLink = Link<RouteTree, '/invoices/', './$invoiceId/'>
  const params = expectTypeOf(TestLink).parameter(0).toHaveProperty('search')

  params.exclude<Function | boolean>().toMatchTypeOf<{ page: number }>()
})

test('when navigating to a route with search params, search params is a function from all search params to current search params', () => {
  const TestLink = Link<RouteTree, '/invoices/', './$invoiceId/'>
  const params = expectTypeOf(TestLink)
    .parameter(0)
    .toHaveProperty('search')
    .extract<Function>()

  params.returns.branded.toEqualTypeOf<{ page: number }>()
  params.parameter(0).toEqualTypeOf<{}>()
})
