import { AnyRoute } from './route'
import { RouteIds, RouteById, AllParams } from './routeInfo'
import { RegisteredRouter } from './router'
import { last } from './utils'
import { useRouterState } from './RouterProvider'
import { StrictOrFrom } from './utils'
import { getRenderedMatches } from './Matches'

export function useParams<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TDefaultSelected = AllParams<TRouteTree> &
    RouteById<TRouteTree, TFrom>['types']['allParams'],
  TSelected = TDefaultSelected,
>(
  opts: StrictOrFrom<TFrom> & {
    select?: (search: TDefaultSelected) => TSelected
  },
): TSelected {
  return useRouterState({
    select: (state: any) => {
      const params = (last(getRenderedMatches(state)) as any)?.params
      return opts?.select ? opts.select(params) : params
    },
  })
}
