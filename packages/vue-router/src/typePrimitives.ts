import type { LinkComponentProps } from './link'
import type { UseParamsOptions } from './useParams'
import type { UseSearchOptions } from './useSearch'
import type {
  AnyRouter,
  Constrain,
  InferFrom,
  InferMaskFrom,
  InferMaskTo,
  InferSelected,
  InferShouldThrow,
  InferStrict,
  InferTo,
  Register,
  RegisteredRouter,
  ValidateFromPath as ValidateFromPathCore,
  ValidateId as ValidateIdCore,
  ValidateNavigateOptions as ValidateNavigateOptionsCore,
  ValidateNavigateOptionsArray as ValidateNavigateOptionsArrayCore,
  ValidateParams as ValidateParamsCore,
  ValidateRedirectOptions as ValidateRedirectOptionsCore,
  ValidateRedirectOptionsArray as ValidateRedirectOptionsArrayCore,
  ValidateSearch as ValidateSearchCore,
  ValidateToPath as ValidateToPathCore,
  ValidateUseParamsResult as ValidateUseParamsResultCore,
  ValidateUseSearchResult as ValidateUseSearchResultCore,
} from '@tanstack/router-core'

export type {
  InferFrom,
  InferMaskFrom,
  InferMaskTo,
  InferSelected,
  InferShouldThrow,
  InferStrict,
  InferTo,
} from '@tanstack/router-core'

export type ValidateFromPath<
  TRegister extends Register = Register,
  TFrom = string,
> = ValidateFromPathCore<TRegister, TFrom>

export type ValidateToPath<
  TRegister extends Register = Register,
  TTo extends string | undefined = undefined,
  TFrom extends string = string,
> = ValidateToPathCore<TRegister, TTo, TFrom>

export type ValidateSearch<
  TRegister extends Register = Register,
  TTo extends string | undefined = undefined,
  TFrom extends string = string,
> = ValidateSearchCore<TRegister, TTo, TFrom>

export type ValidateParams<
  TRegister extends Register = Register,
  TTo extends string | undefined = undefined,
  TFrom extends string = string,
> = ValidateParamsCore<TRegister, TTo, TFrom>

export type ValidateNavigateOptions<
  TRegister extends Register = Register,
  TOptions = unknown,
  TDefaultFrom extends string = string,
> = ValidateNavigateOptionsCore<TRegister, TOptions, TDefaultFrom>

export type ValidateNavigateOptionsArray<
  TRegister extends Register = Register,
  TOptions extends ReadonlyArray<any> = ReadonlyArray<unknown>,
  TDefaultFrom extends string = string,
> = ValidateNavigateOptionsArrayCore<TRegister, TOptions, TDefaultFrom>

export type ValidateRedirectOptions<
  TRegister extends Register = Register,
  TOptions = unknown,
  TDefaultFrom extends string = string,
> = ValidateRedirectOptionsCore<TRegister, TOptions, TDefaultFrom>

export type ValidateRedirectOptionsArray<
  TRegister extends Register = Register,
  TOptions extends ReadonlyArray<any> = ReadonlyArray<unknown>,
  TDefaultFrom extends string = string,
> = ValidateRedirectOptionsArrayCore<TRegister, TOptions, TDefaultFrom>

export type ValidateId<
  TRegister extends Register = Register,
  TId extends string = string,
> = ValidateIdCore<TRegister, TId>

export type ValidateUseSearchResult<
  TOptions,
  TRegister extends Register = Register,
> = ValidateUseSearchResultCore<TOptions, TRegister>

export type ValidateUseParamsResult<
  TOptions,
  TRegister extends Register = Register,
> = ValidateUseParamsResultCore<TOptions, TRegister>

export type ValidateLinkOptions<
  TRegister extends Register = Register,
  TOptions = unknown,
  TDefaultFrom extends string = string,
  TComp = 'a',
> = Constrain<
  TOptions,
  LinkComponentProps<
    TComp,
    TRegister,
    InferFrom<TOptions, TDefaultFrom>,
    InferTo<TOptions>,
    InferMaskFrom<TOptions>,
    InferMaskTo<TOptions>
  >
>

export type ValidateLinkOptionsArray<
  TRegister extends Register = Register,
  TOptions extends ReadonlyArray<any> = ReadonlyArray<unknown>,
  TDefaultFrom extends string = string,
  TComp = 'a',
> = {
  [K in keyof TOptions]: ValidateLinkOptions<
    TRegister,
    TOptions[K],
    TDefaultFrom,
    TComp
  >
}

export type ValidateUseSearchOptions<
  TOptions,
  TRouter extends AnyRouter = RegisteredRouter,
> = Constrain<
  TOptions,
  UseSearchOptions<
    TRouter,
    InferFrom<TOptions>,
    InferStrict<TOptions>,
    InferShouldThrow<TOptions>,
    InferSelected<TOptions>
  >
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
    InferShouldThrow<TOptions>,
    InferSelected<TOptions>
  >
>
