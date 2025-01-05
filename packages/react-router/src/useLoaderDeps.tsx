import { useMatch } from './useMatch'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'
import type { AnyRouter, RegisteredRouter } from './router'
import type { RouteById } from './routeInfo'
import type { Expand, StrictOrFrom } from './utils'

export interface UseLoaderDepsBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TSelected,
  TStructuralSharing,
> {
  select?: (
    deps: ResolveLoaderDeps<TRouter, TFrom>,
  ) => ValidateSelected<TRouter, TSelected, TStructuralSharing>
}

export type UseLoaderDepsOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TSelected,
  TStructuralSharing,
> = StrictOrFrom<TRouter, TFrom> &
  UseLoaderDepsBaseOptions<TRouter, TFrom, TSelected, TStructuralSharing> &
  StructuralSharingOption<TRouter, TSelected, TStructuralSharing>

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
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseLoaderDepsBaseOptions<TRouter, TId, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, false>,
) => UseLoaderDepsResult<TRouter, TId, TSelected>

export function useLoaderDeps<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts: UseLoaderDepsOptions<TRouter, TFrom, TSelected, TStructuralSharing>,
): UseLoaderDepsResult<TRouter, TFrom, TSelected> {
  const { select, ...rest } = opts
  return useMatch({
    ...rest,
    select: (s) => {
      return select ? select(s.loaderDeps) : s.loaderDeps
    },
  }) as UseLoaderDepsResult<TRouter, TFrom, TSelected>
}
