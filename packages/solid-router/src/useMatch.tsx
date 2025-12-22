import * as Solid from 'solid-js'
import invariant from 'tiny-invariant'
import { useRouterState } from './useRouterState'
import { dummyMatchContext, matchContext } from './matchContext'
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
  structuralSharing?: boolean
}

export type UseMatchRoute<TRegister extends Register, out TFrom> = <
  TSelected = unknown,
>(
  opts?: UseMatchBaseOptions<TRegister, TFrom, true, true, TSelected>,
) => Solid.Accessor<UseMatchResult<TRegister, TFrom, true, TSelected>>

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
): Solid.Accessor<
  ThrowOrOptional<UseMatchResult<TRegister, TFrom, TStrict, TSelected>, TThrow>
> {
  const nearestMatchId = Solid.useContext(
    opts.from ? dummyMatchContext : matchContext,
  )

  // Create a signal to track error state separately from the match
  const matchState: Solid.Accessor<{
    match: any
    shouldThrowError: boolean
  }> = useRouterState({
    select: (state: any) => {
      const match = state.matches.find((d: any) =>
        opts.from ? opts.from === d.routeId : d.id === nearestMatchId(),
      )

      if (match === undefined) {
        // During navigation transitions, check if the match exists in pendingMatches
        const pendingMatch = state.pendingMatches?.find((d: any) =>
          opts.from ? opts.from === d.routeId : d.id === nearestMatchId(),
        )

        // Determine if we should throw an error
        const shouldThrowError =
          !pendingMatch && !state.isTransitioning && (opts.shouldThrow ?? true)

        return { match: undefined, shouldThrowError }
      }

      return {
        match: opts.select ? opts.select(match) : match,
        shouldThrowError: false,
      }
    },
  } as any)

  // Use createEffect to throw errors outside the reactive selector context
  // This allows error boundaries to properly catch the errors
  Solid.createEffect(() => {
    const state = matchState()
    if (state.shouldThrowError) {
      invariant(
        false,
        `Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
      )
    }
  })

  // Return an accessor that extracts just the match value
  return Solid.createMemo(() => matchState().match) as any
}
