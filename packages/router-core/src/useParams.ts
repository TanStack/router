import type { AllParams, RouteById } from './routeInfo'
import type { AnyRoute } from './route'
import type { AnyRouter, Register, RegisteredRouter } from './router'
import type { Expand } from './utils'

export type ResolveUseParams<
  TRegister extends Register,
  TFrom,
  TStrict extends boolean,
> = TStrict extends false
  ? AllParams<
      RegisteredRouter<TRegister>['routeTree'] extends AnyRoute
        ? RegisteredRouter<TRegister>['routeTree']
        : AnyRoute
    >
  : Expand<
      RouteById<
        RegisteredRouter<TRegister>['routeTree'] extends AnyRoute
          ? RegisteredRouter<TRegister>['routeTree']
          : AnyRoute,
        TFrom
      >['types']['allParams']
    >

export type UseParamsResult<
  TRegister extends Register,
  TFrom,
  TStrict extends boolean,
  TSelected,
> = unknown extends TSelected
  ? ResolveUseParams<TRegister, TFrom, TStrict>
  : TSelected
