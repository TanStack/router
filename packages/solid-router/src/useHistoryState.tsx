import { useMatch } from './useMatch'
import type { Accessor } from 'solid-js'
import type {
  AnyRouter,
  RegisteredRouter,
  ResolveUseHistoryState,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
  UseHistoryStateResult,
} from '@tanstack/router-core'

export interface UseHistoryStateBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> {
  select?: (state: ResolveUseHistoryState<TRouter, TFrom, TStrict>) => TSelected
  shouldThrow?: TThrow
}

export type UseHistoryStateOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  UseHistoryStateBaseOptions<TRouter, TFrom, TStrict, TThrow, TSelected>

export type UseHistoryStateRoute<TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseHistoryStateBaseOptions<
    TRouter,
    TFrom,
    /* TStrict */ true,
    /* TThrow */ true,
    TSelected
  >,
) => Accessor<UseHistoryStateResult<TRouter, TFrom, true, TSelected>>

export function useHistoryState<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
>(
  opts: UseHistoryStateOptions<
    TRouter,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected
  >,
): Accessor<
  ThrowOrOptional<
    UseHistoryStateResult<TRouter, TFrom, TStrict, TSelected>,
    TThrow
  >
> {
  return useMatch({
    from: opts.from!,
    strict: opts.strict,
    shouldThrow: opts.shouldThrow,
    select: (match: any) => {
      // `_strictState` only ever holds the output of the `validateState`
      // validators along the route chain, so it is guaranteed to match the
      // validated type. `match.state` is the loose merge of the raw history
      // state and would leak unvalidated keys.
      const typedState = match._strictState as ResolveUseHistoryState<
        TRouter,
        TFrom,
        TStrict
      >
      return opts.select ? opts.select(typedState) : typedState
    },
  }) as any
}
