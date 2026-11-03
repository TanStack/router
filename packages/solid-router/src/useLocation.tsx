import * as Solid from 'solid-js'
import { replaceEqualDeep } from '@tanstack/router-core'
import { useRouter } from './useRouter'
import type {
  AnyRouter,
  Register,
  RegisteredRouter,
  RegisteredRouterOf,
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

/**
 * The signature of `useLocation`, typed against the router of `TDefaultRegister` unless a router
 * type is passed explicitly. Route modules export a `useLocation` of this type.
 */
export type UseLocationFn<TDefaultRegister = Register> = <
  TRouter extends AnyRouter = RegisteredRouterOf<TDefaultRegister>,
  TSelected = unknown,
>(
  opts?: UseLocationBaseOptions<TRouter, TSelected>,
) => Accessor<UseLocationResult<TRouter, TSelected>>

export function useLocation<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseLocationBaseOptions<TRouter, TSelected>,
): Accessor<UseLocationResult<TRouter, TSelected>> {
  const router = useRouter<TRouter>()

  if (!opts?.select) {
    return (() => router.stores.location.get()) as Accessor<
      UseLocationResult<TRouter, TSelected>
    >
  }

  const select = opts.select

  return Solid.createMemo((prev: TSelected | undefined) => {
    const res = select(router.stores.location.get())
    if (prev === undefined) return res
    return replaceEqualDeep(prev, res)
  }) as Accessor<UseLocationResult<TRouter, TSelected>>
}
