import * as Vue from 'vue'
import { useRouterState } from './useRouterState'
import { injectDummyMatch, injectMatch } from './matchContext'
import type {
  AnyRouter,
  MakeRouteMatch,
  MakeRouteMatchUnion,
  Register,
  RegisteredRouter,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
} from '@tanstack/router-core'

export interface UseMatchBaseOptions<
  TRegister extends Register,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> {
  select?: (
    match: MakeRouteMatch<
      RegisteredRouter<TRegister>['routeTree'],
      TFrom,
      TStrict
    >,
  ) => TSelected
  shouldThrow?: TThrow
}

export type UseMatchRoute<out TFrom> = <
  TRegister extends Register = Register,
  TSelected = unknown,
>(
  opts?: UseMatchBaseOptions<TRegister, TFrom, true, true, TSelected>,
) => Vue.Ref<UseMatchResult<TRegister, TFrom, true, TSelected>>

export type UseMatchOptions<
  TRegister extends Register,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> = StrictOrFrom<RegisteredRouter<TRegister>, TFrom, TStrict> &
  UseMatchBaseOptions<TRegister, TFrom, TStrict, TThrow, TSelected>

export type UseMatchResult<
  TRegister extends Register,
  TFrom,
  TStrict extends boolean,
  TSelected,
> = unknown extends TSelected
  ? TStrict extends true
    ? MakeRouteMatch<RegisteredRouter<TRegister>['routeTree'], TFrom, TStrict>
    : MakeRouteMatchUnion<RegisteredRouter<TRegister>>
  : TSelected

export function useMatch<
  TRegister extends Register = Register,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
>(
  opts: UseMatchOptions<
    TRegister,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected
  >,
): Vue.Ref<
  ThrowOrOptional<UseMatchResult<TRegister, TFrom, TStrict, TSelected>, TThrow>
> {
  const nearestMatchId = opts.from ? injectDummyMatch() : injectMatch()

  // Store to track pending error for deferred throwing
  const pendingError = Vue.ref<Error | null>(null)

  // Select the match from router state
  const matchSelection = useRouterState({
    select: (state: any) => {
      const match = state.matches.find((d: any) =>
        opts.from ? opts.from === d.routeId : d.id === nearestMatchId.value,
      )

      if (match === undefined) {
        // During navigation transitions, check if the match exists in pendingMatches
        const pendingMatch = state.pendingMatches?.find((d: any) =>
          opts.from ? opts.from === d.routeId : d.id === nearestMatchId.value,
        )

        // If there's a pending match or we're transitioning, return undefined without throwing
        if (pendingMatch || state.isTransitioning) {
          pendingError.value = null
          return undefined
        }

        // Store the error to throw later if shouldThrow is enabled
        if (opts.shouldThrow ?? true) {
          pendingError.value = new Error(
            `Invariant failed: Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
          )
        }

        return undefined
      }

      pendingError.value = null
      return opts.select ? opts.select(match) : match
    },
  } as any)

  // Throw the error if we have one - this happens after the selector runs
  // Using a computed so the error is thrown when the return value is accessed
  const result = Vue.computed(() => {
    // Check for pending error first
    if (pendingError.value) {
      throw pendingError.value
    }
    return matchSelection.value
  })

  // Also immediately throw if there's already an error from initial render
  // This ensures errors are thrown even if the returned ref is never accessed
  if (pendingError.value) {
    throw pendingError.value
  }

  return result as any
}
