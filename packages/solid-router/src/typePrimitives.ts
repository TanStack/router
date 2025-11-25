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
  RegisteredRouter,
} from '@tanstack/router-core'

export type ValidateLinkOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TOptions = unknown,
  TDefaultFrom extends string = string,
  TComp = 'a',
> = TOptions extends LinkComponentProps<
  TComp,
  TRouter,
  InferFrom<TOptions, TDefaultFrom>,
  InferTo<TOptions>,
  InferMaskFrom<TOptions>,
  InferMaskTo<TOptions>
>
  ? TOptions
  : LinkComponentProps<
      TComp,
      TRouter,
      InferFrom<TOptions, TDefaultFrom>,
      InferTo<TOptions>,
      InferMaskFrom<TOptions>,
      InferMaskTo<TOptions>
    >

export type ValidateLinkOptionsArray<
  TRouter extends AnyRouter = RegisteredRouter,
  TOptions extends ReadonlyArray<any> = ReadonlyArray<unknown>,
  TDefaultFrom extends string = string,
  TComp = 'a',
> = {
  [K in keyof TOptions]: ValidateLinkOptions<
    TRouter,
    TOptions[K],
    TDefaultFrom,
    TComp
  >
}

export type ValidateUseSearchOptions<
  TOptions,
  TRouter extends AnyRouter = RegisteredRouter,
> = TOptions extends UseSearchOptions<
  TRouter,
  InferFrom<TOptions>,
  InferStrict<TOptions>,
  InferShouldThrow<TOptions>,
  InferSelected<TOptions>
>
  ? TOptions
  : UseSearchOptions<
      TRouter,
      InferFrom<TOptions>,
      InferStrict<TOptions>,
      InferShouldThrow<TOptions>,
      InferSelected<TOptions>
    >

export type ValidateUseParamsOptions<
  TOptions,
  TRouter extends AnyRouter = RegisteredRouter,
> = TOptions extends UseParamsOptions<
  TRouter,
  InferFrom<TOptions>,
  InferStrict<TOptions>,
  InferShouldThrow<TOptions>,
  InferSelected<TOptions>
>
  ? TOptions
  : UseParamsOptions<
      TRouter,
      InferFrom<TOptions>,
      InferStrict<TOptions>,
      InferShouldThrow<TOptions>,
      InferSelected<TOptions>
    >
