import * as Angular from '@angular/core'
import invariant from 'tiny-invariant'
import { injectRouterState } from './injectRouterState'
import {
  DUMMY_MATCH_ID_INJECTOR_TOKEN,
  MATCH_ID_INJECTOR_TOKEN,
} from './matchInjectorToken'
import type {
  AnyRouter,
  MakeRouteMatch,
  MakeRouteMatchUnion,
  RegisteredRouter,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
} from '@tanstack/router-core'

export interface InjectMatchBaseOptions<
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

export type InjectMatchRoute<out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: InjectMatchBaseOptions<TRouter, TFrom, true, true, TSelected>,
) => Angular.Signal<InjectMatchResult<TRouter, TFrom, true, TSelected>>

export type InjectMatchOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  InjectMatchBaseOptions<TRouter, TFrom, TStrict, TThrow, TSelected>

export type InjectMatchResult<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
> = unknown extends TSelected
  ? TStrict extends true
  ? MakeRouteMatch<TRouter['routeTree'], TFrom, TStrict>
  : MakeRouteMatchUnion<TRouter>
  : TSelected

export function injectMatch<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
>(
  opts: InjectMatchOptions<
    TRouter,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected
  >,
): Angular.Signal<
  ThrowOrOptional<InjectMatchResult<TRouter, TFrom, TStrict, TSelected>, TThrow>
> {
  const nearestMatchId = Angular.inject(
    opts.from ? DUMMY_MATCH_ID_INJECTOR_TOKEN : MATCH_ID_INJECTOR_TOKEN,
  )

  const matchState = injectRouterState({
    select: (state) => {
      const match = state.matches.find((d) =>
        opts.from ? opts.from === d.routeId : d.id === nearestMatchId(),
      )

      if (match === undefined) {
        // During navigation transitions, check if the match exists in pendingMatches
        const pendingMatch = state.pendingMatches?.find((d) =>
          opts.from ? opts.from === d.routeId : d.id === nearestMatchId(),
        )

        // Determine if we should throw an error
        const shouldThrowError =
          !pendingMatch && !state.isTransitioning && (opts.shouldThrow ?? true)

        return {
          match: undefined,
          shouldThrowError,
        } as const
      }

      return {
        match: opts.select ? opts.select(match) : match,
        shouldThrowError: false,
      } as const
    },
  })

  // Throw the error if we have one - this happens after the selector runs
  // Using a computed so the error is thrown when the return value is accessed
  return Angular.computed(() => {
    const state = matchState()
    if (state.shouldThrowError) {
      invariant(
        false,
        `Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
      )
    }
    return state.match as any
  })
}
