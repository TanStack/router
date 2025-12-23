import type { AllParams, RouteById } from './routeInfo'
import type { AnyRoute } from './route'
import type { AnyRouter, Register, RegisteredRouter } from './router'
import type { Expand } from './utils'

export type ResolveUseParams<
  TRouterOrRegister extends AnyRouter | Register,
  TFrom,
  TStrict extends boolean,
  TRouter extends AnyRouter = TRouterOrRegister extends Register
    ? RegisteredRouter<TRouterOrRegister>
    : TRouterOrRegister,
> = TStrict extends false
  ? AllParams<
      TRouter['routeTree'] extends AnyRoute ? TRouter['routeTree'] : AnyRoute
    >
  : Expand<
      RouteById<
        TRouter['routeTree'] extends AnyRoute ? TRouter['routeTree'] : AnyRoute,
        TFrom
      >['types']['allParams']
    >

export type UseParamsResult<
  TRouterOrRegister extends AnyRouter | Register,
  TFrom,
  TStrict extends boolean,
  TSelected,
> = unknown extends TSelected
  ? ResolveUseParams<TRouterOrRegister, TFrom, TStrict>
  : TSelected
