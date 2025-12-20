import type { NavigateOptions } from './link'
import type { Register, RegisteredRouter } from './router'

export type UseNavigateResult<
  TRegister extends Register = Register,
  TDefaultFrom extends string = string,
> = <
  TRouter extends RegisteredRouter<TRegister> = RegisteredRouter<TRegister>,
  TTo extends string | undefined = undefined,
  TFrom extends string = TDefaultFrom,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
>({
  from,
  ...rest
}: NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>) => Promise<void>
