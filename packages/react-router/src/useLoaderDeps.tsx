import { useMatch } from './useMatch'
import type { StructuralSharingOption } from './structuralSharing'
import type { AnyRouter, RegisteredRouter } from './router'
import type { AnyRoute } from './route'
import type { MakeRouteMatch } from './Matches'
import type { RouteIds } from './routeInfo'
import type { Constrain, StrictOrFrom } from './utils'

export function useLoaderDeps<
  TRouter extends AnyRouter = RegisteredRouter,
  TRouteTree extends AnyRoute = TRouter['routeTree'],
  TFrom extends string | undefined = undefined,
  TRouteMatch extends MakeRouteMatch<TRouteTree, TFrom> = MakeRouteMatch<
    TRouteTree,
    TFrom
  >,
  TSelected = unknown,
  TReturn = unknown extends TSelected ? TRouteMatch : TSelected,
>(
  opts: StrictOrFrom<Constrain<TFrom, RouteIds<TRouteTree>>> & {
    select?: (deps: TRouteMatch['loaderDeps']) => TSelected
  } & StructuralSharingOption<TRouter, TSelected>,
): TReturn {
  const { select, ...rest } = opts
  return useMatch({
    ...rest,
    select: (s) => {
      return select ? select(s.loaderDeps) : s.loaderDeps
    },
  })
}
