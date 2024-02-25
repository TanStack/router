import { AnyRoute, RootSearchSchema } from './route'
import { RouteIds, RouteById, FullSearchSchema } from './routeInfo'
import { RegisteredRouter } from './router'
import { RouteMatch } from './Matches'
import { useMatch } from './Matches'
import { Expand, StrictOrFrom } from './utils'

export function useSearch<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TReturnIntersection extends boolean = false,
  TSearch = TReturnIntersection extends false
    ? Exclude<
        RouteById<TRouteTree, TFrom>['types']['fullSearchSchema'],
        RootSearchSchema
      >
    : Partial<Omit<FullSearchSchema<TRouteTree>, keyof RootSearchSchema>>,
  TSelected = TSearch,
>(
  opts: StrictOrFrom<TFrom, TReturnIntersection> & {
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
