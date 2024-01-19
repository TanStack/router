import { AnyRoute, RootSearchSchema } from './route'
import { RouteIds, RouteById } from './routeInfo'
import { RegisteredRouter } from './router'
import { RouteMatch } from './Matches'
import { useMatch } from './Matches'
import { StrictOrFrom } from './utils'

export function useSearch<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TSearch = Exclude<
    RouteById<TRouteTree, TFrom>['types']['fullSearchSchema'],
    RootSearchSchema
  >,
  TSelected = TSearch,
>(
  opts: StrictOrFrom<TFrom> & {
    select?: (search: TSearch) => TSelected
  },
): TSelected {
  return useMatch({
    ...opts,
    select: (match: RouteMatch) => {
      return opts?.select ? opts.select(match.search as TSearch) : match.search
    },
  })
}
