import { useMatch } from './useMatch'
import type { Accessor } from 'solid-js'
import type {
  Register,
  RegisteredRouter,
  ResolveUseLoaderData,
  StrictOrFrom,
  UseLoaderDataResult,
} from '@tanstack/router-core'

export interface UseLoaderDataBaseOptions<
  TRegister extends Register,
  TFrom,
  TStrict extends boolean,
  TSelected,
> {
  select?: (
    match: ResolveUseLoaderData<RegisteredRouter<TRegister>, TFrom, TStrict>,
  ) => TSelected
}

export type UseLoaderDataOptions<
  TRegister extends Register,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TSelected,
> = StrictOrFrom<RegisteredRouter<TRegister>, TFrom, TStrict> &
  UseLoaderDataBaseOptions<TRegister, TFrom, TStrict, TSelected>

export type UseLoaderDataRoute<TRegister extends Register, out TId> = <
  TSelected = unknown,
>(
  opts?: UseLoaderDataBaseOptions<TRegister, TId, true, TSelected>,
) => Accessor<
  UseLoaderDataResult<RegisteredRouter<TRegister>, TId, true, TSelected>
>

export function useLoaderData<
  TRegister extends Register = Register,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
>(
  opts: UseLoaderDataOptions<TRegister, TFrom, TStrict, TSelected>,
): Accessor<
  UseLoaderDataResult<RegisteredRouter<TRegister>, TFrom, TStrict, TSelected>
> {
  return useMatch({
    from: opts.from!,
    strict: opts.strict,
    select: (s: any) => {
      return opts.select ? opts.select(s.loaderData) : s.loaderData
    },
  } as any) as any
}
