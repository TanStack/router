import { AnyRoute } from './route'
import { RouteIds, RouteById, AllParams } from './routeInfo'
import { RegisteredRouter } from './router'
import { last } from './utils'
import { useRouterState } from './RouterProvider'
import { StrictOrFrom, GetTFrom } from './utils'
import { getRenderedMatches } from './Matches'

export function useParams<
  TOpts extends StrictOrFrom<TFrom>,
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TFromInferred = GetTFrom<TOpts, TRouteTree>,
  TParams = RouteById<TRouteTree, TFromInferred>['types']['allParams'],
  TSelected = TParams,
>(
  opts: TOpts & {
    select?: (params: TParams) => TSelected
  },
): TSelected {
  return useRouterState({
    select: (state: any) => {
      const params = (last(getRenderedMatches(state)) as any)?.params
      return opts?.select ? opts.select(params) : params
    },
  })
}
