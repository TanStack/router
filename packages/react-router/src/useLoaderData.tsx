import { useMatch } from './useMatch'
import type { RegisteredRouter } from './router'
import type { AnyRoute } from './route'
import type { MakeRouteMatch } from './Matches'
import type { RouteIds } from './routeInfo'
import type { StrictOrFrom } from './utils'

export type UseLoaderDataOptions<
  TRouteTree extends AnyRoute,
  TFrom,
  TStrict extends boolean,
  TRouteMatch extends MakeRouteMatch<TRouteTree, TFrom, TStrict>,
  TSelected,
> = StrictOrFrom<TFrom, TStrict> & {
  select?: (match: Required<TRouteMatch>['loaderData']) => TSelected
}

export function useLoaderData<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TStrict extends boolean = true,
  TRouteMatch extends MakeRouteMatch<
    TRouteTree,
    TFrom,
    TStrict
  > = MakeRouteMatch<TRouteTree, TFrom, TStrict>,
  TSelected = Required<TRouteMatch>['loaderData'],
>(
  opts: UseLoaderDataOptions<
    TRouteTree,
    TFrom,
    TStrict,
    TRouteMatch,
    TSelected
  >,
): TSelected {
  return useMatch<TRouteTree, TFrom, TStrict, TRouteMatch, TSelected>({
    ...opts,
    select: (s) => {
      return typeof opts.select === 'function'
        ? opts.select(s.loaderData)
        : (s.loaderData as TSelected)
    },
  })
}
