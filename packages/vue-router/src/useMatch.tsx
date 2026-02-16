import * as Vue from 'vue'
import { useStore } from '@tanstack/vue-store'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'
import { injectDummyMatch, injectMatch } from './matchContext'
import type {
  AnyRouter,
  InternalStoreState,
  MakeRouteMatch,
  MakeRouteMatchUnion,
  RegisteredRouter,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'

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
  const pendingMatches = useInternalRouterState((state) => state.pendingMatches)

  // Store to track pending error for deferred throwing
  const pendingError = Vue.ref<Error | null>(null)

  const routerMatchState = useRouterState({
    select: (state) => ({
      matches: state.matches,
      isTransitioning: state.isTransitioning,
      status: state.status,
    }),
  })

  // Select the match from router state
  const matchSelection = Vue.computed(() => {
    const routerState = routerMatchState.value
    const matchId = nearestMatchId.value
    const match = routerState.matches.find((d) =>
      opts.from ? opts.from === d.routeId : d.id === matchId,
    )
    const pendingMatchArray = pendingMatches.value

    if (match === undefined) {
      // During navigation transitions, check if the match exists in pendingMatches
      const pendingMatch = pendingMatchArray?.some((d) =>
        opts.from ? opts.from === d.routeId : d.id === matchId,
      )

      // If there's a pending match or we're transitioning, return undefined without throwing
      if (pendingMatch || routerState.isTransitioning) {
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
  })

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

function useInternalRouterState<TSelected>(
  select: (state: InternalStoreState) => TSelected,
): Vue.Ref<TSelected> {
  const router = useRouter()
  // During SSR we render exactly once and do not need reactivity.
  // Avoid subscribing to the store on the server since the server store
  // implementation does not provide subscribe() semantics.
  const _isServer = isServer ?? router.isServer

  if (_isServer) {
    const state = router.internalStore.state
    return Vue.ref(select(state)) as Vue.Ref<TSelected>
  }

  return useStore(router.internalStore, select) as Vue.Ref<TSelected>
}
