import { useMatch } from './useMatch'
import type { ThrowConstraint } from './useMatch'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'
import type { AnyRouter, RegisteredRouter } from './router'
import type {
  ResolveUseParams,
  StrictOrFrom,
  ThrowOrOptional,
  UseParamsResult,
} from '@tanstack/router-core'
import type { Accessor } from 'solid-js'

export interface UseParamsBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
  TStructuralSharing,
> {
  select?: (
    params: ResolveUseParams<TRouter, TFrom, TStrict>,
  ) => ValidateSelected<TRouter, TSelected, TStructuralSharing>
  shouldThrow?: TThrow
}

export type UseParamsOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
  TStructuralSharing,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  UseParamsBaseOptions<
    TRouter,
    TFrom,
    TStrict,
    TThrow,
    TSelected,
    TStructuralSharing
  > &
  StructuralSharingOption<TRouter, TSelected, TStructuralSharing>

export type UseParamsRoute<out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseParamsBaseOptions<
    TRouter,
    TFrom,
    /* TStrict */ true,
    /* TThrow */ true,
    TSelected,
    TStructuralSharing
  > &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
) => Accessor<UseParamsResult<TRouter, TFrom, true, TSelected>>

export function useParams<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts: UseParamsOptions<
    TRouter,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected,
    TStructuralSharing
  >,
): Accessor<ThrowOrOptional<
  UseParamsResult<TRouter, TFrom, TStrict, TSelected>,
  TThrow
>> {
  return useMatch({
    from: opts.from!,
    strict: opts.strict,
    shouldThrow: opts.shouldThrow,
    structuralSharing: opts.structuralSharing,
    select: (match: any) => {
      return opts.select ? opts.select(match.params) : match.params
    },
  }) as any
}
