import { useMatch } from './useMatch'
import type { AnyRoute } from './route'
import type { AllParams, RouteById, RouteIds } from './routeInfo'
import type { RegisteredRouter } from './router'
import type { StrictOrFrom } from './utils'

export type UseParamsOptions<
  TFrom,
  TStrict extends boolean,
  TParams,
  TSelected,
> = StrictOrFrom<TFrom, TStrict> & {
  select?: (params: TParams) => TSelected
}

export function useParams<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TStrict extends boolean = true,
  TParams = TStrict extends false
    ? AllParams<TRouteTree>
    : RouteById<TRouteTree, TFrom>['types']['allParams'],
  TSelected = TParams,
>(opts: UseParamsOptions<TFrom, TStrict, TParams, TSelected>): TSelected {
  return useMatch({
    ...opts,
    select: (match) => {
      return opts.select ? opts.select(match.params as TParams) : match.params
    },
  }) as TSelected
}
