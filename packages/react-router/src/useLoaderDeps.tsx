import { useMatch } from './useMatch'
import type { RegisteredRouter } from './router'
import type { AnyRoute } from './route'
import type { MakeRouteMatch } from './Matches'
import type { RouteIds } from './routeInfo'
import type { StrictOrFrom } from './utils'

export function useLoaderDeps<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TRouteMatch extends MakeRouteMatch<TRouteTree, TFrom> = MakeRouteMatch<
    TRouteTree,
    TFrom
  >,
  TSelected = Required<TRouteMatch>['loaderDeps'],
>(
  opts: StrictOrFrom<TFrom> & {
    select?: (match: TRouteMatch) => TSelected
  },
): TSelected {
  return useMatch({
    ...opts,
    select: (s) => {
      return typeof opts.select === 'function'
        ? opts.select(s.loaderDeps)
        : s.loaderDeps
    },
  })
}
