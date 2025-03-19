import { useStore } from '@tanstack/vue-store'
import { useRouter } from './useRouter'
import type {
  AnyRouter,
  RegisteredRouter,
  RouterState,
} from '@tanstack/router-core'
import type * as Vue from 'vue'

export type UseRouterStateOptions<TRouter extends AnyRouter, TSelected> = {
  router?: TRouter
  select?: (state: RouterState<TRouter['routeTree']>) => TSelected
}

export type UseRouterStateResult<
  TRouter extends AnyRouter,
  TSelected,
> = unknown extends TSelected ? RouterState<TRouter['routeTree']> : TSelected

export function useRouterState<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseRouterStateOptions<TRouter, TSelected>,
): Vue.Ref<UseRouterStateResult<TRouter, TSelected>> {
  const contextRouter = useRouter<TRouter>({
    warn: opts?.router === undefined,
  })
  const router = opts?.router || contextRouter

  return useStore(router.__store, (state) => {
    if (opts?.select) return opts.select(state)

    return state
  }) as Vue.Ref<UseRouterStateResult<TRouter, TSelected>>
}
