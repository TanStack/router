import { useMatch } from './useMatch'
import type { Accessor } from 'solid-js'
import type {
  AnyRouter,
  Register,
  ResolveUseLoaderDeps,
  StrictOrFrom,
  UseLoaderDepsResult,
} from '@tanstack/router-core'

export interface UseLoaderDepsBaseOptions<
  TRouterOrRegister extends AnyRouter | Register,
  TFrom,
  TSelected,
> {
  select?: (
    deps: ResolveUseLoaderDeps<TRouterOrRegister, TFrom>,
  ) => TSelected
}

export type UseLoaderDepsOptions<
  TRouterOrRegister extends AnyRouter | Register,
  TFrom extends string | undefined,
  TSelected,
> = StrictOrFrom<TRouterOrRegister, TFrom> &
  UseLoaderDepsBaseOptions<TRouterOrRegister, TFrom, TSelected>

export type UseLoaderDepsRoute<TRouterOrRegister extends AnyRouter | Register, out TId> = <
  TSelected = unknown,
>(
  opts?: UseLoaderDepsBaseOptions<TRouterOrRegister, TId, TSelected>,
) => Accessor<UseLoaderDepsResult<TRouterOrRegister, TId, TSelected>>

export function useLoaderDeps<
  TRouterOrRegister extends AnyRouter | Register = Register,
  const TFrom extends string | undefined = undefined,
  TSelected = unknown,
>(
  opts: UseLoaderDepsOptions<TRouterOrRegister, TFrom, TSelected>,
): Accessor<UseLoaderDepsResult<TRouterOrRegister, TFrom, TSelected>> {
  const { select, ...rest } = opts
  return useMatch({
    ...rest,
    select: (s) => {
      return select ? select(s.loaderDeps) : s.loaderDeps
    },
  }) as Accessor<UseLoaderDepsResult<TRouterOrRegister, TFrom, TSelected>>
}
