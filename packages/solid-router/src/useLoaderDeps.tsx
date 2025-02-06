import { useMatch } from './useMatch'
import type { AnyRouter, RegisteredRouter } from './router'
import type { RouteById } from './routeInfo'
import type { StrictOrFrom } from './utils'
import type { Expand, ValidateJSON } from '@tanstack/router-core'

export interface UseLoaderDepsBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TSelected,
> {
  select?: (deps: ResolveLoaderDeps<TRouter, TFrom>) => TSelected
}

export type UseLoaderDepsOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TSelected,
> = StrictOrFrom<TRouter, TFrom> &
  UseLoaderDepsBaseOptions<TRouter, TFrom, TSelected>
export type ResolveLoaderDeps<TRouter extends AnyRouter, TFrom> = Expand<
  RouteById<TRouter['routeTree'], TFrom>['types']['loaderDeps']
>

export type UseLoaderDepsResult<
  TRouter extends AnyRouter,
  TFrom,
  TSelected,
> = unknown extends TSelected ? ResolveLoaderDeps<TRouter, TFrom> : TSelected

export type UseLoaderDepsRoute<out TId> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseLoaderDepsBaseOptions<TRouter, TId, TSelected>,
) => UseLoaderDepsResult<TRouter, TId, TSelected>

export function useLoaderDeps<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TSelected = unknown,
>(
  opts: UseLoaderDepsOptions<TRouter, TFrom, TSelected>,
): UseLoaderDepsResult<TRouter, TFrom, TSelected> {
  const { select, ...rest } = opts
  return useMatch({
    ...rest,
    select: (s) => {
      return select ? select(s.loaderDeps) : s.loaderDeps
    },
  }) as UseLoaderDepsResult<TRouter, TFrom, TSelected>
}
