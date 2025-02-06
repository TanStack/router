import { useMatch } from './useMatch'
import type { FullSearchSchema, RouteById } from './routeInfo'
import type { AnyRouter, RegisteredRouter } from './router'
import type { StrictOrFrom } from './utils'
import type { Expand, ValidateJSON } from '@tanstack/router-core'
import { Accessor } from 'solid-js'

export interface UseSearchBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
> {
  select?: (state: ResolveSearch<TRouter, TFrom, TStrict>) => TSelected
}

export type UseSearchOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  UseSearchBaseOptions<TRouter, TFrom, TStrict, TSelected>

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
>(
  opts?: UseSearchBaseOptions<TRouter, TFrom, true, TSelected>,
) => Accessor<UseSearchResult<TRouter, TFrom, true, TSelected>>

export function useSearch<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
>(
  opts: UseSearchOptions<TRouter, TFrom, TStrict, TSelected>,
): UseSearchResult<TRouter, TFrom, TStrict, TSelected> {
  return useMatch({
    from: opts.from!,
    strict: opts.strict,
    select: (match: any) => {
      return opts.select ? opts.select(match.search) : match.search
    },
  }) as UseSearchResult<TRouter, TFrom, TStrict, TSelected>
}
