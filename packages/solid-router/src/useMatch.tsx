import * as Solid from 'solid-js'
import invariant from 'tiny-invariant'
import {
  matchContext,
  pendingMatchContext,
  routeIdContext,
} from './matchContext'
import { shallow } from './store'
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
  const nearestMatchId: Solid.Accessor<string | undefined> = opts.from
    ? () => undefined
    : Solid.useContext(matchContext)
  const nearestRouteId: Solid.Accessor<string | undefined> = opts.from
    ? () => undefined
    : Solid.useContext(routeIdContext)
  const hasPendingNearestMatch: Solid.Accessor<boolean> = opts.from
    ? () => false
    : Solid.useContext(pendingMatchContext)

  const match = Solid.createMemo(() => {
    if (opts.from) {
      return router.stores.getMatchStoreByRouteId(opts.from).state
    }

    const matchId = nearestMatchId()
    if (matchId) {
      const matchStore = router.stores.activeMatchStoresById.get(matchId)
      if (matchStore) {
        return matchStore.state
      }
    }

    const routeId = nearestRouteId()
    return routeId
      ? router.stores.getMatchStoreByRouteId(routeId).state
      : undefined
  })

  const shouldThrow = Solid.createMemo(() => {
    if (match() !== undefined) {
      return false
    }

    const hasPendingMatch = opts.from
      ? Boolean(router.stores.pendingRouteIds.state[opts.from!])
      : hasPendingNearestMatch()

    return (
      !hasPendingMatch &&
      !router.stores.isTransitioning.state &&
      (opts.shouldThrow ?? true)
    )
  })

  Solid.createEffect(() => {
    if (shouldThrow()) {
      invariant(
        false,
        `Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
      )
    }
  })

  return Solid.createMemo(
    () => {
      const selectedMatch = match()

      if (selectedMatch === undefined) {
        return undefined
      }

      return opts.select ? opts.select(selectedMatch as any) : selectedMatch
    },
    undefined,
    { equals: shallow },
  ) as any
}
