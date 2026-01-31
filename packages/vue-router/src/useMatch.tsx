import * as Vue from 'vue'
import { useRouterState } from './useRouterState'
import { injectDummyMatch, injectMatch } from './matchContext'
import type {
  AnyRouter,
  MakeRouteMatch,
  MakeRouteMatchUnion,
  RegisteredRouter,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
} from '@tanstack/router-core'

export interface UseMatchBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> {
  select?: (
    match: MakeRouteMatch<TRouter['routeTree'], TFrom, TStrict>,
  ) => TSelected
  shouldThrow?: TThrow
}

export type UseMatchRoute<out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseMatchBaseOptions<TRouter, TFrom, true, true, TSelected>,
) => Vue.Ref<UseMatchResult<TRouter, TFrom, true, TSelected>>

export type UseMatchOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  UseMatchBaseOptions<TRouter, TFrom, TStrict, TThrow, TSelected>

export type UseMatchResult<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
> = unknown extends TSelected
  ? TStrict extends true
    ? MakeRouteMatch<TRouter['routeTree'], TFrom, TStrict>
    : MakeRouteMatchUnion<TRouter>
  : TSelected

export function useMatch<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
>(
  opts: UseMatchOptions<
    TRouter,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected
  >,
): Vue.Ref<
  ThrowOrOptional<UseMatchResult<TRouter, TFrom, TStrict, TSelected>, TThrow>
> {
  const nearestMatchId = opts.from ? injectDummyMatch() : injectMatch()

  // Select the match from router state, returning match and whether to throw
  const matchState = useRouterState({
    select: (state: any) => {
      const match = state.matches.find((d: any) =>
        opts.from ? opts.from === d.routeId : d.id === nearestMatchId.value,
      )

      if (match === undefined) {
        // Determine if we should throw an error
        const shouldThrowError =
          !state.isLoading &&
          !state.isTransitioning &&
          (opts.shouldThrow ?? true)

        return { match: undefined, shouldThrowError }
      }

      return {
        match: opts.select ? opts.select(match) : match,
        shouldThrowError: false,
      }
    },
  } as any) as Vue.Ref<{ match: any; shouldThrowError: boolean }>

  // Computed that throws when appropriate
  const result = Vue.computed(() => {
    const state = matchState.value
    if (state.shouldThrowError) {
      throw new Error(
        `Invariant failed: Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
      )
    }
    return state.match
  })

  // Also immediately check for initial render throw
  if (matchState.value.shouldThrowError) {
    throw new Error(
      `Invariant failed: Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
    )
  }

  return result as any
}
