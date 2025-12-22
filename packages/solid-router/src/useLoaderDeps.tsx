import { useMatch } from './useMatch'
import type { Accessor } from 'solid-js'
import type {
  Register,
  RegisteredRouter,
  ResolveUseLoaderDeps,
  StrictOrFrom,
  UseLoaderDepsResult,
} from '@tanstack/router-core'

export interface UseLoaderDepsBaseOptions<
  TRegister extends Register,
  TFrom,
  TSelected,
> {
  select?: (
    deps: ResolveUseLoaderDeps<RegisteredRouter<TRegister>, TFrom>,
  ) => TSelected
}

export type UseLoaderDepsOptions<
  TRegister extends Register,
  TFrom extends string | undefined,
  TSelected,
> = StrictOrFrom<RegisteredRouter<TRegister>, TFrom> &
  UseLoaderDepsBaseOptions<TRegister, TFrom, TSelected>

export type UseLoaderDepsRoute<TRegister extends Register, out TId> = <
  TSelected = unknown,
>(
  opts?: UseLoaderDepsBaseOptions<TRegister, TId, TSelected>,
) => Accessor<UseLoaderDepsResult<RegisteredRouter<TRegister>, TId, TSelected>>

export function useLoaderDeps<
  TRegister extends Register = Register,
  const TFrom extends string | undefined = undefined,
  TSelected = unknown,
>(
  opts: UseLoaderDepsOptions<TRegister, TFrom, TSelected>,
): Accessor<
  UseLoaderDepsResult<RegisteredRouter<TRegister>, TFrom, TSelected>
> {
  const { select, ...rest } = opts
  return useMatch({
    ...rest,
    select: (s) => {
      return select ? select(s.loaderDeps) : s.loaderDeps
    },
  }) as Accessor<
    UseLoaderDepsResult<RegisteredRouter<TRegister>, TFrom, TSelected>
  >
}
