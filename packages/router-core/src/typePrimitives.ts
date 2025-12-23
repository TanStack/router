import type {
  FromPathOption,
  NavigateOptions,
  PathParamOptions,
  SearchParamOptions,
  ToPathOption,
} from './link'
import type { RedirectOptions } from './redirect'
import type { RouteIds } from './routeInfo'
import type { AnyRouter, Register, RegisteredRouter } from './router'
import type { UseParamsResult } from './useParams'
import type { UseSearchResult } from './useSearch'
import type { Constrain, ConstrainLiteral } from './utils'

export type ValidateFromPath<
  TRegister extends Register = Register,
  TFrom = string,
> = FromPathOption<TRegister, TFrom>

export type ValidateToPath<
  TRegister extends Register = Register,
  TTo extends string | undefined = undefined,
  TFrom extends string = string,
> = ToPathOption<TRegister, TFrom, TTo>

export type ValidateSearch<
  TRegister extends Register = Register,
  TTo extends string | undefined = undefined,
  TFrom extends string = string,
> = SearchParamOptions<TRegister, TFrom, TTo>

export type ValidateParams<
  TRegister extends Register = Register,
  TTo extends string | undefined = undefined,
  TFrom extends string = string,
> = PathParamOptions<TRegister, TFrom, TTo>

/**
 * @private
 */
export type InferFrom<
  TOptions,
  TDefaultFrom extends string = string,
> = TOptions extends {
  from: infer TFrom extends string
}
  ? TFrom
  : TDefaultFrom

/**
 * @private
 */
export type InferTo<TOptions> = TOptions extends {
  to: infer TTo extends string
}
  ? TTo
  : undefined

/**
 * @private
 */
export type InferMaskTo<TOptions> = TOptions extends {
  mask: { to: infer TTo extends string }
}
  ? TTo
  : ''

export type InferMaskFrom<TOptions> = TOptions extends {
  mask: { from: infer TFrom extends string }
}
  ? TFrom
  : string

export type ValidateNavigateOptions<
  TRegister extends Register = Register,
  TOptions = unknown,
  TDefaultFrom extends string = string,
> = Constrain<
  TOptions,
  NavigateOptions<
    TRegister,
    InferFrom<TOptions, TDefaultFrom>,
    InferTo<TOptions>,
    InferMaskFrom<TOptions>,
    InferMaskTo<TOptions>
  >
>

export type ValidateNavigateOptionsArray<
  TRegister extends Register = Register,
  TOptions extends ReadonlyArray<any> = ReadonlyArray<unknown>,
  TDefaultFrom extends string = string,
> = {
  [K in keyof TOptions]: ValidateNavigateOptions<
    TRegister,
    TOptions[K],
    TDefaultFrom
  >
}

export type ValidateRedirectOptions<
  TRegister extends Register = Register,
  TOptions = unknown,
  TDefaultFrom extends string = string,
> = Constrain<
  TOptions,
  RedirectOptions<
    TRegister,
    InferFrom<TOptions, TDefaultFrom>,
    InferTo<TOptions>,
    InferMaskFrom<TOptions>,
    InferMaskTo<TOptions>
  >
>

export type ValidateRedirectOptionsArray<
  TRegister extends Register = Register,
  TOptions extends ReadonlyArray<any> = ReadonlyArray<unknown>,
  TDefaultFrom extends string = string,
> = {
  [K in keyof TOptions]: ValidateRedirectOptions<
    TRegister,
    TOptions[K],
    TDefaultFrom
  >
}

export type ValidateId<
  TRegister extends Register = Register,
  TId extends string = string,
> = ConstrainLiteral<TId, RouteIds<RegisteredRouter<TRegister>['routeTree']>>

/**
 * @private
 */
export type InferStrict<TOptions> = TOptions extends {
  strict: infer TStrict extends boolean
}
  ? TStrict
  : true

/**
 * @private
 */
export type InferShouldThrow<TOptions> = TOptions extends {
  shouldThrow: infer TShouldThrow extends boolean
}
  ? TShouldThrow
  : true

/**
 * @private
 */
export type InferSelected<TOptions> = TOptions extends {
  select: (...args: Array<any>) => infer TSelected
}
  ? TSelected
  : unknown

export type ValidateUseSearchResult<
  TOptions,
  TRegister extends Register = Register,
> = UseSearchResult<
  TRegister,
  InferFrom<TOptions>,
  InferStrict<TOptions>,
  InferSelected<TOptions>
>

export type ValidateUseParamsResult<
  TOptions,
  TRegister extends Register = Register,
> = Constrain<
  TOptions,
  UseParamsResult<
    TRegister,
    InferFrom<TOptions>,
    InferStrict<TOptions>,
    InferSelected<TOptions>
  >
>
