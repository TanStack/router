import * as React from 'react'
import invariant from 'tiny-invariant'
import { useRouterState } from './useRouterState'
import { matchContext } from './matchContext'
import type { RegisteredRouter } from './router'
import type { AnyRoute } from './route'
import type { MakeRouteMatch } from './Matches'
import type { RouteIds } from './routeInfo'
import type { StrictOrFrom } from './utils'

export type UseMatchOptions<
  TFrom,
  TStrict extends boolean,
  TRouteMatch,
  TSelected,
  TThrow extends boolean,
> = StrictOrFrom<TFrom, TStrict> & {
  select?: (match: TRouteMatch) => TSelected
  shouldThrow?: TThrow
}

export function useMatch<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RouteIds<TRouteTree> = RouteIds<TRouteTree>,
  TStrict extends boolean = true,
  TRouteMatch = MakeRouteMatch<TRouteTree, TFrom, TStrict>,
  TSelected = TRouteMatch,
  TThrow extends boolean = true,
>(
  opts: UseMatchOptions<TFrom, TStrict, TRouteMatch, TSelected, TThrow>,
): TThrow extends true ? TSelected : TSelected | undefined {
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
  })

  return matchSelection as TSelected
}
