import { useMatch } from './useMatch'
import type {
  AnyRouter,
  Constrain,
  Expand,
  RegisteredRouter,
  RouteById,
  RouteIds,
  UseHistoryStateResult,
} from '@tanstack/router-core'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'

// Resolving HistoryState from our custom implementation
type ResolveUseHistoryState<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
> = TStrict extends false
  ? Expand<Partial<Record<string, unknown>>>
  : Expand<RouteById<TRouter['routeTree'], TFrom>['types']['stateSchema']>

export interface UseHistoryStateBaseOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TSelected,
  TStructuralSharing extends boolean,
> {
  select?: (
    state: ResolveUseHistoryState<TRouter, TFrom, TStrict>,
  ) => ValidateSelected<TRouter, TSelected, TStructuralSharing>
  from?: Constrain<TFrom, RouteIds<TRouter['routeTree']>>
  strict?: TStrict
}

export type UseHistoryStateOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TSelected,
  TStructuralSharing extends boolean,
> = UseHistoryStateBaseOptions<
  TRouter,
  TFrom,
  TStrict,
  TSelected,
  TStructuralSharing
> &
  StructuralSharingOption<TRouter, TSelected, TStructuralSharing>

export function useHistoryState<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TState = TStrict extends false
    ? Expand<Partial<Record<string, unknown>>>
    : Expand<RouteById<TRouter['routeTree'], TFrom>['types']['stateSchema']>,
  TSelected = TState,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseHistoryStateOptions<
    TRouter,
    TFrom,
    TStrict,
    TSelected,
    TStructuralSharing
  >,
): UseHistoryStateResult<TRouter, TFrom, TStrict, TSelected> {
  return useMatch({
  from: opts?.from,
  strict: opts?.strict,
  structuralSharing: opts?.structuralSharing,
  select: (match: any) => {
    // state property should be available on the match object
    const state = match.state || {};
    return opts?.select ? opts.select(state) : state;
  },
} as any) as unknown as UseHistoryStateResult<TRouter, TFrom, TStrict, TSelected>
}

export type UseHistoryStateRoute<out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = RouteById<TRouter['routeTree'], TFrom>['types']['stateSchema'],
  TStructuralSharing extends boolean = boolean,
>(
  opts?: {
    select?: (
      state: RouteById<TRouter['routeTree'], TFrom>['types']['stateSchema'],
    ) => ValidateSelected<TRouter, TSelected, TStructuralSharing>
  } & StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
) => UseHistoryStateResult<TRouter, TFrom, true, TSelected>
