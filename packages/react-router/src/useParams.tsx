import { useMatch } from './useMatch'
import type {
  StructuralSharingOption,
  ValidateSelected,
} from './structuralSharing'
import type {
  AnyRouter,
  Register,
  RegisteredRouter,
  ResolveUseParams,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
  UseParamsResult,
} from '@tanstack/router-core'

export interface UseParamsBaseOptions<
  TRouterOrRegister extends AnyRouter | Register,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
  TStructuralSharing,
> {
  select?: (
    params: ResolveUseParams<TRouterOrRegister, TFrom, TStrict>,
  ) => ValidateSelected<TRouterOrRegister, TSelected, TStructuralSharing>
  shouldThrow?: TThrow
}

export type UseParamsOptions<
  TRouterOrRegister extends AnyRouter | Register,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
  TStructuralSharing,
> = StrictOrFrom<TRouterOrRegister, TFrom, TStrict> &
  UseParamsBaseOptions<
    TRouterOrRegister,
    TFrom,
    TStrict,
    TThrow,
    TSelected,
    TStructuralSharing
  > &
  StructuralSharingOption<TRouterOrRegister, TSelected, TStructuralSharing>

export type UseParamsRoute<
  TRouterOrRegister extends AnyRouter | Register,
  out TFrom,
> = <TSelected = unknown, TStructuralSharing extends boolean = boolean>(
  opts?: UseParamsBaseOptions<
    TRouterOrRegister,
    TFrom,
    /* TStrict */ true,
    /* TThrow */ true,
    TSelected,
    TStructuralSharing
  > &
    StructuralSharingOption<TRouterOrRegister, TSelected, TStructuralSharing>,
) => UseParamsResult<TRouterOrRegister, TFrom, true, TSelected>

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
  TRouterOrRegister extends AnyRouter | Register = Register,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts: UseParamsOptions<
    TRouterOrRegister,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected,
    TStructuralSharing
  > = {} as any,
): ThrowOrOptional<
  UseParamsResult<TRouterOrRegister, TFrom, TStrict, TSelected>,
  TThrow
> {
  return useMatch<TRouterOrRegister, any, any, any, any, any>({
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
