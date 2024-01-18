import { useMatch, RouteMatch } from './Matches'
import { AnyRoute } from './route'
import { RouteIds, RouteById } from './routeInfo'
import { RegisteredRouter } from './router'
import { StrictOrFrom } from './utils'

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
      opts?.select
        ? opts.select(match.context as TRouteContext)
        : match.context,
  })
}
