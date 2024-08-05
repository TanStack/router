import {
  Link,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { expectTypeOf, test } from 'vitest'
import { type } from 'arktype'
import { arkTypeSearchValidator } from '../src'

test('when creating a route with arktype validation', () => {
  const rootRoute = createRootRoute({
    validateSearch: arkTypeSearchValidator(
      type({
        page: 'number = 0',
      }),
    ),
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: arkTypeSearchValidator(
      type({
        indexPage: 'number = 0',
      }),
    ),
  })

  const routeTree = rootRoute.addChildren([indexRoute])

  const router = createRouter({ routeTree })

  expectTypeOf(Link<typeof router, string, '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function | true>()
    .toEqualTypeOf<{ page?: number; indexPage?: number } | undefined>()

  expectTypeOf(Link<typeof router, string, '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{ page?: number; indexPage?: number }>()

  expectTypeOf(Link<typeof router, '/', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{ page: number } | { page: number; indexPage: number }>()

  expectTypeOf(rootRoute.useSearch()).toEqualTypeOf<{ page: number }>()
  expectTypeOf(rootRoute.useSearch()).toEqualTypeOf<{ page: number }>
})

test('when using arktype schema with function', () => {
  const rootRoute = createRootRoute({
    validateSearch: (input) =>
      type({
        page: 'number = 0',
      }).assert(input),
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: (input) =>
      type({
        indexPage: 'number = 0',
      }).assert(input),
  })

  const routeTree = rootRoute.addChildren([indexRoute])

  const router = createRouter({ routeTree })

  expectTypeOf(Link<typeof router, string, '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function | true>()
    .toEqualTypeOf<{ page: number; indexPage: number }>()

  expectTypeOf(Link<typeof router, string, '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{ page: number; indexPage: number }>()

  expectTypeOf(Link<typeof router, '/', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{ page: number } | { page: number; indexPage: number }>()

  expectTypeOf(rootRoute.useSearch()).toEqualTypeOf<{ page: number }>()
  expectTypeOf(rootRoute.useSearch()).toEqualTypeOf<{ page: number }>
})
