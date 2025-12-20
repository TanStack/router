import { useStore } from '@tanstack/react-store'
import { useRef } from 'react'
import { replaceEqualDeep } from '@tanstack/router-core'
import { useRouter } from './useRouter'
import type {
  AnyRouter,
  Register,
  RegisteredRouter,
  RouterState,
} from '@tanstack/router-core'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'

export type UseRouterStateOptions<
  TRegister extends Register,
  TSelected,
  TStructuralSharing,
> = {
  router?: RegisteredRouter<TRegister>
  select?: (
    state: RouterState<RegisteredRouter<TRegister>['routeTree']>,
  ) => ValidateSelected<
    RegisteredRouter<TRegister>,
    TSelected,
    TStructuralSharing
  >
} & StructuralSharingOption<
  RegisteredRouter<TRegister>,
  TSelected,
  TStructuralSharing
>

export type UseRouterStateResult<
  TRegister extends Register,
  TSelected,
> = unknown extends TSelected
  ? RouterState<RegisteredRouter<TRegister>['routeTree']>
  : TSelected

/**
 * Subscribe to the router's state store with optional selection and
 * structural sharing for render optimization.
 *
 * Options:
 * - `select`: Project the full router state to a derived slice
 * - `structuralSharing`: Replace-equal semantics for stable references
 * - `router`: Read state from a specific router instance instead of context
 *
 * @returns The selected router state (or the full state by default).
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useRouterStateHook
 */
export function useRouterState<
  TRegister extends Register = Register,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseRouterStateOptions<TRegister, TSelected, TStructuralSharing>,
): UseRouterStateResult<TRegister, TSelected> {
  const contextRouter = useRouter<TRegister>({
    warn: opts?.router === undefined,
  })
  const router = opts?.router || contextRouter
  const previousResult =
    useRef<
      ValidateSelected<
        RegisteredRouter<TRegister>,
        TSelected,
        TStructuralSharing
      >
    >(undefined)

  return useStore(router.__store, (state) => {
    if (opts?.select) {
      if (opts.structuralSharing ?? router.options.defaultStructuralSharing) {
        const newSlice = replaceEqualDeep(
          previousResult.current,
          opts.select(state),
        )
        previousResult.current = newSlice
        return newSlice
      }
      return opts.select(state)
    }
    return state
  }) as UseRouterStateResult<TRegister, TSelected>
}
