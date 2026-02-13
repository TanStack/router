import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
} from '@tanstack/react-router'
import { test, expectTypeOf } from 'vitest'
import { zodValidator } from '../src'
import * as z3 from 'zod/v3'
import * as z4 from 'zod/v4'

test('when creating a route with zod validation', () => {
  const rootRoute = createRootRoute({
    validateSearch: zodValidator(
      z3.object({
        page: z3.number().optional().default(0),
      }),
    ),
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: zodValidator(
      z3.object({
        indexPage: z3.number().optional().default(0),
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

  expectTypeOf(rootRoute.useSearch<typeof router>()).toEqualTypeOf<{
    page: number
  }>()
  expectTypeOf(rootRoute.useSearch<typeof router>()).toEqualTypeOf<{
    page: number
  }>
})

test('when creating a route with zod validation where input is output', () => {
  const rootRoute = createRootRoute({
    validateSearch: zodValidator(
      z3.object({
        page: z3.number().optional().default(0),
      }),
    ),
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: zodValidator({
      schema: z3.object({
        indexPage: z3.number().optional().default(0),
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

  expectTypeOf(rootRoute.useSearch<typeof router>()).toEqualTypeOf<{
    page: number
  }>()
  expectTypeOf(rootRoute.useSearch<typeof router>()).toEqualTypeOf<{
    page: number
  }>
})

test('when creating a route with zod validation where output is input', () => {
  const rootRoute = createRootRoute({
    validateSearch: zodValidator({
      schema: z3.object({
        page: z3.number().optional().default(0),
      }),
      output: 'input',
    }),
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: zodValidator({
      schema: z3.object({
        indexPage: z3.number().optional().default(0),
      }),
      output: 'input',
    }),
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
    .toEqualTypeOf<{ page?: number } | { page?: number; indexPage?: number }>()

  expectTypeOf(rootRoute.useSearch<typeof router>()).toEqualTypeOf<{
    page?: number
  }>()
  expectTypeOf(rootRoute.useSearch<typeof router>()).toEqualTypeOf<{
    page?: number
  }>
})

test('when using zod schema without adapter', () => {
  const rootRoute = createRootRoute({
    validateSearch: z3.object({
      page: z3.number().optional().default(0),
    }),
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: z3.object({
      indexPage: z3.number().optional().default(0),
    }),
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

  expectTypeOf(rootRoute.useSearch<typeof router>()).toEqualTypeOf<{
    page: number
  }>()
  expectTypeOf(rootRoute.useSearch<typeof router>()).toEqualTypeOf<{
    page: number
  }>
})

test('when using zod schema with function', () => {
  const rootRoute = createRootRoute({
    validateSearch: (input) =>
      z3
        .object({
          page: z3.number().optional().default(0),
        })
        .parse(input),
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: (input) =>
      z3
        .object({
          indexPage: z3.number().optional().default(0),
        })
        .parse(input),
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

  expectTypeOf(rootRoute.useSearch<typeof router>()).toEqualTypeOf<{
    page: number
  }>()
  expectTypeOf(rootRoute.useSearch<typeof router>()).toEqualTypeOf<{
    page: number
  }>
})

test('when creating a route with zod 4 validation', () => {
  const rootRoute = createRootRoute({
    validateSearch: zodValidator(
      z4.object({
        page: z4.number().optional().default(0),
      }),
    ),
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: zodValidator(
      z4.object({
        indexPage: z4.number().optional().default(0),
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

  expectTypeOf(rootRoute.useSearch<typeof router>()).toEqualTypeOf<{
    page: number
  }>()
  expectTypeOf(rootRoute.useSearch<typeof router>()).toEqualTypeOf<{
    page: number
  }>
})

test('when creating a route with zod 4 validation where input is output', () => {
  const rootRoute = createRootRoute({
    validateSearch: zodValidator(
      z4.object({
        page: z4.number().optional().default(0),
      }),
    ),
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: zodValidator({
      schema: z4.object({
        indexPage: z4.number().optional().default(0),
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

  expectTypeOf(rootRoute.useSearch<typeof router>()).toEqualTypeOf<{
    page: number
  }>()
  expectTypeOf(rootRoute.useSearch<typeof router>()).toEqualTypeOf<{
    page: number
  }>
})

test('when creating a route with zod 4 validation where output is input', () => {
  const rootRoute = createRootRoute({
    validateSearch: zodValidator({
      schema: z4.object({
        page: z4.number().optional().default(0),
      }),
      output: 'input',
    }),
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: zodValidator({
      schema: z4.object({
        indexPage: z4.number().optional().default(0),
      }),
      output: 'input',
    }),
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
    .toEqualTypeOf<{ page?: number } | { page?: number; indexPage?: number }>()

  expectTypeOf(rootRoute.useSearch<typeof router>()).toEqualTypeOf<{
    page?: number
  }>()
  expectTypeOf(rootRoute.useSearch<typeof router>()).toEqualTypeOf<{
    page?: number
  }>
})
