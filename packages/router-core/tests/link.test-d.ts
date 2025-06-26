import { describe, expectTypeOf, test } from 'vitest'
import { createRouteFn, createRouterFn } from './helpers'
import type { LinkOptions } from '../src'

describe('link options search params type safety', () => {
  test('current implementation allows invalid search params', () => {
    // 테스트 설정: 특정 search params를 가진 라우트 구성
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
      // 이 라우트는 오직 'id'만 search param으로 허용해야 함
      validateSearch: (search: { id?: string }) => search,
    })

    const router = createRouterFn({
      routeTree: rootRoute,
    })

    // 이슈 #4225: 현재 구현에서는 타입 체크가 엄격하지 않아 잘못된 search params를 허용함
    const linkOptions1: LinkOptions<typeof router, '/posts/$postId'> = {
      to: '/posts/123',
      // 'invalidParam'은 postDetailRoute에서 허용되지 않지만, 타입 체크에서 오류가 발생하지 않음
      search: { id: '456', invalidParam: 'should-not-be-allowed' },
    }

    // 현재 구현에서는 잘못된 search params가 타입 오류 없이 허용됨
    expectTypeOf(linkOptions1.search).toEqualTypeOf<
      { id?: string; invalidParam?: string } | undefined
    >()
  })

  test('functional search params API must be preserved', () => {
    // 테스트 설정: 동일한 라우트 구성
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

    // 함수형 API - 이 기능은 유지되어야 함
    const linkOptions: LinkOptions<typeof router, '/posts/$postId'> = {
      to: '/posts/123',
      search: (current) => {
        // current는 라우트의 search params 타입과 일치해야 함
        return { ...current, id: '456' }
      },
    }

    // 함수형 API의 매개변수 타입 확인
    type SearchFunctionParam = Parameters<NonNullable<typeof linkOptions.search>>[0]
    expectTypeOf<SearchFunctionParam>().toEqualTypeOf<{ id?: string } | undefined>()

    // 함수형 API의 반환 타입 확인
    type SearchFunctionReturn = ReturnType<NonNullable<typeof linkOptions.search>>
    expectTypeOf<SearchFunctionReturn>().toEqualTypeOf<{ id?: string }>()
  })

  test('proposed solution must restrict object API but preserve functional API', () => {
    // 이 테스트는 제안된 해결책이 구현되면 통과해야 하는 테스트임
    // 지금은 타입 에러가 없지만, 이상적인 해결책에서는 타입 에러가 발생해야 함
    
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
    
    // 해결책 구현 후에는 아래 코드는 타입 에러가 발생해야 함
    // 'invalidParam' 속성에 대해 타입 에러가 나타나야 함
    const invalidLinkOptions: LinkOptions<typeof router, '/posts/$postId'> = {
      to: '/posts/123',
      search: { id: '456', invalidParam: 'should-fail-typechecking' },
    }
    
    // 그러나 함수형 API는 계속 작동해야 함
    const validLinkOptions: LinkOptions<typeof router, '/posts/$postId'> = {
      to: '/posts/123',
      search: (current) => {
        // 함수형 API에서 current는 올바른 타입을 가져야 함
        return { ...current, id: '789' }
      },
    }
  })
})
