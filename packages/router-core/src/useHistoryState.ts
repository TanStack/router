import type { FullStateSchema, RouteById } from './routeInfo'
import type { AnyRouter } from './router'
import type { Expand } from './utils'

export type UseHistoryStateResult<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
> = unknown extends TSelected
  ? ResolveUseHistoryState<TRouter, TFrom, TStrict>
  : TSelected

export type ResolveUseHistoryState<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
> = TStrict extends false
  ? FullStateSchema<TRouter['routeTree']>
  : Expand<RouteById<TRouter['routeTree'], TFrom>['types']['fullStateSchema']>
