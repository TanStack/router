import { omitInternalKeys } from '@tanstack/history'
import { useMatch } from './useMatch'
import type {
  AnyRouter,
  RegisteredRouter,
  ResolveUseHistoryState,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
  UseHistoryStateResult,
} from '@tanstack/router-core'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'

export interface UseHistoryStateBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
  TStructuralSharing,
> {
  select?: (
    state: ResolveUseHistoryState<TRouter, TFrom, TStrict>,
  ) => ValidateSelected<TRouter, TSelected, TStructuralSharing>
  shouldThrow?: TThrow
}

export type UseHistoryStateOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
  TStructuralSharing,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  UseHistoryStateBaseOptions<
    TRouter,
    TFrom,
    TStrict,
    TThrow,
    TSelected,
    TStructuralSharing
  > &
  StructuralSharingOption<TRouter, TSelected, TStructuralSharing>

export type UseHistoryStateRoute<out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseHistoryStateBaseOptions<
    TRouter,
    TFrom,
    /* TStrict */ true,
    /* TThrow */ true,
    TSelected,
    TStructuralSharing
  > &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
) => UseHistoryStateResult<TRouter, TFrom, true, TSelected>

export function useHistoryState<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts: UseHistoryStateOptions<
    TRouter,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected,
    TStructuralSharing
  >,
): ThrowOrOptional<
  UseHistoryStateResult<TRouter, TFrom, TStrict, TSelected>,
  TThrow
> {
  return useMatch({
    from: opts.from!,
    strict: opts.strict,
    shouldThrow: opts.shouldThrow,
    structuralSharing: opts.structuralSharing,
    select: (match: any) => {
      const matchState = match.state
      const filteredState = omitInternalKeys(matchState)
      const typedState = filteredState as unknown as ResolveUseHistoryState<
        TRouter,
        TFrom,
        TStrict
      >
      return opts.select ? opts.select(typedState) : typedState
    },
  } as any) as any
}
