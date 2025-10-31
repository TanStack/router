import * as Solid from 'solid-js'
import invariant from 'tiny-invariant'
import { useRouterState } from './useRouterState'
import { dummyMatchContext, matchContext } from './matchContext'
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
) => Solid.Accessor<UseMatchResult<TRouter, TFrom, true, TSelected>>

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
): Solid.Accessor<
  ThrowOrOptional<UseMatchResult<TRouter, TFrom, TStrict, TSelected>, TThrow>
> {
  const nearestMatchId = Solid.useContext(
    opts.from ? dummyMatchContext : matchContext,
  )

  const matchSelection = useRouterState({
    select: (state: any) => {
      // Check current matches first
      let match = state.matches.find((d: any) =>
        opts.from ? opts.from === d.routeId : d.id === nearestMatchId(),
      )

      // During async transitions (Solid's startTransition is async), old components
      // may re-render after their match has been moved to cachedMatches.
      // Check there as a fallback to prevent "match not found" errors.
      if (!match) {
        match = state.cachedMatches.find((d: any) =>
          opts.from ? opts.from === d.routeId : d.id === nearestMatchId(),
        )
      }

      // Return an object with match and metadata for throwing outside select
      return {
        match: match,
        isTransitioning: state.isTransitioning as boolean,
      }
    },
  })

  // Create a derived signal that throws errors during render (not in select)
  // This allows Solid's error boundaries to catch the errors properly
  return Solid.createMemo(() => {
    const result = matchSelection()
    const match = result?.match
    const isTransitioning = result?.isTransitioning

    // Respect the shouldThrow option, but don't throw during transitions
    // During async transitions, components may temporarily not find their match
    // Default to true if not specified (backwards compatible behavior)
    const shouldThrow = (opts.shouldThrow ?? true) && !isTransitioning

    invariant(
      !(shouldThrow && !match),
      `Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
    )

    if (match === undefined) {
      return undefined
    }

    return opts.select ? opts.select(match) : match
  }) as any
}
