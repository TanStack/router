import { useRouterState } from './useRouterState'
import type { AnyRouter, RegisteredRouter, RouterState } from './router'
import { Accessor } from 'solid-js'

export interface UseLocationBaseOptions<TRouter extends AnyRouter, TSelected> {
  select?: (state: RouterState<TRouter['routeTree']>['location']) => TSelected
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
): Accessor<UseLocationResult<TRouter, TSelected>> {
  return useRouterState({
    select: (state: any) =>
      opts?.select ? opts.select(state.location) : state.location,
  } as any) as Accessor<UseLocationResult<TRouter, TSelected>>
}
