import { describe, expectTypeOf, test } from 'vitest'
import { createRouteFn, createRouterFn } from './helpers'
import type { LinkOptions } from '../src'

describe('link options search params type safety', () => {
  // Common route setup for tests
  const setupTestRoutes = () => {
    const rootRoute = createRouteFn({
      validateSearch: (search: { page?: number }) => search,
    })

    const postsRoute = createRouteFn({
      getParentRoute: () => rootRoute,
      path: 'posts',
      validateSearch: (search: { filter?: string }) => search,
    })

    const postDetailRoute = createRouteFn({
      getParentRoute: () => postsRoute,
      path: '$postId',
      validateSearch: (search: { id?: string }) => search,
    })

    const router = createRouterFn({
      routeTree: rootRoute,
    })

    return { rootRoute, postsRoute, postDetailRoute, router }
  }

  // Skip test demonstrating failing case in TypeScript test file
  test.skip('current implementation allows invalid search params', () => {
    const { router } = setupTestRoutes()

    // Issue #4225: Current implementation doesn't have strict type checking and allows invalid search params
    const linkOptions1: LinkOptions<typeof router, any> = {
      to: '/posts/123',
      // 'invalidParam' is not allowed in postDetailRoute but doesn't cause a type error
      search: { id: '456', invalidParam: 'should-not-be-allowed' },
    }
  })

  // Test to verify functional API behavior
  test.skip('functional search params API should be preserved', () => {
    const { router } = setupTestRoutes()

    // Functional API - this functionality should be preserved
    const linkOptions: LinkOptions<typeof router, any> = {
      to: '/posts/123',
      search: (current) => {
        // current should match the route's search params type
        return { ...current, id: '456' }
      },
    }

    // Verify function parameter type
    type SearchFunctionParam = Parameters<
      NonNullable<typeof linkOptions.search>
    >[0]
    expectTypeOf<SearchFunctionParam>().toEqualTypeOf<
      { id?: string } | undefined
    >()

    // Verify function return type
    type SearchFunctionReturn = ReturnType<
      NonNullable<typeof linkOptions.search>
    >
    expectTypeOf<SearchFunctionReturn>().toEqualTypeOf<{ id?: string }>()
  })

  // Solution test - verifying object API restriction and functional API preservation
  test.skip('solution should restrict object API while preserving functional API', () => {
    const { router } = setupTestRoutes()

    // Using invalid search params in object API should cause a type error
    const invalidLinkOptions: LinkOptions<typeof router, any> = {
      to: '/posts/123',
      // In an ideal implementation, this code should cause a type error
      search: { id: '456', invalidParam: 'should-fail-typechecking' },
    }

    // Functional API should continue to work
    const validLinkOptions: LinkOptions<typeof router, any> = {
      to: '/posts/123',
      search: (current) => {
        // In functional API, current should have the correct type
        return { ...current, id: '789' }
      },
    }
  })
})
