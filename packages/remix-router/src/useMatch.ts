import { invariant } from '@tanstack/router-core'
import { useRouter } from './useRouter'
import { getMatchId } from './MatchContext'
import { subscribeDynamicStore, subscribeStore } from './subscribe'
import type { Handle } from '@remix-run/ui'
import type {
  AnyRouter,
  MakeRouteMatch,
  MakeRouteMatchUnion,
  RegisteredRouter,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
} from '@tanstack/router-core'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'

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
 * Subscribe to a route match. Pick the match by either:
 * - `from` route id (strict, type-checked)
 * - or omit `from` to read the nearest enclosing `<Match>`'s match
 *
 * Returns a getter `() => match` (or `() => selected` if `select` is given).
 *
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
  handle: Handle<any, any>,
  opts: UseMatchOptions<
    TRouter,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected,
    TStructuralSharing
  >,
): () => ThrowOrOptional<UseMatchResult<TRouter, TFrom, TStrict, TSelected>, TThrow> {
  const router = useRouter<TRouter>(handle)

  // When `opts.from` is provided it's a static route id, so the store
  // identity is stable across renders — use the simpler subscription.
  // When omitted, the store is keyed by the nearest enclosing
  // `MatchContext`'s `matchId`, which can change as the active route
  // changes underneath a reused component instance — use the dynamic
  // subscription so we follow the right store across navigations.
  const read = opts.from
    ? subscribeStore(handle, router.stores.getRouteMatchStore(opts.from))
    : subscribeDynamicStore(handle, () => {
        const matchId = getMatchId(handle)
        return matchId ? router.stores.matchStores.get(matchId) : undefined
      })

  const shouldThrow = opts.shouldThrow ?? true

  return (() => {
    const match = read()
    if (shouldThrow && !match) {
      assertMatch(opts.from)
    }
    if (match === undefined) return undefined
    return opts.select ? opts.select(match) : match
  }) as () => ThrowOrOptional<UseMatchResult<TRouter, TFrom, TStrict, TSelected>, TThrow>
}

/**
 * Throws when the requested match is missing. Mirrors the
 * `invariant(condition, message)` shape: in dev, surface the
 * descriptive message; in prod, fall through to router-core's
 * minified `invariant()` so the dev-only message string isn't
 * shipped to clients.
 *
 * `router-core`'s `invariant()` takes no args by design — its sole
 * job is to throw a well-known error type that downstream consumers
 * can pattern-match on. The binding is responsible for adding the
 * descriptive context in dev.
 */
function assertMatch(from: string | undefined): never {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(
      `Invariant failed: Could not find ${
        from ? `an active match from "${from}"` : 'a nearest match!'
      }`,
    )
  }
  invariant()
}
