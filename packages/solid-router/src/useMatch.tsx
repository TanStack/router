import * as Solid from 'solid-js'
import { invariant, replaceEqualDeep } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouterContext } from './useRouter'
import type {
  AnyRouter,
  MakeRouteMatch,
  MakeRouteMatchUnion,
  RegisteredRouter,
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
    match: MakeRouteMatch<TRouter['routeTree'], TFrom, TStrict>,
  ) => TSelected
  shouldThrow?: TThrow
}

export type UseMatchRoute<out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
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
  const context = useRouterContext()
  const router = context[0] as TRouter
  const nearestMatch = opts.from ? undefined : context[3 /* match */]

  const match = () => {
    if (opts.from) {
      return router.stores.getMatchStore(opts.from).get()
    }

    return nearestMatch?.()
  }

  if (isServer ?? router.isServer) {
    const selectedMatch = match()
    const selected =
      selectedMatch === undefined
        ? undefined
        : opts.select
          ? opts.select(selectedMatch)
          : selectedMatch
    return (() => selected) as any
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

    const res = opts.select ? opts.select(selectedMatch) : selectedMatch
    if (prev === undefined) {
      return res as TSelected
    }
    return replaceEqualDeep(prev, res) as TSelected
  }) as any
}
