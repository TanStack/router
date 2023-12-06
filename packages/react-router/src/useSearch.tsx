import { AnyRoute } from './route'
import { RouteIds, RouteById } from './routeInfo'
import { RegisteredRouter } from './router'
import { RouteMatch } from './Matches'
import { useMatch } from './Matches'
import { StrictOrFrom } from './utils'

export function useSearch<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TStrict extends boolean = true,
  TSearch = RouteById<TRouteTree, TFrom>['types']['fullSearchSchema'],
>(
  opts: StrictOrFrom<TFrom>,
): TStrict extends true ? TSearch : TSearch | undefined {
  return useMatch(opts).search
}
