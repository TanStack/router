import { useMatch } from './useMatch'
import type * as Vue from 'vue'
import type {
  AnyRouter,
  Register,
  RegisteredRouter,
  ResolveUseParams,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
  UseParamsResult,
} from '@tanstack/router-core'

export interface UseParamsBaseOptions<
  TRegister extends Register,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> {
  select?: (
    params: ResolveUseParams<RegisteredRouter<TRegister>, TFrom, TStrict>,
  ) => TSelected
  shouldThrow?: TThrow
}

export type UseParamsOptions<
  TRegister extends Register,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> = StrictOrFrom<RegisteredRouter<TRegister>, TFrom, TStrict> &
  UseParamsBaseOptions<TRegister, TFrom, TStrict, TThrow, TSelected>

export type UseParamsRoute<out TFrom> = <
  TRegister extends Register = Register,
  TSelected = unknown,
>(
  opts?: UseParamsBaseOptions<
    TRegister,
    TFrom,
    /* TStrict */ true,
    /* TThrow */ true,
    TSelected
  >,
) => Vue.Ref<UseParamsResult<RegisteredRouter<TRegister>, TFrom, true, TSelected>>

export function useParams<
  TRegister extends Register = Register,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
>(
  opts: UseParamsOptions<
    TRegister,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected
  >,
): Vue.Ref<
  ThrowOrOptional<
    UseParamsResult<RegisteredRouter<TRegister>, TFrom, TStrict, TSelected>,
    TThrow
  >
> {
  return useMatch({
    from: opts.from!,
    strict: opts.strict,
    shouldThrow: opts.shouldThrow,
    select: (match: any) => {
      return opts.select ? opts.select(match.params) : match.params
    },
  } as any) as any
}
