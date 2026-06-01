import * as Solid from 'solid-js'
import { replaceEqualDeep } from '@tanstack/router-core'
import { useRouter } from './useRouter'
import type {
  AnyRouter,
  RegisteredRouter,
  RouterState,
} from '@tanstack/router-core'
import type { Accessor } from 'solid-js'

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
): Accessor<UseRouterStateResult<TRouter, TSelected>> {
  const contextRouter = useRouter<TRouter>({
    warn: opts?.router === undefined,
  })
  const router = opts?.router || contextRouter

  if (!opts?.select) {
    return (() => router.stores.__store.get()) as Accessor<
      UseRouterStateResult<TRouter, TSelected>
    >
  }

  const select = opts.select

  return Solid.createMemo((prev: TSelected | undefined) => {
    const res = select(router.stores.__store.get())
    if (prev === undefined) return res
    return replaceEqualDeep(prev, res)
  }, { transparent: true } as Solid.MemoOptions<TSelected> & {
    ssrSource?: 'server' | 'hybrid'
  }) as Accessor<
    UseRouterStateResult<TRouter, TSelected>
  >
}
