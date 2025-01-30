import { useStore } from '@tanstack/solid-store'
import { useRouter } from './useRouter'
import type { AnyRouter, RegisteredRouter, RouterState } from './router'
import type { Accessor } from 'solid-js'
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

export function useRouterState<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseRouterStateOptions<TRouter, TSelected, TStructuralSharing>,
): Accessor<UseRouterStateResult<TRouter, TSelected>> {
  const contextRouter = useRouter<TRouter>({
    warn: opts?.router === undefined,
  })
  const router = opts?.router || contextRouter

  return useStore(router.__store, (state) => {
    if (opts?.select) return opts.select(state)

    return state
  }) as Accessor<UseRouterStateResult<TRouter, TSelected>>
}
