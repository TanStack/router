import * as Vue from 'vue'
import { useStore } from '@tanstack/vue-store'
import { injectDummyMatch, injectMatch } from './matchContext'
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
  const pendingError = Vue.ref<Error | null>(null)
  const activeStores = useStore(
    opts.from ? router.byRouteIdStore : router.byIdStore,
    (stores) => stores,
  )
  const pendingMatches = useStore(
    router.pendingMatchesSnapshotStore,
    (matches) => matches,
  )
  const isTransitioning = useStore(
    router.isTransitioningStore,
    (value) => value,
  )

  const selectedStore = Vue.computed(() => {
    const key = opts.from ?? nearestMatchId.value
    const store = key ? activeStores.value[key] : undefined
    const hasPendingMatch = key
      ? pendingMatches.value.some((match) =>
          opts.from ? match.routeId === opts.from : match.id === key,
        )
      : false

    const shouldThrowError =
      !store && !hasPendingMatch && !isTransitioning.value && (opts.shouldThrow ?? true)

    if (shouldThrowError) {
      pendingError.value = new Error(
        `Invariant failed: Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
      )
    } else {
      pendingError.value = null
    }

    return store
  })

  const match = useStoreOfStoresValue(
    selectedStore,
    (value) => value,
  )

  // Ensure missing-match errors are initialized even if callers never read
  // from the returned ref (e.g. tests that only call useMatch for side effects).
  selectedStore.value

  const result = Vue.computed(() => {
    if (pendingError.value) {
      throw pendingError.value
    }

    if (match.value === undefined) {
      return undefined
    }

    return opts.select ? opts.select(match.value as any) : match.value
  }) as any

  if (pendingError.value) {
    throw pendingError.value
  }

  return result
}
