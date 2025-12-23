import { useMatch } from './useMatch'
import type * as Vue from 'vue'
import type {
  AnyRouter,
  Register,
  RegisteredRouter,
  UseRouteContextBaseOptions,
  UseRouteContextOptions,
  UseRouteContextResult,
} from '@tanstack/router-core'

export type UseRouteContextRoute<out TFrom> = <
  TRegister extends Register = Register,
  TSelected = unknown,
>(
  opts?: UseRouteContextBaseOptions<
    RegisteredRouter<TRegister>,
    TFrom,
    true,
    TSelected
  >,
) => Vue.Ref<
  UseRouteContextResult<
    RegisteredRouter<TRegister>,
    TFrom,
    true,
    TSelected
  >
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
): Vue.Ref<
  UseRouteContextResult<
    RegisteredRouter<TRegister>,
    TFrom,
    TStrict,
    TSelected
  >
> {
  return useMatch({
    ...(opts as any),
    select: (match: any) =>
      opts.select ? opts.select(match.context) : match.context,
  }) as any
}
