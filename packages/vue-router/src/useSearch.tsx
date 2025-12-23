import { useMatch } from './useMatch'
import type * as Vue from 'vue'
import type {
  AnyRouter,
  Register,
  RegisteredRouter,
  ResolveUseSearch,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
  UseSearchResult,
} from '@tanstack/router-core'

export interface UseSearchBaseOptions<
  TRegister extends Register,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> {
  select?: (
    state: ResolveUseSearch<RegisteredRouter<TRegister>, TFrom, TStrict>,
  ) => TSelected
  shouldThrow?: TThrow
}

export type UseSearchOptions<
  TRegister extends Register,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> = StrictOrFrom<RegisteredRouter<TRegister>, TFrom, TStrict> &
  UseSearchBaseOptions<TRegister, TFrom, TStrict, TThrow, TSelected>

export type UseSearchRoute<out TFrom> = <
  TRegister extends Register = Register,
  TSelected = unknown,
>(
  opts?: UseSearchBaseOptions<
    TRegister,
    TFrom,
    /* TStrict */ true,
    /* TThrow */ true,
    TSelected
  >,
) => Vue.Ref<UseSearchResult<RegisteredRouter<TRegister>, TFrom, true, TSelected>>

export function useSearch<
  TRegister extends Register = Register,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
>(
  opts: UseSearchOptions<
    TRegister,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected
  >,
): Vue.Ref<
  ThrowOrOptional<
    UseSearchResult<RegisteredRouter<TRegister>, TFrom, TStrict, TSelected>,
    TThrow
  >
> {
  return useMatch({
    from: opts.from!,
    strict: opts.strict,
    shouldThrow: opts.shouldThrow,
    select: (match: any) => {
      return opts.select ? opts.select(match.search) : match.search
    },
  }) as any
}
