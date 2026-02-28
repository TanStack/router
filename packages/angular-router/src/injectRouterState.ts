import { injectStore } from '@tanstack/angular-store'
import { injectRouter } from './injectRouter'
import type * as Angular from '@angular/core'
import type {
  AnyRouter,
  RegisteredRouter,
  RouterState,
} from '@tanstack/router-core'

export type InjectRouterStateOptions<TRouter extends AnyRouter, TSelected> = {
  router?: TRouter
  select?: (state: RouterState<TRouter['routeTree']>) => TSelected
}

export type InjectRouterStateResult<
  TRouter extends AnyRouter,
  TSelected,
> = unknown extends TSelected ? RouterState<TRouter['routeTree']> : TSelected

export function injectRouterState<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: InjectRouterStateOptions<TRouter, TSelected>,
): Angular.Signal<InjectRouterStateResult<TRouter, TSelected>> {
  const contextRouter = injectRouter({
    warn: opts?.router === undefined,
  })

  const router = opts?.router ?? contextRouter

  return injectStore(router.__store, (state) => {
    if (opts?.select) return opts.select(state)

    return state
  }) as Angular.Signal<InjectRouterStateResult<TRouter, TSelected>>
}
