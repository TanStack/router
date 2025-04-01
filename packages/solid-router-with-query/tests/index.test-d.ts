import { QueryClient } from '@tanstack/solid-query'
import {
  createRootRouteWithContext,
  createRouter,
} from '@tanstack/solid-router'

import { expectTypeOf, test } from 'vitest'

import { routerWithQueryClient } from '../src'

test('basic { queryClient } context', () => {
  const root = createRootRouteWithContext<{
    queryClient: QueryClient
  }>()({})

  const queryClient = new QueryClient()
  const router = createRouter({
    context: { queryClient },
    routeTree: root,
  })

  const routerWithQuery = routerWithQueryClient(router, queryClient)
  expectTypeOf(routerWithQuery).toEqualTypeOf(router)
})

test('no context fails', () => {
  const root = createRootRouteWithContext()({})

  const queryClient = new QueryClient()
  const router = createRouter({
    routeTree: root,
  })

  routerWithQueryClient(
    // @ts-expect-error - QueryClient must be in context type
    router,
    queryClient,
  )
})

test('allows additional props on context', () => {
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
  expectTypeOf(routerWithQuery).toEqualTypeOf(router)
})
