import { useRouterState } from './useRouterState'
import type {
  AnyRouter,
  Register,
  RegisteredRouter,
  RouterState,
} from '@tanstack/router-core'
import type * as Vue from 'vue'

export interface UseLocationBaseOptions<
  TRegister extends Register,
  TSelected,
> {
  select?: (
    state: RouterState<RegisteredRouter<TRegister>['routeTree']>['location'],
  ) => TSelected
}

export type UseLocationResult<
  TRegister extends Register,
  TSelected,
> = unknown extends TSelected
  ? RouterState<RegisteredRouter<TRegister>['routeTree']>['location']
  : TSelected

export function useLocation<
  TRegister extends Register = Register,
  TSelected = unknown,
>(
  opts?: UseLocationBaseOptions<TRegister, TSelected>,
): Vue.Ref<UseLocationResult<TRegister, TSelected>> {
  return useRouterState({
    select: (state: any) =>
      opts?.select ? opts.select(state.location) : state.location,
  } as any) as Vue.Ref<UseLocationResult<TRegister, TSelected>>
}
