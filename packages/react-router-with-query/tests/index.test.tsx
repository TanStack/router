import { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRouter,
} from '@tanstack/react-router'

import { expect, expectTypeOf, test } from 'vitest'

import { routerWithQueryClient } from '../src'

test('it has a test', async () => {
  expect(true).toBe(true)
})

test('types', () => {
  {
    // basic
    const root = createRootRouteWithContext<{
      queryClient: QueryClient
    }>()({})

    const queryClient = new QueryClient()
    const router = createRouter({
      context: { queryClient },
      routeTree: root,
    })

    const routerWithQuery = routerWithQueryClient(router, queryClient)
    expectTypeOf(routerWithQuery).toMatchTypeOf(router)
  }

  {
    // without query client
    const root = createRootRouteWithContext()({})

    const queryClient = new QueryClient()
    const router = createRouter({
      routeTree: root,
    })

    const routerWithQuery = routerWithQueryClient(
      // @ts-expect-error - QueryClient must be in context type
      router,
      queryClient,
    )
  }

  {
    // with extra props
    const root = createRootRouteWithContext<{
      queryClient: QueryClient
      extra: string
    }>()({})

    const queryClient = new QueryClient()
    const router = createRouter({
      context: { queryClient, extra: 'extra' },
      routeTree: root,
    })

    const routerWithQuery = routerWithQueryClient(router, queryClient)
  }
})
