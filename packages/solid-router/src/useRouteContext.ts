import { useMatch } from './useMatch'
import type { Accessor } from 'solid-js'
import type {
  Register,
  RegisteredRouter,
  UseRouteContextBaseOptions,
  UseRouteContextOptions,
  UseRouteContextResult,
} from '@tanstack/router-core'

export type UseRouteContextRoute<TRegister extends Register, out TFrom> = <
  TSelected = unknown,
>(
  opts?: UseRouteContextBaseOptions<
    RegisteredRouter<TRegister>,
    TFrom,
    true,
    TSelected
  >,
) => Accessor<
  UseRouteContextResult<RegisteredRouter<TRegister>, TFrom, true, TSelected>
>

export function useRouteContext<
  TRegister extends Register = Register,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
>(
  opts: UseRouteContextOptions<
    RegisteredRouter<TRegister>,
    TFrom,
    TStrict,
    TSelected
  >,
): Accessor<
  UseRouteContextResult<RegisteredRouter<TRegister>, TFrom, TStrict, TSelected>
> {
  return useMatch({
    ...(opts as any),
    select: (match: any) =>
      opts.select ? opts.select(match.context) : match.context,
  }) as any
}
