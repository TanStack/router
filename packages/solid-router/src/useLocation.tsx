import * as Solid from 'solid-js'
import { useRouter } from './useRouter'
import { shallow } from "./store"
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
  return Solid.createMemo(
    () => {
      const state = router.stores.location.state
      return opts?.select ? opts.select(state) : state
    },
    undefined,
    { equals: shallow },
  ) as Accessor<UseLocationResult<TRouter, TSelected>>
}
