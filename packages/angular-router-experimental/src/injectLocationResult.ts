import { injectRouterState } from './injectRouterState'
import type * as Angular from '@angular/core'
import type { AnyRouter, RegisteredRouter, RouterState } from '@tanstack/router-core'

export interface InjectLocationOptions<TRouter extends AnyRouter, TSelected> {
  select?: (
    location: RouterState<TRouter['routeTree']>['location'],
  ) => TSelected
}

export type InjectLocationResult<
  TRouter extends AnyRouter,
  TSelected,
> = unknown extends TSelected
  ? RouterState<TRouter['routeTree']>['location']
  : TSelected

export function injectLocation<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: InjectLocationOptions<TRouter, TSelected>,
): Angular.Signal<InjectLocationResult<TRouter, TSelected>> {
  return injectRouterState({
    select: (s) => (opts?.select ? opts.select(s.location) : s.location),
  }) as any
}
