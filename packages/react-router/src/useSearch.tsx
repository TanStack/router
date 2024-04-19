import { useMatch } from './Matches'
import type { AnyRoute, RootSearchSchema } from './route'
import type { FullSearchSchema, RouteById, RouteIds } from './routeInfo'
import type { RegisteredRouter } from './router'
import type { MakeRouteMatch } from './Matches'
import type { StrictOrFrom } from './utils'

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
    select: (match: MakeRouteMatch<TRouteTree, TFrom>) => {
      return opts.select ? opts.select(match.search) : match.search
    },
  })
}
