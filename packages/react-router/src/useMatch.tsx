import * as React from 'react'
import invariant from 'tiny-invariant'
import { useRouterState } from './useRouterState'
import { type RegisteredRouter } from './router'
import { type AnyRoute } from './route'
import { matchContext } from './matchContext'
import type { MakeRouteMatch } from './Matches'
import type { RouteIds } from './routeInfo'
import type { StrictOrFrom } from './utils'

export function useMatch<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TReturnIntersection extends boolean = false,
  TRouteMatch = MakeRouteMatch<TRouteTree, TFrom, TReturnIntersection>,
  TSelected = TRouteMatch,
>(
  opts: StrictOrFrom<TFrom, TReturnIntersection> & {
    select?: (match: TRouteMatch) => TSelected
  },
): TSelected {
  const nearestMatchId = React.useContext(matchContext)

  const matchSelection = useRouterState({
    select: (state) => {
      const match = state.matches.find((d) =>
        opts.from ? opts.from === d.routeId : d.id === nearestMatchId,
      )

      invariant(
        match,
        `Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
      )

      return opts.select ? opts.select(match as any) : match
    },
  })

  return matchSelection as TSelected
}
