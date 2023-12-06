import { AnyRoute } from './route'
import { RouteIds, RouteById, AllParams } from './routeInfo'
import { RegisteredRouter } from './router'
import { last } from './utils'
import { useRouter } from './RouterProvider'
import { StrictOrFrom } from './utils'

export function useParams<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
>(
  _opts: StrictOrFrom<TFrom>,
): AllParams<TRouteTree> & RouteById<TRouteTree, TFrom>['types']['allParams'] {
  return (last(useRouter().state.matches) as any)?.params
}
