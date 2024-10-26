import * as React from 'react'
import invariant from 'tiny-invariant'
import { useRouterState } from './useRouterState'
import { matchContext } from './matchContext'
import type { StructuralSharingOption } from './structuralSharing'
import type { AnyRouter, RegisteredRouter } from './router'
import type { AnyRoute } from './route'
import type { MakeRouteMatch } from './Matches'
import type { RouteIds } from './routeInfo'
import type { Constrain, StrictOrFrom } from './utils'

export type UseMatchOptions<
  TRouter extends AnyRouter,
  TRouteTree extends AnyRoute,
  TFrom,
  TStrict extends boolean,
  TSelected,
  TThrow extends boolean,
> = StrictOrFrom<TFrom, TStrict> & {
  select?: (match: MakeRouteMatch<TRouteTree, TFrom, TStrict>) => TSelected
  shouldThrow?: TThrow
} & StructuralSharingOption<TRouter, TSelected>

export function useMatch<
  TRouter extends AnyRouter = RegisteredRouter,
  TRouteTree extends AnyRoute = TRouter['routeTree'],
  TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
  TReturn = unknown extends TSelected
    ? MakeRouteMatch<TRouteTree, TFrom, TStrict>
    : TSelected,
>(
  opts: UseMatchOptions<
    TRouter,
    TRouteTree,
    Constrain<TFrom, RouteIds<TRouteTree>>,
    TStrict,
    TSelected,
    TThrow
  >,
): TThrow extends true ? TReturn : TReturn | undefined {
  const nearestMatchId = React.useContext(matchContext)

  const matchSelection = useRouterState({
    select: (state) => {
      const match = state.matches.find((d) =>
        opts.from ? opts.from === d.routeId : d.id === nearestMatchId,
      )
      invariant(
        !((opts.shouldThrow ?? true) && !match),
        `Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
      )

      if (match === undefined) {
        return undefined
      }

      return opts.select ? opts.select(match as any) : match
    },
    structuralSharing: opts.structuralSharing,
  })

  return matchSelection as TReturn
}
