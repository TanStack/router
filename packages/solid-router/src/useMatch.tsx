import * as Solid from 'solid-js'
import { invariant, replaceEqualDeep } from '@tanstack/router-core'
import { resolveRouteId } from '@tanstack/router-core/_internal/route-module'
import { nearestMatchContext } from './matchContext'
import { useRouter } from './useRouter'
import type {
  AnyRouter,
  MakeRouteMatch,
  MakeRouteMatchUnion,
  Register,
  RegisteredRouter,
  RegisteredRouterOf,
  RouteScopeMarker,
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
    match: TRouter['routeTree'] extends RouteScopeMarker
      ? TStrict extends true
        ? MakeRouteMatch<TRouter['routeTree'], TFrom, TStrict>
        : MakeRouteMatchUnion<TRouter>
      : MakeRouteMatch<TRouter['routeTree'], TFrom, TStrict>,
  ) => TSelected
  shouldThrow?: TThrow
}

export type UseMatchRoute<out TFrom, TDefaultRegister = Register> = <
  TRouter extends AnyRouter = RegisteredRouterOf<TDefaultRegister>,
  TSelected = unknown,
  TThrow extends boolean = true,
>(
  opts?: UseMatchBaseOptions<TRouter, TFrom, true, TThrow, TSelected>,
) => Solid.Accessor<
  ThrowOrOptional<UseMatchResult<TRouter, TFrom, true, TSelected>, TThrow>
>

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

/**
 * The signature of `useMatch`, typed against the router of `TDefaultRegister` unless a router
 * type is passed explicitly. Route modules export a `useMatch` of this type.
 */
export type UseMatchFn<TDefaultRegister = Register> = <
  TRouter extends AnyRouter = RegisteredRouterOf<TDefaultRegister>,
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
) => Solid.Accessor<
  ThrowOrOptional<UseMatchResult<TRouter, TFrom, TStrict, TSelected>, TThrow>
>

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
  const contextMatch = Solid.useContext(nearestMatchContext)
  const nearestMatch = opts.from ? undefined : contextMatch
  // `from` can be the module-local id of a module installed several times:
  // it resolves through the nearest match. A live match never changes route,
  // so read it once without tracking.
  const nearestRouteId =
    resolveRouteId && opts.from
      ? Solid.untrack(contextMatch[0 /* route id */])
      : undefined

  const match = () => {
    if (opts.from) {
      return router.stores
        .getMatchStore(
          resolveRouteId
            ? resolveRouteId(router, opts.from, nearestRouteId)
            : opts.from,
        )
        .get()
    }

    return nearestMatch?.[1 /* match */]()
  }

  Solid.createEffect(() => {
    if (match() !== undefined) {
      return
    }

    if (opts.shouldThrow ?? true) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(
          `Invariant failed: Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
        )
      }

      invariant()
    }
  })

  return Solid.createMemo((prev: TSelected | undefined) => {
    const selectedMatch = match()

    if (selectedMatch === undefined) {
      return undefined
    }

    const res = opts.select
      ? opts.select(
          selectedMatch as unknown as Parameters<
            NonNullable<typeof opts.select>
          >[0],
        )
      : selectedMatch
    if (prev === undefined) return res as TSelected
    return replaceEqualDeep(prev, res) as TSelected
  }) as any
}
