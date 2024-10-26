import { useRouterState } from './useRouterState'
import type { StructuralSharingOption } from './structuralSharing'
import type { AnyRouter, RegisteredRouter, RouterState } from './router'

export function useLocation<
  TRouter extends AnyRouter = RegisteredRouter,
  TLocationState = RouterState<TRouter['routeTree']>['location'],
  TSelected = unknown,
  TReturn = unknown extends TSelected ? TLocationState : TSelected,
>(
  opts?: {
    select?: (state: TLocationState) => TSelected
  } & StructuralSharingOption<TRouter, TSelected>,
): TReturn {
  return useRouterState({
    select: (state) =>
      opts?.select
        ? opts.select(state.location as TLocationState)
        : state.location,
  })
}
