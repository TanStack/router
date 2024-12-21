import { useRouterState } from './useRouterState'
import type { AnyRouter, RegisteredRouter, RouterState } from '../router'

export interface UseLocationBaseOptions<TRouter extends AnyRouter, TSelected> {
  select?: (state: RouterState<TRouter['routeTree']>['location']) => TSelected // TODO: might need to ValidateJSON here
}

export type UseLocationResult<
  TRouter extends AnyRouter,
  TSelected,
> = unknown extends TSelected
  ? RouterState<TRouter['routeTree']>['location']
  : TSelected

export function useLocation<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseLocationBaseOptions<TRouter, TSelected>,
): UseLocationResult<TRouter, TSelected> {
  return useRouterState({
    select: (state: any) =>
      opts?.select ? opts.select(state.location) : state.location,
  } as any) as UseLocationResult<TRouter, TSelected>
}
