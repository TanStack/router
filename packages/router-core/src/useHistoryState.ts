import type { RouteById, RouteIds } from './routeInfo'
import type { AnyRouter, RegisteredRouter } from './router'
import type { Constrain, Expand } from './utils'

export type UseHistoryStateOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TState,
  TSelected,
> = {
  select?: (state: TState) => TSelected
  from?: Constrain<TFrom, RouteIds<TRouter['routeTree']>>
  strict?: TStrict
}

export type UseHistoryStateResult<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
> = TSelected extends never
  ? ResolveUseHistoryState<TRouter, TFrom, TStrict>
  : TSelected

export type ResolveUseHistoryState<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
> = TStrict extends false
  ? Expand<Partial<Record<string, unknown>>>
  : Expand<RouteById<TRouter['routeTree'], TFrom>['types']['fullStateSchema']>

export type UseHistoryStateRoute<out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = RouteById<TRouter['routeTree'], TFrom>['types']['stateSchema'],
  TStructuralSharing extends boolean = boolean,
>(opts?: {
  select?: (
    state: RouteById<TRouter['routeTree'], TFrom>['types']['stateSchema'],
  ) => TSelected
  structuralSharing?: TStructuralSharing
}) => UseHistoryStateResult<TRouter, TFrom, true, TSelected>
