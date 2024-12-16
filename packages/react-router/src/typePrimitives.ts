import type {
  FromPathOption,
  NavigateOptions,
  PathParamOptions,
  SearchParamOptions,
  ToPathOption,
} from './link'
import type { RouteIds } from './routeInfo'
import type { AnyRouter, RegisteredRouter } from './router'
import type { ConstrainLiteral } from './utils'

export type ValidateFrom<
  TFrom,
  TRouter extends AnyRouter = RegisteredRouter,
> = FromPathOption<TRouter, TFrom>

export type ValidateTo<
  TTo extends string | undefined,
  TFrom extends string = string,
  TRouter extends AnyRouter = RegisteredRouter,
> = ToPathOption<TRouter, TFrom, TTo>

export type ValidateSearch<
  TTo extends string | undefined,
  TFrom extends string = string,
  TRouter extends AnyRouter = RegisteredRouter,
> = SearchParamOptions<TRouter, TFrom, TTo>

export type ValidateParams<
  TTo extends string | undefined,
  TFrom extends string = string,
  TRouter extends AnyRouter = RegisteredRouter,
> = PathParamOptions<TRouter, TFrom, TTo>

export type ValidateNavigateOptions<
  TTo extends string | undefined = undefined,
  TFrom extends string = string,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
  TRouter extends AnyRouter = RegisteredRouter,
> = NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>

export type ValidateId<
  TId extends string,
  TRouter extends AnyRouter = RegisteredRouter,
> = ConstrainLiteral<TId, RouteIds<TRouter['routeTree']>>
