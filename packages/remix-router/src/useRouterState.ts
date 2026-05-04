import { useRouter } from './useRouter'
import { subscribeSelected } from './subscribe'
import type { Handle } from '@remix-run/ui'
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
 * Subscribe to the router's state with optional selection.
 *
 * Returns a getter `() => state` — call it inside the render function to
 * read the latest value. The component is registered with the store at
 * setup time and `handle.update()` fires on every change.
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useRouterStateHook
 */
export function useRouterState<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  handle: Handle<any, any>,
  opts?: UseRouterStateOptions<TRouter, TSelected, TStructuralSharing>,
): () => UseRouterStateResult<TRouter, TSelected> {
  const contextRouter = useRouter<TRouter>(handle, {
    warn: opts?.router === undefined,
  })
  const router = opts?.router || contextRouter
  return subscribeSelected(handle, router.stores.__store, {
    select: opts?.select as any,
    structuralSharing:
      opts?.structuralSharing ?? router.options.defaultStructuralSharing,
  }) as () => UseRouterStateResult<TRouter, TSelected>
}
