import * as Solid from 'solid-js'
import invariant from 'tiny-invariant'
import { useStore } from '@tanstack/solid-store'
import {
  dummyMatchContext,
  dummyPendingMatchContext,
  matchContext,
  pendingMatchContext,
} from './matchContext'
import { useStoreOfStoresValue } from './storeOfStores'
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

  const activeStores = useStore(
    opts.from ? router.byRouteIdStore : router.byIdStore,
    (stores) => stores,
    { equal: Object.is },
  )
  const pendingRouteStores = opts.from
    ? useStore(
        router.pendingByRouteIdStore,
        (stores) => stores,
        { equal: Object.is },
      )
    : undefined
  const isTransitioning = useStore(
    router.isTransitioningStore,
    (value) => value,
    { equal: Object.is },
  )

  const selectionState = Solid.createMemo(() => {
    const key = opts.from ?? nearestMatchId()
    const stores = activeStores()
    const store = key ? stores[key] : undefined
    const shouldThrowError = (() => {
      if (store) {
        return false
      }

      const hasPendingMatch = opts.from
        ? Boolean(pendingRouteStores?.()[opts.from])
        : hasPendingNearestMatch()

      return !hasPendingMatch && !isTransitioning() && (opts.shouldThrow ?? true)
    })()

    return { store, shouldThrowError }
  })

  Solid.createEffect(() => {
    const selected = selectionState()
    invariant(
      !selected.shouldThrowError,
      `Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
    )
  })

  const match = useStoreOfStoresValue(
    () => selectionState().store,
    (value) => value,
  )

  return Solid.createMemo(() => {
    const selectedMatch = match()
    if (selectedMatch === undefined) {
      return undefined
    }

    return opts.select ? opts.select(selectedMatch as any) : selectedMatch
  }) as any
}
