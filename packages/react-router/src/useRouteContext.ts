import { useMatch } from './useMatch'
import type { StructuralSharingOption } from './structuralSharing'
import type { MakeRouteMatch } from './Matches'
import type { AnyRoute } from './route'
import type { AllContext, RouteById, RouteIds } from './routeInfo'
import type { AnyRouter, RegisteredRouter } from './router'
import type { Constrain, Expand, StrictOrFrom } from './utils'

export type UseRouteContextOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TRouteContext,
  TSelected,
> = StrictOrFrom<TFrom, TStrict> & {
  select?: (search: TRouteContext) => TSelected
} & StructuralSharingOption<TRouter, TSelected>

export function useRouteContext<
  TRouter extends AnyRouter = RegisteredRouter,
  TRouteTree extends AnyRoute = TRouter['routeTree'],
  TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TRouteContext = TStrict extends false
    ? AllContext<TRouteTree>
    : Expand<RouteById<TRouteTree, TFrom>['types']['allContext']>,
  TSelected = unknown,
  TReturn = unknown extends TSelected ? TRouteContext : TSelected,
>(
  opts: UseRouteContextOptions<
    TRouter,
    Constrain<TFrom, RouteIds<TRouteTree>>,
    TStrict,
    TRouteContext,
    TSelected
  >,
): TReturn {
  return useMatch({
    ...(opts as any),
    select: (match: MakeRouteMatch<TRouteTree, TFrom>) =>
      opts.select ? opts.select(match.context) : match.context,
  })
}
