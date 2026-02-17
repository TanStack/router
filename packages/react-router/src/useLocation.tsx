import { useStore } from '@tanstack/react-store'
import { useRef } from 'react'
import { replaceEqualDeep } from '@tanstack/router-core'
import { useRouter } from './useRouter'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'
import type {
  AnyRouter,
  RegisteredRouter,
  RouterState,
} from '@tanstack/router-core'

export interface UseLocationBaseOptions<
  TRouter extends AnyRouter,
  TSelected,
  TStructuralSharing extends boolean = boolean,
> {
  select?: (
    state: RouterState<TRouter['routeTree']>['location'],
  ) => ValidateSelected<TRouter, TSelected, TStructuralSharing>
}

export type UseLocationResult<
  TRouter extends AnyRouter,
  TSelected,
> = unknown extends TSelected
  ? RouterState<TRouter['routeTree']>['location']
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
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseLocationBaseOptions<TRouter, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
): UseLocationResult<TRouter, TSelected> {
  const router = useRouter<TRouter>()
  const previousResult = useRef<
    ValidateSelected<TRouter, TSelected, TStructuralSharing>
  >(undefined)

  return useStore(router.stateStore, (state) => {
    const location = state.location as RouterState<TRouter['routeTree']>['location']

    if (opts?.select) {
      if (opts.structuralSharing ?? router.options.defaultStructuralSharing) {
        const newSlice = replaceEqualDeep(
          previousResult.current,
          opts.select(location),
        )
        previousResult.current = newSlice
        return newSlice
      }
      return opts.select(location)
    }

    return location
  }) as UseLocationResult<TRouter, TSelected>
}
