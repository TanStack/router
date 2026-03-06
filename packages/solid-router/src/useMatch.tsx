import * as Solid from 'solid-js'
import invariant from 'tiny-invariant'
import { pendingMatchContext, routeIdContext } from './matchContext'
import { useRouter } from './useRouter'
import { shallow } from './store'
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
  const nearestRouteId: Solid.Accessor<string | undefined> = opts.from
    ? () => undefined
    : Solid.useContext(routeIdContext)
  const hasPendingNearestMatch: Solid.Accessor<boolean> = opts.from
    ? () => false
    : Solid.useContext(pendingMatchContext)

  const match = Solid.createMemo(() => {
    const routeId = opts.from ?? nearestRouteId()
    return routeId
      ? router.stores.getMatchStoreByRouteId(routeId).state
      : undefined
  })

  const matchState = Solid.createMemo(() => {
    const selectedMatch = match()

    if (selectedMatch === undefined) {
      const hasPendingMatch = opts.from
        ? Boolean(router.stores.pendingRouteIds.state[opts.from!])
        : hasPendingNearestMatch()

      const error =
        !hasPendingMatch &&
        !router.stores.isTransitioning.state &&
        (opts.shouldThrow ?? true)

      return { match: undefined, error }
    }
    const result: any = opts.select
      ? opts.select(selectedMatch as any)
      : selectedMatch
    return { match: result }
  })

  // Use createEffect to throw errors outside the reactive selector context
  // This allows error boundaries to properly catch the errors
  Solid.createEffect(() => {
    const state = matchState()
    if (state.error) {
      invariant(
        false,
        `Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
      )
    }
  })

  // Return an accessor that extracts just the match value
  return Solid.createMemo(() => matchState().match, undefined, {
    equals: shallow,
  }) as any
}
