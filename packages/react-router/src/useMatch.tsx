import * as React from 'react'
import { Store, useStore } from '@tanstack/react-store'
import invariant from 'tiny-invariant'
import { replaceEqualDeep } from '@tanstack/router-core'
import { useRouter } from './useRouter'
import { dummyMatchContext, matchContext } from './matchContext'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'
import type {
  AnyRouter,
  MakeRouteMatch,
  MakeRouteMatchUnion,
  RegisteredRouter,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
} from '@tanstack/router-core'

const emptyMatchStore = new Store<undefined>(undefined)
const missingMatchSelection = Symbol('missing-match-selection')

export interface UseMatchBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
  TStructuralSharing extends boolean,
> {
  select?: (
    match: MakeRouteMatch<TRouter['routeTree'], TFrom, TStrict>,
  ) => ValidateSelected<TRouter, TSelected, TStructuralSharing>
  shouldThrow?: TThrow
}

export type UseMatchRoute<out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseMatchBaseOptions<
    TRouter,
    TFrom,
    true,
    true,
    TSelected,
    TStructuralSharing
  > &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
) => UseMatchResult<TRouter, TFrom, true, TSelected>

export type UseMatchOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
  TStructuralSharing extends boolean,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  UseMatchBaseOptions<
    TRouter,
    TFrom,
    TStrict,
    TThrow,
    TSelected,
    TStructuralSharing
  > &
  StructuralSharingOption<TRouter, TSelected, TStructuralSharing>

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

/**
 * Read and select the nearest or targeted route match.
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useMatchHook
 */
export function useMatch<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts: UseMatchOptions<
    TRouter,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected,
    TStructuralSharing
  >,
): ThrowOrOptional<UseMatchResult<TRouter, TFrom, TStrict, TSelected>, TThrow> {
  const router = useRouter<TRouter>()
  const nearestMatchId = React.useContext(
    opts.from ? dummyMatchContext : matchContext,
  )
  const nearestMatchIdOrEmpty = nearestMatchId ?? ''

  const hasFromRouteMatch = useStore(router.matchRouteIds, (routeIds) =>
    opts.from ? routeIds.has(opts.from) : false,
  )
  const hasNearestMatch = useStore(router.matchIds, (matchIds) =>
    opts.from ? false : matchIds.has(nearestMatchIdOrEmpty),
  )
  const exists = opts.from ? hasFromRouteMatch : hasNearestMatch

  const rawMatchStore = opts.from
    ? exists
      ? router.getMatchStore(opts.from)
      : undefined
    : exists
      ? router.getMatchStoreByMatchId(nearestMatchIdOrEmpty)
      : undefined
  const matchStore = rawMatchStore ?? emptyMatchStore

  const previousResult = React.useRef<
    ValidateSelected<TRouter, TSelected, TStructuralSharing>
  >(undefined)

  const matchSelection = useStore(matchStore, (match) => {
      if (match === undefined) {
        return missingMatchSelection
      }

      if (!opts.select) {
        return match
      }

      const selectedMatch = opts.select(match)

      if (opts.structuralSharing ?? router.options.defaultStructuralSharing) {
        const newSlice = replaceEqualDeep(previousResult.current, selectedMatch)
        previousResult.current = newSlice
        return newSlice as any
      }

      return selectedMatch as any
    })

  const missing = matchSelection === missingMatchSelection

  invariant(
    !((opts.shouldThrow ?? true) && missing),
    `Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
  )

  return (missing ? undefined : matchSelection) as ThrowOrOptional<
    UseMatchResult<TRouter, TFrom, TStrict, TSelected>,
    TThrow
  >
}
