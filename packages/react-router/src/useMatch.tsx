import * as React from 'react'
import invariant from 'tiny-invariant'
import { useRouterState } from './useRouterState'
import { dummyMatchContext, matchContext } from './matchContext'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'
import type {
  AnyRouter,
  MakeRouteMatch,
  MakeRouteMatchUnion,
  Register,
  RegisteredRouter,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
} from '@tanstack/router-core'

export interface UseMatchBaseOptions<
  TRegister extends Register,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
  TStructuralSharing extends boolean,
> {
  select?: (
    match: MakeRouteMatch<
      RegisteredRouter<TRegister>['routeTree'],
      TFrom,
      TStrict
    >,
  ) => ValidateSelected<
    RegisteredRouter<TRegister>,
    TSelected,
    TStructuralSharing
  >
  shouldThrow?: TThrow
}

export type UseMatchRoute<TRegister extends Register, out TFrom> = <
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseMatchBaseOptions<
    TRegister,
    TFrom,
    true,
    true,
    TSelected,
    TStructuralSharing
  > &
    StructuralSharingOption<
      RegisteredRouter<TRegister>,
      TSelected,
      TStructuralSharing
    >,
) => UseMatchResult<TRegister, TFrom, true, TSelected>

export type UseMatchOptions<
  TRegister extends Register,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
  TStructuralSharing extends boolean,
> = StrictOrFrom<RegisteredRouter<TRegister>, TFrom, TStrict> &
  UseMatchBaseOptions<
    TRegister,
    TFrom,
    TStrict,
    TThrow,
    TSelected,
    TStructuralSharing
  > &
  StructuralSharingOption<
    RegisteredRouter<TRegister>,
    TSelected,
    TStructuralSharing
  >

export type UseMatchResult<
  TRegister extends Register,
  TFrom,
  TStrict extends boolean,
  TSelected,
> = unknown extends TSelected
  ? TStrict extends true
    ? MakeRouteMatch<RegisteredRouter<TRegister>['routeTree'], TFrom, TStrict>
    : MakeRouteMatchUnion<RegisteredRouter<TRegister>>
  : TSelected

/**
 * Read and select the nearest or targeted route match.
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useMatchHook
 */
export function useMatch<
  TRegister extends Register = Register,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts: UseMatchOptions<
    TRegister,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected,
    TStructuralSharing
  >,
): ThrowOrOptional<
  UseMatchResult<TRegister, TFrom, TStrict, TSelected>,
  TThrow
> {
  const nearestMatchId = React.useContext(
    opts.from ? dummyMatchContext : matchContext,
  )

  const matchSelection = useRouterState({
    select: (state: any) => {
      const match = state.matches.find((d: any) =>
        opts.from ? opts.from === d.routeId : d.id === nearestMatchId,
      )
      invariant(
        !((opts.shouldThrow ?? true) && !match),
        `Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
      )

      if (match === undefined) {
        return undefined
      }

      return opts.select ? opts.select(match) : match
    },
    structuralSharing: opts.structuralSharing,
  } as any)

  return matchSelection as any
}
