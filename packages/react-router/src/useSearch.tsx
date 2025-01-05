import { useMatch } from './useMatch'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'
import type { FullSearchSchema, RouteById } from './routeInfo'
import type { AnyRouter, RegisteredRouter } from './router'
import type { Expand, StrictOrFrom } from './utils'

export interface UseSearchBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
  TStructuralSharing,
> {
  select?: (
    state: ResolveSearch<TRouter, TFrom, TStrict>,
  ) => ValidateSelected<TRouter, TSelected, TStructuralSharing>
}

export type UseSearchOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
  TStructuralSharing,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  UseSearchBaseOptions<TRouter, TFrom, TStrict, TSelected, TStructuralSharing> &
  StructuralSharingOption<TRouter, TSelected, TStructuralSharing>

export type UseSearchResult<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
> = unknown extends TSelected
  ? ResolveSearch<TRouter, TFrom, TStrict>
  : TSelected

export type ResolveSearch<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
> = TStrict extends false
  ? FullSearchSchema<TRouter['routeTree']>
  : Expand<RouteById<TRouter['routeTree'], TFrom>['types']['fullSearchSchema']>

export type UseSearchRoute<out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseSearchBaseOptions<
    TRouter,
    TFrom,
    true,
    TSelected,
    TStructuralSharing
  > &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
) => UseSearchResult<TRouter, TFrom, true, TSelected>

export function useSearch<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts: UseSearchOptions<
    TRouter,
    TFrom,
    TStrict,
    TSelected,
    TStructuralSharing
  >,
): UseSearchResult<TRouter, TFrom, TStrict, TSelected> {
  return useMatch({
    from: opts.from!,
    strict: opts.strict,
    structuralSharing: opts.structuralSharing,
    select: (match: any) => {
      return opts.select ? opts.select(match.search) : match.search
    },
  }) as UseSearchResult<TRouter, TFrom, TStrict, TSelected>
}
