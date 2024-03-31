import { useMatch } from './Matches'
import type { RouteMatch } from './Matches'
import type { AnyRoute } from './route'
import type { RouteById, RouteIds } from './routeInfo'
import type { RegisteredRouter } from './router'
import type { StrictOrFrom } from './utils'

export function useRouteContext<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TRouteContext = RouteById<TRouteTree, TFrom>['types']['allContext'],
  TSelected = TRouteContext,
>(
  opts: StrictOrFrom<TFrom> & {
    select?: (search: TRouteContext) => TSelected
  },
): TSelected {
  return useMatch({
    ...(opts as any),
    select: (match: RouteMatch) =>
      opts.select ? opts.select(match.context as TRouteContext) : match.context,
  })
}
