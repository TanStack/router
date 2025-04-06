import { useMatch } from './useMatch'
import { useLocation } from './useLocation'
import type {
  AnyRouter,
  Constrain,
  Expand,
  RegisteredRouter,
  RouteById,
  RouteIds,
  ThrowConstraint,
  ThrowOrOptional,
  UseHistoryStateResult,
} from '@tanstack/router-core'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'

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
  TStructuralSharing extends boolean,
> {
  select?: (
    state: ResolveUseHistoryState<TRouter, TFrom, TStrict>,
  ) => ValidateSelected<TRouter, TSelected, TStructuralSharing>
  from?: Constrain<TFrom, RouteIds<TRouter['routeTree']>>
  strict?: TStrict
  shouldThrow?: TThrow
}

export type UseHistoryStateOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
  TStructuralSharing extends boolean,
> = UseHistoryStateBaseOptions<
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
  TSelected = RouteById<TRouter['routeTree'], TFrom>['types']['stateSchema'],
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
  TState = TStrict extends false
    ? Expand<Partial<Record<string, unknown>>>
    : Expand<RouteById<TRouter['routeTree'], TFrom>['types']['stateSchema']>,
  TSelected = TState,
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
    select: () => {
      const locationState = useLocation().state
      const typedState = locationState as unknown as ResolveUseHistoryState<TRouter, TFrom, TStrict>;
      return opts.select ? opts.select(typedState) : typedState;
    },
  } as any) as any;
}
