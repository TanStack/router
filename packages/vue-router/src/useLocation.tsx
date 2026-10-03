import { useSelector } from '@tanstack/vue-store'
import { isServer } from '@tanstack/router-core/isServer'
import * as Vue from 'vue'
import { useRouter } from './useRouter'
import type {
  AnyRouter,
  RegisteredRouter,
  RouterState,
} from '@tanstack/router-core'

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
): Vue.Ref<UseLocationResult<TRouter, TSelected>> {
  const router = useRouter<TRouter>()
  if (isServer ?? router.isServer) {
    const location = router.stores.location.get()
    const selected = opts?.select ? opts.select(location) : location
    return Vue.toRef(() => selected) as Vue.Ref<
      UseLocationResult<TRouter, TSelected>
    >
  }
  return useSelector(router.stores.location, (location) =>
    opts?.select ? opts.select(location) : location,
  ) as Vue.Ref<UseLocationResult<TRouter, TSelected>>
}
