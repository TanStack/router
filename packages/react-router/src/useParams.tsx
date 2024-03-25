import { useMatch } from './Matches'
import type { AnyRoute } from './route'
import type { AllParams, RouteById, RouteIds } from './routeInfo'
import type { RegisteredRouter } from './router'
import type { Expand } from './utils'
import type { StrictOrFrom } from './utils'

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
  return useMatch({
    ...opts,
    select: (match) => {
      return opts.select ? opts.select(match.params) : match.params
    },
  })
}
