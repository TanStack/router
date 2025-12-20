import { useMatch } from './useMatch'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'
import type {
  AnyRouter,
  RegisteredRouter,
  Register,
  ResolveUseSearch,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
  UseSearchResult,
} from '@tanstack/router-core'

export interface UseSearchBaseOptions<
  TRegister extends Register,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
  TStructuralSharing,
> {
  select?: (
    state: ResolveUseSearch<RegisteredRouter<TRegister>, TFrom, TStrict>,
  ) => ValidateSelected<
    RegisteredRouter<TRegister>,
    TSelected,
    TStructuralSharing
  >
  shouldThrow?: TThrow
}

export type UseSearchOptions<
  TRegister extends Register,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
  TStructuralSharing,
> = StrictOrFrom<RegisteredRouter<TRegister>, TFrom, TStrict> &
  UseSearchBaseOptions<
    TRegister,
    TFrom,
    TStrict,
    TThrow,
    TSelected,
    TStructuralSharing
  > &
  StructuralSharingOption<
    RegisteredRouter<TRegister>,
    TSelected,
    TStructuralSharing
  >

export type UseSearchRoute<TRegister extends Register, out TFrom> = <
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseSearchBaseOptions<
    TRegister,
    TFrom,
    /* TStrict */ true,
    /* TThrow */ true,
    TSelected,
    TStructuralSharing
  > &
    StructuralSharingOption<
      RegisteredRouter<TRegister>,
      TSelected,
      TStructuralSharing
    >,
) => UseSearchResult<RegisteredRouter<TRegister>, TFrom, true, TSelected>

/**
 * Read and select the current route's search parameters with type-safety.
 *
 * Options:
 * - `from`/`strict`: Control which route's search is read and how strictly it's typed
 * - `select`: Map the search object to a derived value for render optimization
 * - `structuralSharing`: Enable structural sharing for stable references
 * - `shouldThrow`: Throw when the route is not found (strict contexts)
 *
 * @returns The search object (or selected value) for the matched route.
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useSearchHook
 */
export function useSearch<
  TRegister extends Register = Register,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts: UseSearchOptions<
    TRegister,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected,
    TStructuralSharing
  >,
): ThrowOrOptional<
  UseSearchResult<RegisteredRouter<TRegister>, TFrom, TStrict, TSelected>,
  TThrow
> {
  return useMatch({
    from: opts.from!,
    strict: opts.strict,
    shouldThrow: opts.shouldThrow,
    structuralSharing: opts.structuralSharing,
    select: (match: any) => {
      return opts.select ? opts.select(match.search) : match.search
    },
  }) as any
}
