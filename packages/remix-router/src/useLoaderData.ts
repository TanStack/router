import { useMatch } from './useMatch'
import type { Handle } from '@remix-run/ui'
import type {
  AnyRouter,
  RegisteredRouter,
  ResolveUseLoaderData,
  StrictOrFrom,
  UseLoaderDataResult,
} from '@tanstack/router-core'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'

export interface UseLoaderDataBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
  TStructuralSharing,
> {
  select?: (
    data: ResolveUseLoaderData<TRouter, TFrom, TStrict>,
  ) => ValidateSelected<TRouter, TSelected, TStructuralSharing>
}

export type UseLoaderDataOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TSelected,
  TStructuralSharing,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  UseLoaderDataBaseOptions<TRouter, TFrom, TStrict, TSelected, TStructuralSharing> &
  StructuralSharingOption<TRouter, TSelected, TStructuralSharing>

/**
 * Subscribe to a route's loader data.
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useLoaderDataHook
 */
export function useLoaderData<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  handle: Handle<any, any>,
  opts: UseLoaderDataOptions<TRouter, TFrom, TStrict, TSelected, TStructuralSharing>,
): () => UseLoaderDataResult<TRouter, TFrom, TStrict, TSelected> {
  return useMatch(handle, {
    from: opts.from!,
    strict: (opts as any).strict,
    structuralSharing: (opts as any).structuralSharing,
    select: (match: any) =>
      opts.select ? opts.select(match.loaderData) : match.loaderData,
  } as any) as any
}
