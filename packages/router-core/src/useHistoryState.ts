import type { RouteById } from './routeInfo'
import type { AnyRouter } from './router'
import type { Expand } from './utils'

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
