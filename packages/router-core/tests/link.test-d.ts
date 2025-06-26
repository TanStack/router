import { describe, expectTypeOf, test } from 'vitest'
import { createRouteFn, createRouterFn } from './helpers'
import type { LinkOptions } from '../src'

describe('link options search params type safety', () => {
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

  test.skip('현재 구현은 잘못된 search params를 허용함', () => {
    const { router } = setupTestRoutes()

    const linkOptions1: LinkOptions<typeof router, any> = {
      to: '/posts/123',

      search: { id: '456', invalidParam: 'should-not-be-allowed' },
    }
  })

  test.skip('함수형 search params API는 보존되어야 함', () => {
    const { router } = setupTestRoutes()

    const linkOptions: LinkOptions<typeof router, any> = {
      to: '/posts/123',
      search: (current) => {
        return { ...current, id: '456' }
      },
    }

    type SearchFunctionParam = Parameters<
      NonNullable<typeof linkOptions.search>
    >[0]
    expectTypeOf<SearchFunctionParam>().toEqualTypeOf<
      { id?: string } | undefined
    >()

    type SearchFunctionReturn = ReturnType<
      NonNullable<typeof linkOptions.search>
    >
    expectTypeOf<SearchFunctionReturn>().toEqualTypeOf<{ id?: string }>()
  })

  test.skip('해결책은 객체 API를 제한하면서 함수형 API를 보존해야 함', () => {
    const { router } = setupTestRoutes()

    const invalidLinkOptions: LinkOptions<typeof router, any> = {
      to: '/posts/123',

      search: { id: '456', invalidParam: 'should-fail-typechecking' },
    }

    const validLinkOptions: LinkOptions<typeof router, any> = {
      to: '/posts/123',
      search: (current) => {
        return { ...current, id: '789' }
      },
    }
  })
})
