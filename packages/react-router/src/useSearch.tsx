import { useMatch } from './useMatch'
import type { AnyRoute, RootSearchSchema } from './route'
import type { FullSearchSchema, RouteById, RouteIds } from './routeInfo'
import type { RegisteredRouter } from './router'
import type { MakeRouteMatch } from './Matches'
import type { StrictOrFrom } from './utils'

export type UseSearchOptions<
  TFrom,
  TStrict extends boolean,
  TSearch,
  TSelected,
> = StrictOrFrom<TFrom, TStrict> & {
  select?: (search: TSearch) => TSelected
}

export function useSearch<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TStrict extends boolean = true,
  TSearch = TStrict extends false
    ? FullSearchSchema<TRouteTree>
    : Exclude<
        RouteById<TRouteTree, TFrom>['types']['fullSearchSchema'],
        RootSearchSchema
      >,
  TSelected = TSearch,
>(opts: UseSearchOptions<TFrom, TStrict, TSearch, TSelected>): TSelected {
  return useMatch({
    ...opts,
    select: (match: MakeRouteMatch<TRouteTree, TFrom>) => {
      return opts.select ? opts.select(match.search) : match.search
    },
  })
}
