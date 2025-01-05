import { useMatch } from './useMatch'
import type { AllContext, RouteById } from './routeInfo'
import type { AnyRouter, RegisteredRouter } from './router'
import type { Expand, StrictOrFrom } from './utils'

export interface UseRouteContextBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
> {
  select?: (search: ResolveRouteContext<TRouter, TFrom, TStrict>) => TSelected
}

export type UseRouteContextOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TSelected,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  UseRouteContextBaseOptions<TRouter, TFrom, TStrict, TSelected>

export type ResolveRouteContext<
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
  ? ResolveRouteContext<TRouter, TFrom, TStrict>
  : TSelected

export type UseRouteContextRoute<out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseRouteContextBaseOptions<TRouter, TFrom, true, TSelected>,
) => UseRouteContextResult<TRouter, TFrom, true, TSelected>

export function useRouteContext<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
>(
  opts: UseRouteContextOptions<TRouter, TFrom, TStrict, TSelected>,
): UseRouteContextResult<TRouter, TFrom, TStrict, TSelected> {
  return useMatch({
    ...(opts as any),
    select: (match) =>
      opts.select ? opts.select(match.context) : match.context,
  }) as UseRouteContextResult<TRouter, TFrom, TStrict, TSelected>
}
