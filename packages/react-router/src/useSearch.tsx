import { AnyRoute } from './route'
import { RouteIds, RouteById } from './routeInfo'
import { RegisteredRouter } from './router'
import { RouteMatch } from './RouterProvider'
import { useMatch } from './Matches'
import { StrictOrFrom } from './utils'

export function useSearch<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TStrict extends boolean = true,
  TSearch = RouteById<TRouteTree, TFrom>['types']['fullSearchSchema'],
  TSelected = TSearch,
>(
  opts: StrictOrFrom<TFrom> & {
    select?: (search: TSearch) => TSelected
  },
): TStrict extends true ? TSelected : TSelected | undefined {
  return useMatch({
    ...(opts as any),
    select: (match: RouteMatch) => {
      return opts?.select ? opts.select(match.search as TSearch) : match.search
    },
  })
}
