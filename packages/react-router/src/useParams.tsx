import { useMatch } from './useMatch'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'
import type {
  Register,
  RegisteredRouter,
  ResolveUseParams,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
  UseParamsResult,
} from '@tanstack/router-core'

export interface UseParamsBaseOptions<
  TRegister extends Register,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
  TStructuralSharing,
> {
  select?: (
    params: ResolveUseParams<RegisteredRouter<TRegister>, TFrom, TStrict>,
  ) => ValidateSelected<
    RegisteredRouter<TRegister>,
    TSelected,
    TStructuralSharing
  >
  shouldThrow?: TThrow
}

export type UseParamsOptions<
  TRegister extends Register,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
  TStructuralSharing,
> = StrictOrFrom<RegisteredRouter<TRegister>, TFrom, TStrict> &
  UseParamsBaseOptions<
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

export type UseParamsRoute<TRegister extends Register, out TFrom> = <
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseParamsBaseOptions<
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
) => UseParamsResult<RegisteredRouter<TRegister>, TFrom, true, TSelected>

/**
 * Access the current route's path parameters with type-safety.
 *
 * Options:
 * - `from`/`strict`: Specify the matched route and whether to enforce strict typing
 * - `select`: Project the params object to a derived value for memoized renders
 * - `structuralSharing`: Enable structural sharing for stable references
 * - `shouldThrow`: Throw if the route is not found in strict contexts
 *
 * @returns The params object (or selected value) for the matched route.
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useParamsHook
 */
export function useParams<
  TRegister extends Register = Register,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts: UseParamsOptions<
    TRegister,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected,
    TStructuralSharing
  > = {} as any,
): ThrowOrOptional<
  UseParamsResult<RegisteredRouter<TRegister>, TFrom, TStrict, TSelected>,
  TThrow
> {
  return useMatch<TRegister, any, any, any, any, any>({
    from: opts.from!,
    shouldThrow: opts.shouldThrow,
    structuralSharing: opts.structuralSharing,
    strict: opts.strict,
    select: (match: any) => {
      const params = opts.strict === false ? match.params : match._strictParams

      return opts.select ? opts.select(params) : params
    },
  } as any) as any
}
