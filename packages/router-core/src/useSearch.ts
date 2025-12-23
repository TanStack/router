import type { FullSearchSchema, RouteById } from './routeInfo'
import type { AnyRouter, Register, RegisteredRouter } from './router'
import type { Expand } from './utils'

export type UseSearchResult<
  TRouterOrRegister extends AnyRouter | Register,
  TFrom,
  TStrict extends boolean,
  TSelected,
> = unknown extends TSelected
  ? ResolveUseSearch<TRouterOrRegister, TFrom, TStrict>
  : TSelected

export type ResolveUseSearch<
  TRouterOrRegister extends AnyRouter | Register,
  TFrom,
  TStrict extends boolean,
  TRouter extends AnyRouter = TRouterOrRegister extends Register
    ? RegisteredRouter<TRouterOrRegister>
    : TRouterOrRegister,
> = TStrict extends false
  ? FullSearchSchema<TRouter['routeTree']>
  : Expand<RouteById<TRouter['routeTree'], TFrom>['types']['fullSearchSchema']>
