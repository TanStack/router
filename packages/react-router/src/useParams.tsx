import { AnyRoute } from './route'
import { RouteIds, RouteById, AllParams } from './routeInfo'
import { RegisteredRouter } from './router'
import { Expand, last } from './utils'
import { useRouterState } from './useRouterState'
import { StrictOrFrom } from './utils'
import { getRenderedMatches } from './Matches'

export function useParams<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TReturnIntersection extends boolean = false,
  TParams = TReturnIntersection extends false
    ? RouteById<TRouteTree, TFrom>['types']['allParams']
    : Expand<Partial<AllParams<TRouteTree>>>,
  TSelected = TParams,
>(
  opts: StrictOrFrom<TFrom, TReturnIntersection> & {
    select?: (params: TParams) => TSelected
  },
): TSelected {
  return useRouterState({
    select: (state: any) => {
      const params = (last(getRenderedMatches(state)) as any)?.params
      return opts?.select ? opts.select(params) : params
    },
  })
}
