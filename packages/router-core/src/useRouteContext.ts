import type { AnyRoute } from './route'
import type { AllContext, RouteById } from './routeInfo'
import type { AnyRouter } from './router'
import type { Expand, StrictOrFrom } from './utils'

export function _assertPendingRouteContextAccess(
  pendingRoute: AnyRoute,
  from: string | undefined,
): void {
  if (from) {
    let parent = pendingRoute.parentRoute
    while (parent) {
      if (parent.id === from) {
        return
      }
      parent = parent.parentRoute
    }
  }

  throw new Error(
    `Cannot access route context${from ? ` for "${from}"` : ''} inside the pendingComponent of "${pendingRoute.id}". Inside a pendingComponent, only parent route contexts can be accessed.`,
  )
}

export interface UseRouteContextBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
> {
  select?: (
    search: ResolveUseRouteContext<TRouter, TFrom, TStrict>,
  ) => TSelected
}

export type UseRouteContextOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TSelected,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  UseRouteContextBaseOptions<TRouter, TFrom, TStrict, TSelected>

export type ResolveUseRouteContext<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
> = TStrict extends false
  ? AllContext<TRouter['routeTree']>
  : Expand<RouteById<TRouter['routeTree'], TFrom>['types']['allContext']>

export type UseRouteContextResult<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
> = unknown extends TSelected
  ? ResolveUseRouteContext<TRouter, TFrom, TStrict>
  : TSelected
