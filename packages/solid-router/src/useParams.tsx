import { useMatch } from './useMatch'
import type { Accessor } from 'solid-js'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'
import type {
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
  TStructuralSharing,
> {
  select?: (
    params: ResolveUseParams<TRegister, TFrom, TStrict>,
  ) => ValidateSelected<
    RegisteredRouter<TRegister>,
    TSelected,
    TStructuralSharing
  >
  shouldThrow?: TThrow
}

export type UseParamsOptions<
  TRegister extends Register,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
  TStructuralSharing,
> = StrictOrFrom<TRegister, TFrom, TStrict> &
  UseParamsBaseOptions<
    TRegister,
    TFrom,
    TStrict,
    TThrow,
    TSelected,
    TStructuralSharing
  > &
  StructuralSharingOption<
    RegisteredRouter<TRegister>,
    TSelected,
    TStructuralSharing
  >

export type UseParamsRoute<TRegister extends Register, out TFrom> = <
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseParamsBaseOptions<
    TRegister,
    TFrom,
    /* TStrict */ true,
    /* TThrow */ true,
    TSelected,
    TStructuralSharing
  > &
    StructuralSharingOption<
      RegisteredRouter<TRegister>,
      TSelected,
      TStructuralSharing
    >,
) => Accessor<UseParamsResult<TRegister, TFrom, true, TSelected>>

export function useParams<
  TRegister extends Register = Register,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts: UseParamsOptions<
    TRegister,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected,
    TStructuralSharing
  > = {} as any,
): Accessor<
  ThrowOrOptional<UseParamsResult<TRegister, TFrom, TStrict, TSelected>, TThrow>
> {
  return useMatch({
    from: opts.from!,
    shouldThrow: opts.shouldThrow,
    strict: opts.strict,
    structuralSharing: opts.structuralSharing,
    select: (match: any) => {
      const params = opts.strict === false ? match.params : match._strictParams

      return opts.select ? opts.select(params) : params
    },
  }) as Accessor<any>
}
