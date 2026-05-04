import { useRouter } from './useRouter'
import { getMatchId } from './MatchContext'
import { subscribeSelected } from './subscribe'
import type { Handle } from '@remix-run/ui'
import type {
  AnyRouter,
  DeepPartial,
  Expand,
  MakeOptionalPathParams,
  MakeOptionalSearchParams,
  MakeRouteMatchUnion,
  MaskOptions,
  MatchRouteOptions,
  RegisteredRouter,
  ResolveRoute,
  ToSubOptionsProps,
} from '@tanstack/router-core'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'

export interface UseMatchesBaseOptions<
  TRouter extends AnyRouter,
  TSelected,
  TStructuralSharing,
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
 * Subscribe to the array of active route matches.
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useMatchesHook
 */
export function useMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  handle: Handle<any, any>,
  opts?: UseMatchesBaseOptions<TRouter, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
): () => UseMatchesResult<TRouter, TSelected> {
  const router = useRouter<TRouter>(handle)
  return subscribeSelected(handle, router.stores.matches, {
    select: opts?.select as any,
    structuralSharing:
      opts?.structuralSharing ?? router.options.defaultStructuralSharing,
  }) as () => UseMatchesResult<TRouter, TSelected>
}

/**
 * Subscribe to the slice of matches that are ancestors of the nearest
 * `<Match>`.
 */
export function useParentMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  handle: Handle<any, any>,
  opts?: UseMatchesBaseOptions<TRouter, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
): () => UseMatchesResult<TRouter, TSelected> {
  return useMatches<TRouter, TSelected, TStructuralSharing>(handle, {
    select: (matches: Array<MakeRouteMatchUnion<TRouter>>) => {
      // Read the current matchId from context on every projection so the
      // slice tracks the active enclosing `<Match>`. Reading at setup
      // time would freeze it to the matchId that was current when this
      // hook first ran — incorrect when the same component instance is
      // reused for a different match across navigations.
      const matchId = getMatchId(handle)
      const trimmed = matches.slice(
        0,
        matches.findIndex((d: any) => d.id === matchId),
      )
      return opts?.select ? opts.select(trimmed) : (trimmed as any)
    },
    structuralSharing: opts?.structuralSharing,
  } as any)
}

/**
 * Subscribe to the slice of matches that are descendants of the nearest
 * `<Match>`.
 */
export function useChildMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  handle: Handle<any, any>,
  opts?: UseMatchesBaseOptions<TRouter, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
): () => UseMatchesResult<TRouter, TSelected> {
  return useMatches<TRouter, TSelected, TStructuralSharing>(handle, {
    select: (matches: Array<MakeRouteMatchUnion<TRouter>>) => {
      // See `useParentMatches` — read on each projection.
      const matchId = getMatchId(handle)
      const trimmed = matches.slice(
        matches.findIndex((d: any) => d.id === matchId) + 1,
      )
      return opts?.select ? opts.select(trimmed) : (trimmed as any)
    },
    structuralSharing: opts?.structuralSharing,
  } as any)
}

export type UseMatchRouteOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
> = ToSubOptionsProps<TRouter, TFrom, TTo> &
  DeepPartial<MakeOptionalSearchParams<TRouter, TFrom, TTo>> &
  DeepPartial<MakeOptionalPathParams<TRouter, TFrom, TTo>> &
  MaskOptions<TRouter, TMaskFrom, TMaskTo> &
  MatchRouteOptions

/**
 * Returns a `matchRoute(opts)` function for testing arbitrary routes against
 * the current location. The component re-renders whenever the matching
 * dependencies change.
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useMatchRouteHook
 */
export function useMatchRoute<TRouter extends AnyRouter = RegisteredRouter>(
  handle: Handle<any, any>,
) {
  const router = useRouter<TRouter>(handle)
  // Subscribe to the deps so callers re-render on relevant changes.
  subscribeSelected(handle, router.stores.matchRouteDeps, {})

  return <
    const TFrom extends string = string,
    const TTo extends string | undefined = undefined,
    const TMaskFrom extends string = TFrom,
    const TMaskTo extends string = '',
  >(
    opts: UseMatchRouteOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
  ): false | Expand<ResolveRoute<TRouter, TFrom, TTo>['types']['allParams']> => {
    const { pending, caseSensitive, fuzzy, includeSearch, ...rest } =
      opts as any
    return router.matchRoute(rest, {
      pending,
      caseSensitive,
      fuzzy,
      includeSearch,
    }) as any
  }
}
