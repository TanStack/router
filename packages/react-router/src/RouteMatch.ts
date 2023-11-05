import { AnyRoute } from './route'
import { ParseRoute, FullSearchSchema, RouteById, RouteIds } from './routeInfo'

export interface RouteMatch<
  TRouteTree extends AnyRoute = AnyRoute,
  TRouteId extends RouteIds<TRouteTree> = ParseRoute<TRouteTree>['id'],
> {
  id: string
  routeId: TRouteId
  pathname: string
  params: RouteById<TRouteTree, TRouteId>['types']['allParams']
  status: 'pending' | 'success' | 'error'
  isFetching: boolean
  invalid: boolean
  error: unknown
  paramsError: unknown
  searchError: unknown
  updatedAt: number
  loadPromise?: Promise<void>
  __resolveLoadPromise?: () => void
  meta: RouteById<TRouteTree, TRouteId>['types']['allMeta']
  routeSearch: RouteById<TRouteTree, TRouteId>['types']['searchSchema']
  search: FullSearchSchema<TRouteTree> &
    RouteById<TRouteTree, TRouteId>['types']['fullSearchSchema']
  fetchedAt: number
  abortController: AbortController
}
export type AnyRouteMatch = RouteMatch<any>
