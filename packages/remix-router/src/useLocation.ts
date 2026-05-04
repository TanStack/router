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
 * Subscribe to the current location with optional selection.
 *
 * Returns a getter `() => location` — call it inside the render function.
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useLocationHook
 */
export function useLocation<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  handle: Handle<any, any>,
  opts?: UseLocationBaseOptions<TRouter, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
): () => UseLocationResult<TRouter, TSelected> {
  const router = useRouter<TRouter>(handle)
  return subscribeSelected(handle, router.stores.location, {
    select: opts?.select as any,
    structuralSharing:
      opts?.structuralSharing ?? router.options.defaultStructuralSharing,
  }) as () => UseLocationResult<TRouter, TSelected>
}
