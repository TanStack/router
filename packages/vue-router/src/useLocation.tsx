import { useRouterState } from './useRouterState'
import type {
  AnyRouter,
  RegisteredRouter,
  RouterState,
} from '@tanstack/router-core'
import type * as Vue from 'vue'

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
): Vue.Ref<UseLocationResult<TRouter, TSelected>> {
  return useRouterState({
    select: (state: any) =>
      opts?.select ? opts.select(state.location) : state.location,
  } as any) as Vue.Ref<UseLocationResult<TRouter, TSelected>>
}
