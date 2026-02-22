import { useStore } from './store'
import { useRouter } from './useRouter'
import type {
  AnyRouter,
  RegisteredRouter,
  RouterState,
} from '@tanstack/router-core'
import type { Accessor } from 'solid-js'

export interface UseLocationBaseOptions<TRouter extends AnyRouter, TSelected> {
  select?: (state: RouterState<TRouter['routeTree']>['location']) => TSelected
}

export type UseLocationResult<
  TRouter extends AnyRouter,
  TSelected,
> = unknown extends TSelected
  ? RouterState<TRouter['routeTree']>['location']
  : TSelected

export function useLocation<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseLocationBaseOptions<TRouter, TSelected>,
): Accessor<UseLocationResult<TRouter, TSelected>> {
  const router = useRouter<TRouter>()
  return useStore(
    router.stores.location,
    (location) => (opts?.select ? opts.select(location as any) : location) as any,
  ) as Accessor<UseLocationResult<TRouter, TSelected>>
}
