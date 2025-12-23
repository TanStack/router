import { useMatch } from './useMatch'
import type { Accessor } from 'solid-js'
import type {
  AnyRouter,
  Register,
  ResolveUseLoaderData,
  StrictOrFrom,
  UseLoaderDataResult,
} from '@tanstack/router-core'

export interface UseLoaderDataBaseOptions<
  TRouterOrRegister extends AnyRouter | Register,
  TFrom,
  TStrict extends boolean,
  TSelected,
> {
  select?: (
    match: ResolveUseLoaderData<TRouterOrRegister, TFrom, TStrict>,
  ) => TSelected
}

export type UseLoaderDataOptions<
  TRouterOrRegister extends AnyRouter | Register,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TSelected,
> = StrictOrFrom<TRouterOrRegister, TFrom, TStrict> &
  UseLoaderDataBaseOptions<TRouterOrRegister, TFrom, TStrict, TSelected>

export type UseLoaderDataRoute<
  TRouterOrRegister extends AnyRouter | Register,
  out TId,
> = <TSelected = unknown>(
  opts?: UseLoaderDataBaseOptions<TRouterOrRegister, TId, true, TSelected>,
) => Accessor<UseLoaderDataResult<TRouterOrRegister, TId, true, TSelected>>

export function useLoaderData<
  TRouterOrRegister extends AnyRouter | Register = Register,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
>(
  opts: UseLoaderDataOptions<TRouterOrRegister, TFrom, TStrict, TSelected>,
): Accessor<UseLoaderDataResult<TRouterOrRegister, TFrom, TStrict, TSelected>> {
  return useMatch({
    from: opts.from!,
    strict: opts.strict,
    select: (s: any) => {
      return opts.select ? opts.select(s.loaderData) : s.loaderData
    },
  } as any) as any
}
