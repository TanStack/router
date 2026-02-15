import { useStore } from '@tanstack/preact-store'
import { useRef } from 'preact/hooks'
import { replaceEqualDeep } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
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

  // During SSR we render exactly once and do not need reactivity.
  const _isServer = isServer ?? router.isServer
  if (_isServer) {
    const state = router.state as RouterState<TRouter['routeTree']>
    return (opts?.select ? opts.select(state) : state) as UseRouterStateResult<
      TRouter,
      TSelected
    >
  }

  const previousResult =
    useRef<ValidateSelected<TRouter, TSelected, TStructuralSharing>>(undefined as any)

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
  }) as UseRouterStateResult<TRouter, TSelected>
}
