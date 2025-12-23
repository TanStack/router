import { useMatch } from './useMatch'
import type { Accessor } from 'solid-js'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'
import type {
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
  TStructuralSharing,
> {
  select?: (
    state: ResolveUseSearch<TRegister, TFrom, TStrict>,
  ) => ValidateSelected<
    TRegister,
    TSelected,
    TStructuralSharing
  >
  shouldThrow?: TThrow
}

export type UseSearchOptions<
  TRegister extends Register,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
  TStructuralSharing,
> = StrictOrFrom<TRegister, TFrom, TStrict> &
  UseSearchBaseOptions<
    TRegister,
    TFrom,
    TStrict,
    TThrow,
    TSelected,
    TStructuralSharing
  > &
  StructuralSharingOption<
    TRegister,
    TSelected,
    TStructuralSharing
  >

export type UseSearchRoute<TRegister extends Register, out TFrom> = <
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseSearchBaseOptions<
    TRegister,
    TFrom,
    /* TStrict */ true,
    /* TThrow */ true,
    TSelected,
    TStructuralSharing
  > &
    StructuralSharingOption<
      TRegister,
      TSelected,
      TStructuralSharing
    >,
) => Accessor<
  UseSearchResult<TRegister, TFrom, true, TSelected>
>

export function useSearch<
  TRegister extends Register = Register,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts: UseSearchOptions<
    TRegister,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected,
    TStructuralSharing
  > = {} as any,
): Accessor<
  ThrowOrOptional<
    UseSearchResult<TRegister, TFrom, TStrict, TSelected>,
    TThrow
  >
> {
  return useMatch({
    from: opts.from!,
    strict: opts.strict,
    shouldThrow: opts.shouldThrow,
    structuralSharing: opts.structuralSharing,
    select: (match: any) => {
      return opts.select ? opts.select(match.search) : match.search
    },
  }) as any
}
