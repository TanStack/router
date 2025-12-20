import { useMatch } from './useMatch'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'
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
  TStructuralSharing,
> {
  select?: (
    deps: ResolveUseLoaderDeps<RegisteredRouter<TRegister>, TFrom>,
  ) => ValidateSelected<
    RegisteredRouter<TRegister>,
    TSelected,
    TStructuralSharing
  >
}

export type UseLoaderDepsOptions<
  TRegister extends Register,
  TFrom extends string | undefined,
  TSelected,
  TStructuralSharing,
> = StrictOrFrom<RegisteredRouter<TRegister>, TFrom> &
  UseLoaderDepsBaseOptions<TRegister, TFrom, TSelected, TStructuralSharing> &
  StructuralSharingOption<
    RegisteredRouter<TRegister>,
    TSelected,
    TStructuralSharing
  >

export type UseLoaderDepsRoute<TRegister extends Register, out TId> = <
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseLoaderDepsBaseOptions<
    TRegister,
    TId,
    TSelected,
    TStructuralSharing
  > &
    StructuralSharingOption<RegisteredRouter<TRegister>, TSelected, false>,
) => UseLoaderDepsResult<RegisteredRouter<TRegister>, TId, TSelected>

/**
 * Read and select the current route's loader dependencies object.
 *
 * Options:
 * - `from`: Choose which route's loader deps to read
 * - `select`: Map the deps to a derived value
 * - `structuralSharing`: Enable structural sharing for stable references
 *
 * @returns The loader deps (or selected value) for the matched route.
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useLoaderDepsHook
 */
export function useLoaderDeps<
  TRegister extends Register = Register,
  const TFrom extends string | undefined = undefined,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts: UseLoaderDepsOptions<TRegister, TFrom, TSelected, TStructuralSharing>,
): UseLoaderDepsResult<RegisteredRouter<TRegister>, TFrom, TSelected> {
  const { select, ...rest } = opts
  return useMatch({
    ...rest,
    select: (s) => {
      return select ? select(s.loaderDeps) : s.loaderDeps
    },
  }) as UseLoaderDepsResult<RegisteredRouter<TRegister>, TFrom, TSelected>
}
