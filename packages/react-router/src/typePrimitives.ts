import type {
  FromPathOption,
  NavigateOptions,
  PathParamOptions,
  SearchParamOptions,
  ToPathOption,
} from './link'
import type { RouteIds } from './routeInfo'
import type { AnyRouter, RegisteredRouter } from './router'
import type { UseParamsOptions, UseParamsResult } from './useParams'
import type { UseSearchOptions, UseSearchResult } from './useSearch'
import type { Constrain, ConstrainLiteral } from './utils'

export type ValidateFromPath<
  TFrom,
  TRouter extends AnyRouter = RegisteredRouter,
> = FromPathOption<TRouter, TFrom>

export type ValidateToPath<
  TTo extends string | undefined,
  TFrom extends string = string,
  TRouter extends AnyRouter = RegisteredRouter,
> = ToPathOption<TRouter, TFrom, TTo>

export type ValidateSearch<
  TTo extends string | undefined,
  TFrom extends string = string,
  TRouter extends AnyRouter = RegisteredRouter,
> = SearchParamOptions<TRouter, TFrom, TTo>

export type ValidateParams<
  TTo extends string | undefined,
  TFrom extends string = string,
  TRouter extends AnyRouter = RegisteredRouter,
> = PathParamOptions<TRouter, TFrom, TTo>

/**
 * @internal
 */
export type InferFrom<TOptions> = TOptions extends {
  from: infer TFrom extends string
}
  ? TFrom
  : string

/**
 * @internal
 */
export type InferTo<TOptions> = TOptions extends {
  to: infer TTo extends string
}
  ? TTo
  : undefined

/**
 * @internal
 */
export type InferMaskTo<TOptions> = TOptions extends {
  mask: { to: infer TTo extends string }
}
  ? TTo
  : string

export type InferMaskFrom<TOptions> = TOptions extends {
  mask: { from: infer TFrom extends string }
}
  ? TFrom
  : string

export type ValidateNavigateOptions<
  TOptions,
  TRouter extends AnyRouter = RegisteredRouter,
> = Constrain<
  TOptions,
  NavigateOptions<
    TRouter,
    InferFrom<TOptions>,
    InferTo<TOptions>,
    InferMaskFrom<TOptions>,
    InferMaskTo<TOptions>
  >
>

export type ValidateNavigateOptionsArray<TOptions extends ReadonlyArray<any>> =
  { [K in keyof TOptions]: ValidateNavigateOptions<TOptions[K]> }

export type ValidateId<
  TId extends string,
  TRouter extends AnyRouter = RegisteredRouter,
> = ConstrainLiteral<TId, RouteIds<TRouter['routeTree']>>

/**
 * @internal
 */
export type InferStrict<TOptions> = TOptions extends {
  strict: infer TStrict extends boolean
}
  ? TStrict
  : true

/**
 * @internal
 */
export type InferSelected<TOptions> = TOptions extends {
  select: (...args: Array<any>) => infer TSelected
}
  ? TSelected
  : unknown

/**
 * @internal
 */
export type InferStructuralSharing<TOptions> = TOptions extends {
  structuralSharing: infer TStructuralSharing
}
  ? TStructuralSharing
  : unknown

export type ValidateUseSearchOptions<
  TOptions,
  TRouter extends AnyRouter = RegisteredRouter,
> = Constrain<
  TOptions,
  UseSearchOptions<
    TRouter,
    InferFrom<TOptions>,
    InferStrict<TOptions>,
    InferSelected<TOptions>,
    InferStructuralSharing<TOptions>
  >
>

export type ValidateUseSearchResult<
  TOptions,
  TRouter extends AnyRouter = RegisteredRouter,
> = UseSearchResult<
  TRouter,
  InferFrom<TOptions>,
  InferStrict<TOptions>,
  InferSelected<TOptions>
>

export type ValidateUseParamsOptions<
  TOptions,
  TRouter extends AnyRouter = RegisteredRouter,
> = Constrain<
  TOptions,
  UseParamsOptions<
    TRouter,
    InferFrom<TOptions>,
    InferStrict<TOptions>,
    InferSelected<TOptions>,
    InferSelected<TOptions>
  >
>

export type ValidateUseParamsResult<
  TOptions,
  TRouter extends AnyRouter = RegisteredRouter,
> = Constrain<
  TOptions,
  UseParamsResult<
    TRouter,
    InferFrom<TOptions>,
    InferStrict<TOptions>,
    InferSelected<TOptions>
  >
>
