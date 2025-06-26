import type { AnyRoute } from '../src/route'
import type { AnyRouter, RouterOptions } from '../src/router'

/**
 * 테스트용 Route 생성 헬퍼 함수
 * 타입 정의만 제공합니다 (테스트용)
 */
export declare function createRouteFn(options: any): AnyRoute

/**
 * 테스트용 Router 생성 헬퍼 함수
 * 타입 정의만 제공합니다 (테스트용)
 */
export declare function createRouterFn<TRouteTree extends AnyRoute>(
  options: { routeTree: TRouteTree } & Partial<RouterOptions<TRouteTree, any>>,
): AnyRouter
