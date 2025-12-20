import { useMatch } from './useMatch'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'
import type {
  AnyRouter,
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
  TStructuralSharing,
> {
  select?: (
    match: ResolveUseLoaderData<RegisteredRouter<TRegister>, TFrom, TStrict>,
  ) => ValidateSelected<
    RegisteredRouter<TRegister>,
    TSelected,
    TStructuralSharing
  >
}

export type UseLoaderDataOptions<
  TRegister extends Register,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TSelected,
  TStructuralSharing,
> = StrictOrFrom<RegisteredRouter<TRegister>, TFrom, TStrict> &
  UseLoaderDataBaseOptions<
    TRegister,
    TFrom,
    TStrict,
    TSelected,
    TStructuralSharing
  > &
  StructuralSharingOption<
    RegisteredRouter<TRegister>,
    TSelected,
    TStructuralSharing
  >

export type UseLoaderDataRoute<TRegister extends Register, out TId> = <
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseLoaderDataBaseOptions<
    TRegister,
    TId,
    true,
    TSelected,
    TStructuralSharing
  > &
    StructuralSharingOption<
      RegisteredRouter<TRegister>,
      TSelected,
      TStructuralSharing
    >,
) => UseLoaderDataResult<RegisteredRouter<TRegister>, TId, true, TSelected>

/**
 * Read and select the current route's loader data with type‑safety.
 *
 * Options:
 * - `from`/`strict`: Choose which route's data to read and strictness
 * - `select`: Map the loader data to a derived value
 * - `structuralSharing`: Enable structural sharing for stable references
 *
 * @returns The loader data (or selected value) for the matched route.
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useLoaderDataHook
 */
export function useLoaderData<
  TRegister extends Register = Register,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts: UseLoaderDataOptions<
    TRegister,
    TFrom,
    TStrict,
    TSelected,
    TStructuralSharing
  >,
): UseLoaderDataResult<RegisteredRouter<TRegister>, TFrom, TStrict, TSelected> {
  return useMatch({
    from: opts.from!,
    strict: opts.strict,
    structuralSharing: opts.structuralSharing,
    select: (s: any) => {
      return opts.select ? opts.select(s.loaderData) : s.loaderData
    },
  } as any) as UseLoaderDataResult<
    RegisteredRouter<TRegister>,
    TFrom,
    TStrict,
    TSelected
  >
}
