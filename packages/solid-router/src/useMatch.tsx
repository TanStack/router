import * as Solid from 'solid-js'
import invariant from 'tiny-invariant'
import {
  dummyMatchContext,
  dummyPendingMatchContext,
  matchContext,
  pendingMatchContext,
} from './matchContext'
import { useRouter } from './useRouter'
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
  const router = useRouter<TRouter>()
  const nearestMatchId = Solid.useContext(
    opts.from ? dummyMatchContext : matchContext,
  )
  const hasPendingNearestMatch = Solid.useContext(
    opts.from ? dummyPendingMatchContext : pendingMatchContext,
  )

  const match = Solid.createMemo(() => {
    const key = opts.from ?? nearestMatchId()
    if (!key) return undefined
    if (opts.from) {
      // Per-routeId computed store resolves routeId → match state
      // through the signal graph in a single step.
      return router.stores.getMatchStoreByRouteId(key).state
    }
    // Track matchesId for pool changes, then read from pool directly.
    // Both reads are reactive signals in Solid's tracking system.
    router.stores.matchesId.state
    return router.stores.activeMatchStoresById.get(key)?.state
  })
  const hasPendingRouteMatch = opts.from
    ? Solid.createMemo(() => {
        // Track pending pool changes
        router.stores.pendingMatchesId.state
        for (const s of router.stores.pendingMatchStoresById.values()) {
          if (s.routeId === opts.from) return true
        }
        return false
      })
    : undefined
  const isTransitioning = Solid.createMemo(
    () => router.stores.isTransitioning.state,
  )

  return Solid.createMemo((previous) => {
    const selectedMatch = match()
    if (selectedMatch === undefined) {
      // TODO (injectable stores) why do we return the previous here? That doesn't seem super safe, what if the `select` function reads other signals, then we wouldn't re-run it on changes to those signals.
      if (previous !== undefined) {
        return previous
      }

      const hasPendingMatch = opts.from
        ? Boolean(hasPendingRouteMatch?.())
        : hasPendingNearestMatch()
      const shouldThrowError =
        !hasPendingMatch && !isTransitioning() && (opts.shouldThrow ?? true)

      invariant(
        !shouldThrowError,
        `Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
      )
      return undefined
    }

    return opts.select ? opts.select(selectedMatch as any) : selectedMatch
  }) as any
}
