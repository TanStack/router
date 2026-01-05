import * as React from 'react'
import { useRouterState } from './useRouterState'
import { matchContext } from './matchContext'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'
import type {
  AnyRouter,
  MakeRouteMatchUnion,
  RegisteredRouter,
  RouterState,
} from '@tanstack/router-core'

export interface UseMatchesBaseOptions<
  TRouter extends AnyRouter,
  TSelected,
  TStructuralSharing extends boolean = boolean,
> {
  select?: (
    matches: Array<MakeRouteMatchUnion<TRouter>>,
  ) => ValidateSelected<TRouter, TSelected, TStructuralSharing>
}

export type UseMatchesResult<
  TRouter extends AnyRouter,
  TSelected,
> = unknown extends TSelected ? Array<MakeRouteMatchUnion<TRouter>> : TSelected

/**
 * Read the full array of active route matches or select a derived subset.
 *
 * Useful for debugging, breadcrumbs, or aggregating metadata across matches.
 *
 * @returns The array of matches (or the selected value).
 */
export function useMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseMatchesBaseOptions<TRouter, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
): UseMatchesResult<TRouter, TSelected> {
  return useRouterState({
    select: (state: RouterState<TRouter['routeTree']>) => {
      const matches = state.matches
      return opts?.select
        ? opts.select(matches as Array<MakeRouteMatchUnion<TRouter>>)
        : matches
    },
    structuralSharing: opts?.structuralSharing,
  } as any) as UseMatchesResult<TRouter, TSelected>
}

/**
 * Read the full array of active route matches or select a derived subset
 * from the parent boundary up to (but not including) the current match.
 */
export function useParentMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseMatchesBaseOptions<TRouter, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
): UseMatchesResult<TRouter, TSelected> {
  const contextMatchId = React.useContext(matchContext)

  return useMatches({
    select: (matches: Array<MakeRouteMatchUnion<TRouter>>) => {
      const index = matches.findIndex((d) => d.id === contextMatchId)
      const parentMatches = matches.slice(0, index)
      return opts?.select
        ? opts.select(parentMatches)
        : (parentMatches as UseMatchesResult<TRouter, TSelected>)
    },
    structuralSharing: opts?.structuralSharing,
  } as any)
}

/**
 * Read the full array of active route matches or select a derived subset
 * from the children of the current match down to the leaf.
 */
export function useChildMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseMatchesBaseOptions<TRouter, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
): UseMatchesResult<TRouter, TSelected> {
  const contextMatchId = React.useContext(matchContext)

  return useMatches({
    select: (matches: Array<MakeRouteMatchUnion<TRouter>>) => {
      const index = matches.findIndex((d) => d.id === contextMatchId)
      const childMatches = matches.slice(index + 1)
      return opts?.select
        ? opts.select(childMatches)
        : (childMatches as UseMatchesResult<TRouter, TSelected>)
    },
    structuralSharing: opts?.structuralSharing,
  } as any)
}
