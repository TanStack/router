import { useRouterState } from './useRouterState'
import type { AnyRouter, RegisteredRouter, RouterState } from './router'

export function useLocation<
  TRouter extends AnyRouter = RegisteredRouter,
  TLocationState = RouterState<TRouter['routeTree']>['location'],
  TSelected = TLocationState,
>(opts?: { select?: (state: TLocationState) => TSelected }): TSelected {
  return useRouterState({
    select: (state) =>
      opts?.select
        ? opts.select(state.location as TLocationState)
        : (state.location as TSelected),
  })
}
