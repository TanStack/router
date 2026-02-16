import * as Solid from 'solid-js'
import invariant from 'tiny-invariant'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'
import { dummyMatchContext, matchContext } from './matchContext'
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
import { replaceEqualDeep } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useStore } from '@tanstack/solid-store'

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

  const pendingMatches = useInternalRouterState((state) => state.pendingMatches)

  const routerMatchState = useRouterState({
    select: (state) => ({
      matches: state.matches,
      isTransitioning: state.isTransitioning,
      status: state.status,
    }),
  })

  // Track error state separately from the selected match.
  // This memo depends on both router stores and nearestMatchId.
  const matchState: Solid.Accessor<{
    match: any
    shouldThrowError: boolean
  }> = Solid.createMemo(() => {
    const routerState = routerMatchState()
    const matchId = nearestMatchId()
    const match = routerState.matches.find((d: any) =>
      opts.from ? opts.from === d.routeId : d.id === matchId,
    )
    const pendingMatchArray = pendingMatches()

    if (match === undefined) {
      const hasPendingMatch =
        routerState.status === 'pending' &&
        pendingMatchArray?.some((d) =>
          opts.from ? opts.from === d.routeId : d.id === matchId,
        )

      const shouldThrowError =
        !routerState.isTransitioning &&
        (opts.shouldThrow ?? true) &&
        !hasPendingMatch

      return {
        match: undefined,
        shouldThrowError,
      }
    }

    return {
      match: opts.select ? opts.select(match) : match,
      shouldThrowError: false,
    }
  })

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
  return Solid.createMemo((prev) => replaceEqualDeep(prev, matchState().match))
}

function useInternalRouterState<TSelected>(
  select: (state: InternalStoreState) => TSelected,
): Solid.Accessor<TSelected> {
  const router = useRouter()
  // During SSR we render exactly once and do not need reactivity.
  // Avoid subscribing to the store on the server since the server store
  // implementation does not provide subscribe() semantics.
  const _isServer = isServer ?? router.isServer
  if (_isServer) {
    const state = router.internalStore.state
    const selected = select(state)
    return () => selected
  }

  return useStore(router.internalStore, select)
}
