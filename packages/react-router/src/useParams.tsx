import { AnyRoute } from './route'
import { RouteIds, RouteById, AllParams } from './routeInfo'
import { RegisteredRouter } from './router'
import { Expand } from './utils'
import { StrictOrFrom } from './utils'
import { useMatch } from './Matches'

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
      return opts?.select ? opts.select(match.params) : match.params
    },
  })
}
