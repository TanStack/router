import { useMatch } from './useMatch'
import type { StructuralSharingOption } from './structuralSharing'
import type { AnyRoute } from './route'
import type { FullSearchSchema, RouteById, RouteIds } from './routeInfo'
import type { AnyRouter, RegisteredRouter } from './router'
import type { Constrain, Expand, StrictOrFrom } from './utils'

export type UseSearchOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSearch,
  TSelected,
> = StrictOrFrom<TFrom, TStrict> & {
  select?: (state: TSearch) => TSelected
} & StructuralSharingOption<TRouter, TSelected>

export function useSearch<
  TRouter extends AnyRouter = RegisteredRouter,
  TRouteTree extends AnyRoute = TRouter['routeTree'],
  TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSearch = TStrict extends false
    ? FullSearchSchema<TRouteTree>
    : Expand<RouteById<TRouteTree, TFrom>['types']['fullSearchSchema']>,
  TSelected = unknown,
  TReturn = unknown extends TSelected ? TSearch : TSelected,
>(
  opts: UseSearchOptions<
    TRouter,
    Constrain<TFrom, RouteIds<TRouteTree>>,
    TStrict,
    TSearch,
    TSelected
  >,
): TReturn {
  return useMatch({
    from: opts.from!,
    strict: opts.strict,
    structuralSharing: opts.structuralSharing,
    select: (match) => {
      return opts.select ? opts.select(match.search) : match.search
    },
  })
}
