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
  RegisteredRouter,
  Register,
} from '@tanstack/router-core'
import type { LinkComponentProps } from './link'
import type { UseParamsOptions } from './useParams'
import type { UseSearchOptions } from './useSearch'

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

/**
 * @private
 */
export type InferStructuralSharing<TOptions> = TOptions extends {
  structuralSharing: infer TStructuralSharing
}
  ? TStructuralSharing
  : unknown

export type ValidateUseSearchOptions<
  TOptions,
  TRegister extends Register = Register,
> = Constrain<
  TOptions,
  UseSearchOptions<
    TRegister,
    InferFrom<TOptions>,
    InferStrict<TOptions>,
    InferShouldThrow<TOptions>,
    InferSelected<TOptions>,
    InferStructuralSharing<TOptions>
  >
>

export type ValidateUseParamsOptions<
  TOptions,
  TRegister extends Register = Register,
> = Constrain<
  TOptions,
  UseParamsOptions<
    TRegister,
    InferFrom<TOptions>,
    InferStrict<TOptions>,
    InferShouldThrow<TOptions>,
    InferSelected<TOptions>,
    InferStructuralSharing<TOptions>
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
