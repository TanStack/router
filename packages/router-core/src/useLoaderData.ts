import type { AllLoaderData, RouteById } from './routeInfo'
import type { AnyRouter, Register, RegisteredRouter } from './router'
import type { Expand } from './utils'

export type ResolveUseLoaderData<
  TRouterOrRegister extends AnyRouter | Register,
  TFrom,
  TStrict extends boolean,
  TRouter extends AnyRouter = TRouterOrRegister extends Register
    ? RegisteredRouter<TRouterOrRegister>
    : TRouterOrRegister,
> = TStrict extends false
  ? AllLoaderData<TRouter['routeTree']>
  : Expand<RouteById<TRouter['routeTree'], TFrom>['types']['loaderData']>

export type UseLoaderDataResult<
  TRouterOrRegister extends AnyRouter | Register,
  TFrom,
  TStrict extends boolean,
  TSelected,
> = unknown extends TSelected
  ? ResolveUseLoaderData<TRouterOrRegister, TFrom, TStrict>
  : TSelected
