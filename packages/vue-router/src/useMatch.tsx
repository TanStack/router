import * as Vue from 'vue'
import { useStore } from '@tanstack/vue-store'
import {
  injectDummyMatch,
  injectDummyPendingMatch,
  injectMatch,
  injectPendingMatch,
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
  const router = useRouter<TRouter>()
  const nearestMatchId = opts.from ? injectDummyMatch() : injectMatch()
  const hasPendingNearestMatch = opts.from
    ? injectDummyPendingMatch()
    : injectPendingMatch()
  const activeMatchStore = useStore(
    opts.from ? router.stores.byRouteId : router.stores.byId,
    (stores) => {
      const key = opts.from ?? nearestMatchId.value
      return key ? stores[key] : undefined
    },
    { equal: Object.is },
  )
  const hasPendingRouteMatch = opts.from
    ? useStore(
        router.stores.pendingByRouteId,
        (stores) => Boolean(stores[opts.from as string]),
        { equal: Object.is },
      )
    : undefined
  const isTransitioning = useStore(
    router.stores.isTransitioning,
    (value) => value,
    { equal: Object.is },
  )

  const match = useStoreOfStoresValue(
    Vue.computed(() => activeMatchStore.value),
    (value) => value,
  )

  const result = Vue.computed(() => {
    const selectedMatch = match.value
    if (selectedMatch === undefined) {
      const hasPendingMatch = opts.from
        ? Boolean(hasPendingRouteMatch?.value)
        : hasPendingNearestMatch.value
      const shouldThrowError =
        !hasPendingMatch && !isTransitioning.value && (opts.shouldThrow ?? true)
      if (shouldThrowError) {
        throw new Error(
          `Invariant failed: Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
        )
      }
      return undefined
    }

    return opts.select ? opts.select(selectedMatch as any) : selectedMatch
  }) as any

  // Keep eager throw behavior for setups that call useMatch for side effects only.
  result.value

  return result
}
