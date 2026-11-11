import { useMatch } from './useMatch'
import type { Accessor } from 'solid-js'
import type {
  AnyRouter,
  Register,
  RegisteredRouter,
  RegisteredRouterOf,
  ResolveUseLoaderData,
  StrictOrFrom,
  UseLoaderDataResult,
} from '@tanstack/router-core'

export interface UseLoaderDataBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
> {
  select?: (match: ResolveUseLoaderData<TRouter, TFrom, TStrict>) => TSelected
}

export type UseLoaderDataOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TSelected,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  UseLoaderDataBaseOptions<TRouter, TFrom, TStrict, TSelected>

export type UseLoaderDataRoute<out TId, TDefaultRegister = Register> = <
  TRouter extends AnyRouter = RegisteredRouterOf<TDefaultRegister>,
  TSelected = unknown,
>(
  opts?: UseLoaderDataBaseOptions<TRouter, TId, true, TSelected>,
) => Accessor<UseLoaderDataResult<TRouter, TId, true, TSelected>>

/**
 * The signature of `useLoaderData`, typed against the router of `TDefaultRegister` unless a router
 * type is passed explicitly. Route modules export a `useLoaderData` of this type.
 */
export type UseLoaderDataFn<TDefaultRegister = Register> = <
  TRouter extends AnyRouter = RegisteredRouterOf<TDefaultRegister>,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
>(
  opts: UseLoaderDataOptions<TRouter, TFrom, TStrict, TSelected>,
) => Accessor<UseLoaderDataResult<TRouter, TFrom, TStrict, TSelected>>

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
    select: (match) => {
      return opts.select ? opts.select(match.loaderData) : match.loaderData
    },
  }) as any
}
