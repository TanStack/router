import { useMatch } from './useMatch'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'
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
  TStructuralSharing,
> {
  select?: (
    match: ResolveUseLoaderData<TRouterOrRegister, TFrom, TStrict>,
  ) => ValidateSelected<TRouterOrRegister, TSelected, TStructuralSharing>
}

export type UseLoaderDataOptions<
  TRouterOrRegister extends AnyRouter | Register,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TSelected,
  TStructuralSharing,
> = StrictOrFrom<TRouterOrRegister, TFrom, TStrict> &
  UseLoaderDataBaseOptions<
    TRouterOrRegister,
    TFrom,
    TStrict,
    TSelected,
    TStructuralSharing
  > &
  StructuralSharingOption<TRouterOrRegister, TSelected, TStructuralSharing>

export type UseLoaderDataRoute<
  TRouterOrRegister extends AnyRouter | Register,
  out TId,
> = <TSelected = unknown, TStructuralSharing extends boolean = boolean>(
  opts?: UseLoaderDataBaseOptions<
    TRouterOrRegister,
    TId,
    true,
    TSelected,
    TStructuralSharing
  > &
    StructuralSharingOption<TRouterOrRegister, TSelected, TStructuralSharing>,
) => UseLoaderDataResult<TRouterOrRegister, TId, true, TSelected>

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
  TRouterOrRegister extends AnyRouter | Register = Register,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts: UseLoaderDataOptions<
    TRouterOrRegister,
    TFrom,
    TStrict,
    TSelected,
    TStructuralSharing
  >,
): UseLoaderDataResult<TRouterOrRegister, TFrom, TStrict, TSelected> {
  return useMatch({
    from: opts.from!,
    strict: opts.strict,
    structuralSharing: opts.structuralSharing,
    select: (s: any) => {
      return opts.select ? opts.select(s.loaderData) : s.loaderData
    },
  } as any) as UseLoaderDataResult<
    TRouterOrRegister,
    TFrom,
    TStrict,
    TSelected
  >
}
