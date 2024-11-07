import { useStore } from '@tanstack/react-store'
import { useRef } from 'react'
import { useRouter } from './useRouter'
import { replaceEqualDeep } from './utils'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'
import type { AnyRouter, RegisteredRouter, RouterState } from './router'

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

export function useRouterState<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TReturn = unknown extends TSelected
    ? RouterState<TRouter['routeTree']>
    : TSelected,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseRouterStateOptions<TRouter, TSelected, TStructuralSharing>,
): TReturn {
  const contextRouter = useRouter<TRouter>({
    warn: opts?.router === undefined,
  })
  const router = opts?.router || contextRouter
  const previousResult =
    useRef<ValidateSelected<TRouter, TSelected, TStructuralSharing>>()

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
  }) as TReturn
}
