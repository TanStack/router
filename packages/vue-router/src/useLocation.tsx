import { useSelector } from '@tanstack/vue-store'
import { useRouter } from './useRouter'
import type {
  AnyRouter,
  Register,
  RegisteredRouter,
  RegisteredRouterOf,
  RouterState,
} from '@tanstack/router-core'
import type * as Vue from 'vue'

export interface UseLocationBaseOptions<TRouter extends AnyRouter, TSelected> {
  select?: (state: RouterState<TRouter['routeTree']>['location']) => TSelected
}

export type UseLocationResult<
  TRouter extends AnyRouter,
  TSelected,
> = unknown extends TSelected
  ? RouterState<TRouter['routeTree']>['location']
  : TSelected

/**
 * The signature of `useLocation`, typed against the router of `TDefaultRegister` unless a router
 * type is passed explicitly. Route modules export a `useLocation` of this type.
 */
export type UseLocationFn<TDefaultRegister = Register> = <
  TRouter extends AnyRouter = RegisteredRouterOf<TDefaultRegister>,
  TSelected = unknown,
>(
  opts?: UseLocationBaseOptions<TRouter, TSelected>,
) => Vue.Ref<UseLocationResult<TRouter, TSelected>>

export function useLocation<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseLocationBaseOptions<TRouter, TSelected>,
): Vue.Ref<UseLocationResult<TRouter, TSelected>> {
  const router = useRouter<TRouter>()
  return useSelector(router.stores.location, (location) =>
    opts?.select ? opts.select(location) : location,
  ) as Vue.Ref<UseLocationResult<TRouter, TSelected>>
}
