import { useStore } from '@tanstack/solid-store'
import { useRouter } from './useRouter'
import type { Accessor } from 'solid-js'
import type { AnyRouter, RegisteredRouter, RouterState } from './router'

export type UseRouterStateOptions<TRouter extends AnyRouter, TSelected> = {
  router?: TRouter
  select?: (state: RouterState<TRouter['routeTree']>) => TSelected // TODO: might need to ValidateJSON here
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
