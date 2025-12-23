import { useStore } from '@tanstack/vue-store'
import * as Vue from 'vue'
import { useRouter } from './useRouter'
import type {
  AnyRouter,
  Register,
  RegisteredRouter,
  RouterState,
} from '@tanstack/router-core'

export type UseRouterStateOptions<
  TRegister extends Register,
  TSelected,
> = {
  router?: RegisteredRouter<TRegister>
  select?: (
    state: RouterState<RegisteredRouter<TRegister>['routeTree']>,
  ) => TSelected
}

export type UseRouterStateResult<
  TRegister extends Register,
  TSelected,
> = unknown extends TSelected
  ? RouterState<RegisteredRouter<TRegister>['routeTree']>
  : TSelected

export function useRouterState<
  TRegister extends Register = Register,
  TSelected = unknown,
>(
  opts?: UseRouterStateOptions<TRegister, TSelected>,
): Vue.Ref<UseRouterStateResult<TRegister, TSelected>> {
  const contextRouter = useRouter<TRegister>({
    warn: opts?.router === undefined,
  })
  const router = (opts?.router || contextRouter) as AnyRouter

  // Return a safe default if router is undefined
  if (!router || !router.__store) {
    return Vue.ref(undefined) as Vue.Ref<
      UseRouterStateResult<TRegister, TSelected>
    >
  }

  return useStore(router.__store, (state) => {
    if (opts?.select) return opts.select(state as any)

    return state
  }) as Vue.Ref<UseRouterStateResult<TRegister, TSelected>>
}
