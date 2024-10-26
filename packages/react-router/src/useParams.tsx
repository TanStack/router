import { useMatch } from './useMatch'
import type { StructuralSharingOption } from './structuralSharing'
import type { AnyRoute } from './route'
import type { AllParams, RouteById, RouteIds } from './routeInfo'
import type { AnyRouter, RegisteredRouter } from './router'
import type { Constrain, StrictOrFrom } from './utils'

export type UseParamsOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TParams,
  TSelected,
> = StrictOrFrom<TFrom, TStrict> & {
  select?: (params: TParams) => TSelected
} & StructuralSharingOption<TRouter, TSelected>

export function useParams<
  TRouter extends AnyRouter = RegisteredRouter,
  TRouteTree extends AnyRoute = TRouter['routeTree'],
  TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TParams = TStrict extends false
    ? AllParams<TRouteTree>
    : RouteById<TRouteTree, TFrom>['types']['allParams'],
  TSelected = unknown,
  TReturn = unknown extends TSelected ? TParams : TSelected,
>(
  opts: UseParamsOptions<
    TRouter,
    Constrain<TFrom, RouteIds<TRouteTree>>,
    TStrict,
    TParams,
    TSelected
  >,
): TReturn {
  return useMatch({
    from: opts.from!,
    strict: opts.strict,
    structuralSharing: opts.structuralSharing,
    select: (match) => {
      return opts.select ? opts.select(match.params as TParams) : match.params
    },
  })
}
