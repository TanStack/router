import type { NavigateOptions } from './link'
import type { AnyRouter, Register } from './router'
import type { RegisteredRouterOf } from './route-module'

export type UseNavigateResult<
  TDefaultFrom extends string,
  TDefaultRegister = Register,
> = <
  TRouter extends AnyRouter = RegisteredRouterOf<TDefaultRegister>,
  // A default equal to the constraint keeps the inference of a destination-less
  // call unchanged while allowing the router type to have a default.
  TTo extends string | undefined = string | undefined,
  TFrom extends string = TDefaultFrom,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
>({
  from,
  ...rest
}: NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>) => Promise<void>
