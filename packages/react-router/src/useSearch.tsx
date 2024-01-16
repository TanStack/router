import { AnyRoute } from './route'
import { RouteIds, RouteById } from './routeInfo'
import { RegisteredRouter } from './router'
import { RouteMatch } from './Matches'
import { useMatch } from './Matches'
import { StrictOrFrom, GetTFrom } from './utils'

export function useSearch<
  TOpts extends StrictOrFrom<TFrom>,
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TFromInferred = GetTFrom<TOpts, TRouteTree>,
  TSearch = RouteById<TRouteTree, TFromInferred>['types']['fullSearchSchema'],
  TSelected = TSearch,
>(
  opts: TOpts & {
    select?: (search: TSearch) => TSelected
  },
) : TSelected {
  return useMatch({
    ...opts,
    select: (match: RouteMatch) => {
      return opts?.select ? opts.select(match.search as TSearch) : match.search
    },
  })
}
