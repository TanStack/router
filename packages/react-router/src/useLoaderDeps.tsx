import { useMatch } from './useMatch'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'
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
  TStructuralSharing,
> {
  select?: (
    deps: ResolveUseLoaderDeps<TRouterOrRegister, TFrom>,
  ) => ValidateSelected<TRouterOrRegister, TSelected, TStructuralSharing>
}

export type UseLoaderDepsOptions<
  TRouterOrRegister extends AnyRouter | Register,
  TFrom extends string | undefined,
  TSelected,
  TStructuralSharing,
> = StrictOrFrom<TRouterOrRegister, TFrom> &
  UseLoaderDepsBaseOptions<
    TRouterOrRegister,
    TFrom,
    TSelected,
    TStructuralSharing
  > &
  StructuralSharingOption<TRouterOrRegister, TSelected, TStructuralSharing>

export type UseLoaderDepsRoute<
  TRouterOrRegister extends AnyRouter | Register,
  out TId,
> = <TSelected = unknown, TStructuralSharing extends boolean = boolean>(
  opts?: UseLoaderDepsBaseOptions<
    TRouterOrRegister,
    TId,
    TSelected,
    TStructuralSharing
  > &
    StructuralSharingOption<TRouterOrRegister, TSelected, false>,
) => UseLoaderDepsResult<TRouterOrRegister, TId, TSelected>

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
  TRouterOrRegister extends AnyRouter | Register = Register,
  const TFrom extends string | undefined = undefined,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts: UseLoaderDepsOptions<
    TRouterOrRegister,
    TFrom,
    TSelected,
    TStructuralSharing
  >,
): UseLoaderDepsResult<TRouterOrRegister, TFrom, TSelected> {
  const { select, ...rest } = opts
  return useMatch({
    ...rest,
    select: (s) => {
      return select ? select(s.loaderDeps) : s.loaderDeps
    },
  }) as UseLoaderDepsResult<TRouterOrRegister, TFrom, TSelected>
}
