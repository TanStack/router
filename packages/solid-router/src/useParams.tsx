import { useMatch } from './useMatch'
import type { AllParams, RouteById } from './routeInfo'
import type { AnyRouter, RegisteredRouter } from './router'
import type { StrictOrFrom } from './utils'
import type { Expand, ValidateJSON } from '@tanstack/router-core'

export interface UseParamsBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
> {
  select?: (
    params: ResolveParams<TRouter, TFrom, TStrict>,
  ) => ValidateJSON<TSelected>
}

export type UseParamsOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TSelected,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  UseParamsBaseOptions<TRouter, TFrom, TStrict, TSelected>
export type ResolveParams<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
> = TStrict extends false
  ? AllParams<TRouter['routeTree']>
  : Expand<RouteById<TRouter['routeTree'], TFrom>['types']['allParams']>

export type UseParamsResult<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
> = unknown extends TSelected
  ? ResolveParams<TRouter, TFrom, TStrict>
  : TSelected

export type UseParamsRoute<out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseParamsBaseOptions<TRouter, TFrom, true, TSelected>,
) => UseParamsResult<TRouter, TFrom, true, TSelected>

export function useParams<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
>(
  opts: UseParamsOptions<TRouter, TFrom, TStrict, TSelected>,
): UseParamsResult<TRouter, TFrom, TStrict, TSelected> {
  return useMatch({
    from: opts.from!,
    strict: opts.strict,
    select: (match: any) => {
      return opts.select ? opts.select(match.params) : match.params
    },
  } as any) as UseParamsResult<TRouter, TFrom, TStrict, TSelected>
}
