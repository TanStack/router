import * as React from 'react'
import { useStore } from '@tanstack/react-store'
import { replaceEqualDeep } from '@tanstack/router-core'
import invariant from 'tiny-invariant'
import { dummyMatchContext, matchContext } from './matchContext'
import { useRouter } from './useRouter'
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

const dummyStore = {
  state: undefined,
  get: () => undefined,
  subscribe: () => () => {},
} as any

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
  const previousResult =
    React.useRef<ValidateSelected<TRouter, TSelected, TStructuralSharing>>(
      undefined,
    )

  const matchStore = useStore(
    opts.from ? router.byRouteIdStore : router.byIdStore,
    (activeMatchStores) => {
      const key = opts.from ?? nearestMatchId
      const store = key ? activeMatchStores[key] : undefined

      invariant(
        !((opts.shouldThrow ?? true) && !store),
        `Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
      )

      return store
    },
  ) ?? dummyStore

  return useStore(matchStore, (match) => {
    if (match === undefined) {
      return undefined
    }

    const selected = (opts.select
      ? opts.select(match as any)
      : match) as ValidateSelected<TRouter, TSelected, TStructuralSharing>

    if (opts.structuralSharing ?? router.options.defaultStructuralSharing) {
      const shared = replaceEqualDeep(previousResult.current, selected)
      previousResult.current = shared
      return shared
    }

    return selected
  }) as any
}
