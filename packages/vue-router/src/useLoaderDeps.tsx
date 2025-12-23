import { useMatch } from './useMatch'
import type {
  AnyRouter,
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
  select?: (deps: ResolveUseLoaderDeps<RegisteredRouter<TRegister>, TFrom>) => TSelected
}

export type UseLoaderDepsOptions<
  TRegister extends Register,
  TFrom extends string | undefined,
  TSelected,
> = StrictOrFrom<RegisteredRouter<TRegister>, TFrom> &
  UseLoaderDepsBaseOptions<TRegister, TFrom, TSelected>

export type UseLoaderDepsRoute<out TId> = <
  TRegister extends Register = Register,
  TSelected = unknown,
>(
  opts?: UseLoaderDepsBaseOptions<TRegister, TId, TSelected>,
) => UseLoaderDepsResult<RegisteredRouter<TRegister>, TId, TSelected>

export function useLoaderDeps<
  TRegister extends Register = Register,
  const TFrom extends string | undefined = undefined,
  TSelected = unknown,
>(
  opts: UseLoaderDepsOptions<TRegister, TFrom, TSelected>,
): UseLoaderDepsResult<RegisteredRouter<TRegister>, TFrom, TSelected> {
  const { select, ...rest } = opts
  return useMatch({
    ...rest,
    select: (s: any) => {
      return select ? select(s.loaderDeps) : s.loaderDeps
    },
  }) as UseLoaderDepsResult<RegisteredRouter<TRegister>, TFrom, TSelected>
}
