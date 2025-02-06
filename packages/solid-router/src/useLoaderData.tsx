import { useMatch } from './useMatch'
import type { AnyRouter, RegisteredRouter } from './router'
import type { AllLoaderData, RouteById } from './routeInfo'
import type { StrictOrFrom } from './utils'
import type { Expand, ValidateJSON } from '@tanstack/router-core'
import { Accessor } from 'solid-js'

export interface UseLoaderDataBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
> {
  select?: (match: ResolveLoaderData<TRouter, TFrom, TStrict>) => TSelected
}

export type UseLoaderDataOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TSelected,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  UseLoaderDataBaseOptions<TRouter, TFrom, TStrict, TSelected>

export type ResolveLoaderData<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
> = TStrict extends false
  ? AllLoaderData<TRouter['routeTree']>
  : Expand<RouteById<TRouter['routeTree'], TFrom>['types']['loaderData']>

export type UseLoaderDataResult<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
> = unknown extends TSelected
  ? ResolveLoaderData<TRouter, TFrom, TStrict>
  : TSelected

export type UseLoaderDataRoute<out TId> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseLoaderDataBaseOptions<TRouter, TId, true, TSelected>,
) => UseLoaderDataResult<TRouter, TId, true, TSelected>

export function useLoaderData<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
>(
  opts: UseLoaderDataOptions<TRouter, TFrom, TStrict, TSelected>,
): Accessor<UseLoaderDataResult<TRouter, TFrom, TStrict, TSelected>> {
  return useMatch({
    from: opts.from!,
    strict: opts.strict,
    select: (s: any) => {
      return opts.select ? opts.select(s.loaderData) : s.loaderData
    },
  } as any) as any
}
