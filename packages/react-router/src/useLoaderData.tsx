import { type RegisteredRouter } from './router'
import { type AnyRoute } from './route'
import { useMatch } from './useMatch'
import type { MakeRouteMatch } from './Matches'
import type { RouteIds } from './routeInfo'
import type { StrictOrFrom } from './utils'

export function useLoaderData<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TRouteMatch extends MakeRouteMatch<TRouteTree, TFrom> = MakeRouteMatch<
    TRouteTree,
    TFrom
  >,
  TSelected = Required<TRouteMatch>['loaderData'],
>(
  opts: StrictOrFrom<TFrom> & {
    select?: (match: TRouteMatch) => TSelected
  },
): TSelected {
  return useMatch({
    ...opts,
    select: (s) => {
      return typeof opts.select === 'function'
        ? opts.select(s.loaderData as TRouteMatch)
        : s.loaderData
    },
  }) as TSelected
}
