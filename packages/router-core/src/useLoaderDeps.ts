import type { RouteById } from './routeInfo'
import type { AnyRouter, Register, RegisteredRouter } from './router'
import type { Expand } from './utils'

export type ResolveUseLoaderDeps<
  TRouterOrRegister extends AnyRouter | Register,
  TFrom,
  TRouter extends AnyRouter = TRouterOrRegister extends Register
    ? RegisteredRouter<TRouterOrRegister>
    : TRouterOrRegister,
> = Expand<RouteById<TRouter['routeTree'], TFrom>['types']['loaderDeps']>

export type UseLoaderDepsResult<
  TRouterOrRegister extends AnyRouter | Register,
  TFrom,
  TSelected,
> = unknown extends TSelected
  ? ResolveUseLoaderDeps<TRouterOrRegister, TFrom>
  : TSelected
