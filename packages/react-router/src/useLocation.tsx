import { useRouterState } from './useRouterState'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'
import type {
  Register,
  RegisteredRouter,
  RouterState,
} from '@tanstack/router-core'

export interface UseLocationBaseOptions<
  TRegister extends Register,
  TSelected,
  TStructuralSharing extends boolean = boolean,
> {
  select?: (
    state: RouterState<RegisteredRouter<TRegister>['routeTree']>['location'],
  ) => ValidateSelected<
    RegisteredRouter<TRegister>,
    TSelected,
    TStructuralSharing
  >
}

export type UseLocationResult<
  TRegister extends Register,
  TSelected,
> = unknown extends TSelected
  ? RouterState<RegisteredRouter<TRegister>['routeTree']>['location']
  : TSelected

/**
 * Read the current location from the router state with optional selection.
 * Useful for subscribing to just the pieces of location you care about.
 *
 * Options:
 * - `select`: Project the `location` object to a derived value
 * - `structuralSharing`: Enable structural sharing for stable references
 *
 * @returns The current location (or selected value).
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useLocationHook
 */
export function useLocation<
  TRegister extends Register = Register,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseLocationBaseOptions<TRegister, TSelected, TStructuralSharing> &
    StructuralSharingOption<
      RegisteredRouter<TRegister>,
      TSelected,
      TStructuralSharing
    >,
): UseLocationResult<TRegister, TSelected> {
  return useRouterState({
    select: (state: any) =>
      opts?.select ? opts.select(state.location) : state.location,
  } as any) as UseLocationResult<TRegister, TSelected>
}
