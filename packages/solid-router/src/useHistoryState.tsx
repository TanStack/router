import { omitInternalKeys } from '@tanstack/history'
import { useMatch } from './useMatch'
import type { Accessor } from 'solid-js'
import type {
  AnyRouter,
  Expand,
  RegisteredRouter,
  RouteById,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
  UseHistoryStateResult,
} from '@tanstack/router-core'

type ResolveUseHistoryState<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
> = TStrict extends false
  ? Expand<Partial<Record<string, unknown>>>
  : Expand<RouteById<TRouter['routeTree'], TFrom>['types']['stateSchema']>

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
  TFrom extends string | undefined,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  UseHistoryStateBaseOptions<TRouter, TFrom, TStrict, TThrow, TSelected>

export type UseHistoryStateRoute<TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = RouteById<TRouter['routeTree'], TFrom>['types']['stateSchema'],
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
  TState = TStrict extends false
    ? Expand<Partial<Record<string, unknown>>>
    : Expand<RouteById<TRouter['routeTree'], TFrom>['types']['stateSchema']>,
  TSelected = TState,
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
      const matchState = match.state
      const filteredState = omitInternalKeys(matchState)
      const typedState = filteredState as unknown as ResolveUseHistoryState<
        TRouter,
        TFrom,
        TStrict
      >
      return opts.select ? opts.select(typedState) : typedState
    },
  }) as any
}
