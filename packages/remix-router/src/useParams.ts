import { useMatch } from './useMatch'
import type { Handle } from '@remix-run/ui'
import type {
  AnyRouter,
  RegisteredRouter,
  ResolveUseParams,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
  UseParamsResult,
} from '@tanstack/router-core'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'

export interface UseParamsBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
  TStructuralSharing,
> {
  select?: (
    params: ResolveUseParams<TRouter, TFrom, TStrict>,
  ) => ValidateSelected<TRouter, TSelected, TStructuralSharing>
  shouldThrow?: TThrow
}

export type UseParamsOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
  TStructuralSharing,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  UseParamsBaseOptions<TRouter, TFrom, TStrict, TThrow, TSelected, TStructuralSharing> &
  StructuralSharingOption<TRouter, TSelected, TStructuralSharing>

/**
 * Subscribe to the path params of a route. Returns a getter
 * `() => params` (or `() => selected`).
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useParamsHook
 */
export function useParams<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  handle: Handle<any, any>,
  opts: UseParamsOptions<
    TRouter,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected,
    TStructuralSharing
  >,
): () => ThrowOrOptional<UseParamsResult<TRouter, TFrom, TStrict, TSelected>, TThrow> {
  return useMatch(handle, {
    from: opts.from!,
    shouldThrow: opts.shouldThrow as any,
    structuralSharing: (opts as any).structuralSharing,
    strict: (opts as any).strict,
    select: (match: any) => {
      const params =
        (opts as any).strict === false ? match.params : match._strictParams
      return opts.select ? opts.select(params) : params
    },
  } as any) as any
}
