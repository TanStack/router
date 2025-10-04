import type {
  AnyRouter,
  RegisteredRouter,
  ResolveUseLoaderDeps,
  StrictOrFrom,
  UseLoaderDepsResult,
} from '@tanstack/router-core'
import type { Accessor } from 'solid-js'
import { useMatch } from './useMatch'

export interface UseLoaderDepsBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TSelected,
> {
  select?: (deps: ResolveUseLoaderDeps<TRouter, TFrom>) => TSelected
}

export type UseLoaderDepsOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TSelected,
> = StrictOrFrom<TRouter, TFrom> &
  UseLoaderDepsBaseOptions<TRouter, TFrom, TSelected>

export type UseLoaderDepsRoute<out TId> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseLoaderDepsBaseOptions<TRouter, TId, TSelected>,
) => Accessor<UseLoaderDepsResult<TRouter, TId, TSelected>>

/**
 * Selects and returns the matched route's loader dependencies as a Solid `Accessor`.
 *
 * When a `select` function is provided in `opts`, the accessor yields the result of applying
 * that function to the matched route's `loaderDeps`. Otherwise the accessor yields the
 * route's raw `loaderDeps`.
 *
 * @param opts - Options that specify which route to match and an optional `select` mapper
 *   to transform the matched route's `loaderDeps`.
 * @returns An `Accessor` that yields the selected loader dependencies for the matched route.
 */
export function useLoaderDeps<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TSelected = unknown,
>(
  opts: UseLoaderDepsOptions<TRouter, TFrom, TSelected>,
): Accessor<UseLoaderDepsResult<TRouter, TFrom, TSelected>> {
  const { select, ...rest } = opts
  return useMatch({
    ...rest,
    select: (s) => {
      return select ? select(s.loaderDeps) : s.loaderDeps
    },
  }) as Accessor<UseLoaderDepsResult<TRouter, TFrom, TSelected>>
}
