import { useRouterState } from './useRouterState'
import type {
  Register,
  RegisteredRouter,
  RouterState,
} from '@tanstack/router-core'
import type { Accessor } from 'solid-js'

export interface UseLocationBaseOptions<TRegister extends Register, TSelected> {
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
): Accessor<UseLocationResult<TRegister, TSelected>> {
  return useRouterState({
    select: (state: any) =>
      opts?.select ? opts.select(state.location) : state.location,
  } as any) as Accessor<UseLocationResult<TRegister, TSelected>>
}
