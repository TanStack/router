import { rootRouteId } from './root'
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

  const isRootPending = pendingRoute.id === rootRouteId
  const pendingLabel = isRootPending ? 'the root route' : `"${pendingRoute.id}"`
  const lead =
    from === pendingRoute.id || (isRootPending && !from)
      ? `Cannot access route context for ${pendingLabel} inside its own pendingComponent.`
      : `Cannot access route context${from ? ` for "${from}"` : ''} inside the pendingComponent of ${pendingLabel}.`

  const parentId = pendingRoute.parentRoute?.id
  const guidance = parentId
    ? `Inside a pendingComponent, only parent route contexts can be accessed. To access inherited context, use \`useRouteContext({ from: ${parentId === rootRouteId ? 'rootRouteId' : `'${parentId}'`} })\`.`
    : 'Inside a pendingComponent, only parent route contexts can be accessed, and the root route has no parent.'

  throw new Error(`${lead} ${guidance}`)
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
