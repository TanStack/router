import { useStore } from '@tanstack/react-store'
import { useContext, useRef } from 'react'
import { replaceEqualDeep } from '@tanstack/router-core'
import { useRouter } from './useRouter'
import type {
  AnyRouter,
  RegisteredRouter,
  RouterState,
} from '@tanstack/router-core'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'
import { routerStateContext } from './routerStateContext'

export type UseRouterStateOptions<
  TRouter extends AnyRouter,
  TSelected,
  TStructuralSharing,
> = {
  router?: TRouter
  select?: (
    state: RouterState<TRouter['routeTree']>,
  ) => ValidateSelected<TRouter, TSelected, TStructuralSharing>
} & StructuralSharingOption<TRouter, TSelected, TStructuralSharing>

export type UseRouterStateResult<
  TRouter extends AnyRouter,
  TSelected,
> = unknown extends TSelected ? RouterState<TRouter['routeTree']> : TSelected

/**
 * Subscribe to the router's state store with optional selection and
 * structural sharing for render optimization.
 */
export function useRouterState<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseRouterStateOptions<TRouter, TSelected, TStructuralSharing>,
): UseRouterStateResult<TRouter, TSelected> {
  const contextRouter = useRouter<TRouter>({
    warn: opts?.router === undefined,
  })
  const router = opts?.router || contextRouter
  const previousResult =
    useRef<ValidateSelected<TRouter, TSelected, TStructuralSharing>>(undefined)
  const stateOverride = useContext(routerStateContext)

  return useStore(router.__store, (state) => {
    const resolvedState = (stateOverride ?? state) as RouterState<
      TRouter['routeTree']
    >

    if (opts?.select) {
      if (opts.structuralSharing ?? router.options.defaultStructuralSharing) {
        const newSlice = replaceEqualDeep(
          previousResult.current,
          opts.select(resolvedState),
        )
        previousResult.current = newSlice
        return newSlice
      }
      return opts.select(resolvedState)
    }
    return resolvedState
  }) as UseRouterStateResult<TRouter, TSelected>
}
