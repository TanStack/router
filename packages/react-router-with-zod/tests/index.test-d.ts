import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
} from '@tanstack/react-router'
import { test, expectTypeOf } from 'vitest'
import { zodSearchValidator } from '../src'
import { z } from 'zod'

test('when creating a route with zod validation', () => {
  const rootRoute = createRootRoute({
    validateSearch: zodSearchValidator(
      z.object({
        page: z.number().optional().default(0),
      }),
    ),
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: zodSearchValidator(
      z.object({
        indexPage: z.number().optional().default(0),
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

test('when creating a route with zod validation where input is output', () => {
  const rootRoute = createRootRoute({
    validateSearch: zodSearchValidator(
      z.object({
        page: z.number().optional().default(0),
      }),
    ),
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: zodSearchValidator({
      schema: z.object({
        indexPage: z.number().optional().default(0),
      }),
      input: 'output',
    }),
  })

  const routeTree = rootRoute.addChildren([indexRoute])

  const router = createRouter({ routeTree })

  expectTypeOf(Link<typeof router, string, '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<Function | true>()
    .toEqualTypeOf<{ page?: number; indexPage: number }>()

  expectTypeOf(Link<typeof router, string, '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .returns.toEqualTypeOf<{ page?: number; indexPage: number }>()

  expectTypeOf(Link<typeof router, '/', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{ page: number } | { page: number; indexPage: number }>()

  expectTypeOf(rootRoute.useSearch()).toEqualTypeOf<{ page: number }>()
  expectTypeOf(rootRoute.useSearch()).toEqualTypeOf<{ page: number }>
})
