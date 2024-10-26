import { useMatch } from './useMatch'
import type { StructuralSharingOption } from './structuralSharing'
import type { AnyRouter, RegisteredRouter } from './router'
import type { AnyRoute } from './route'
import type { MakeRouteMatch } from './Matches'
import type { RouteIds } from './routeInfo'
import type { Constrain, StrictOrFrom } from './utils'

export type UseLoaderDataOptions<
  TRouter extends AnyRouter,
  TRouteTree extends AnyRoute,
  TFrom,
  TStrict extends boolean,
  TRouteMatch extends MakeRouteMatch<TRouteTree, TFrom, TStrict>,
  TSelected,
> = StrictOrFrom<Constrain<TFrom, RouteIds<TRouteTree>>, TStrict> & {
  select?: (match: Required<TRouteMatch>['loaderData']) => TSelected
} & StructuralSharingOption<TRouter, TSelected>

export function useLoaderData<
  TRouter extends AnyRouter = RegisteredRouter,
  TRouteTree extends AnyRoute = TRouter['routeTree'],
  TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TRouteMatch extends MakeRouteMatch<
    TRouteTree,
    TFrom,
    TStrict
  > = MakeRouteMatch<TRouteTree, TFrom, TStrict>,
  TSelected = unknown,
  TReturn = unknown extends TSelected
    ? Required<TRouteMatch>['loaderData']
    : TSelected,
>(
  opts: UseLoaderDataOptions<
    TRouter,
    TRouteTree,
    TFrom,
    TStrict,
    TRouteMatch,
    TSelected
  >,
): TReturn {
  return useMatch({
    from: opts.from!,
    strict: opts.strict,
    structuralSharing: opts.structuralSharing,
    select: (s) => {
      return opts.select
        ? opts.select(s.loaderData)
        : (s.loaderData as TSelected)
    },
  })
}
