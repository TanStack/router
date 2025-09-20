import type { AnySerializationAdapter, SSROption } from '@tanstack/router-core'
import type {
  AnyUnsafeFunctionMiddleware,
  AnyUnsafeRequestMiddleware,
} from './createUnsafeMiddleware'

export interface StartConfigOptions<
  in out TSerializationAdapters,
  in out TDefaultSsr,
  in out TRequestMiddlewares,
  in out TFunctionMiddlewares,
> {
  serializationAdapters?: TSerializationAdapters
  defaultSsr?: TDefaultSsr
  requestMiddleware?: TRequestMiddlewares
  functionMiddleware?: TFunctionMiddlewares
}

export interface StartConfig<
  in out TSerializationAdapters,
  in out TDefaultSsr,
  in out TRequestMiddlewares,
  in out TFunctionMiddlewares,
> extends StartConfigOptions<
    TSerializationAdapters,
    TDefaultSsr,
    TRequestMiddlewares,
    TFunctionMiddlewares
  > {
  '~types': StartConfigTypes<
    TSerializationAdapters,
    TDefaultSsr,
    TRequestMiddlewares,
    TFunctionMiddlewares
  >
}

export interface StartConfigTypes<
  in out TSerializationAdapters,
  in out TDefaultSsr,
  in out TRequestMiddlewares,
  in out TFunctionMiddlewares,
> {
  serializationAdapters: TSerializationAdapters
  defaultSsr: TDefaultSsr
  requestMiddleware: TRequestMiddlewares
  functionMiddleware: TFunctionMiddlewares
}

export const createStart = <
  const TSerializationAdapters extends
    ReadonlyArray<AnySerializationAdapter> = [],
  TDefaultSsr extends SSROption = SSROption,
  const TRequestMiddlewares extends
    ReadonlyArray<AnyUnsafeRequestMiddleware> = [],
  const TFunctionMiddlewares extends
    ReadonlyArray<AnyUnsafeFunctionMiddleware> = [],
>(
  options: StartConfigOptions<
    TSerializationAdapters,
    TDefaultSsr,
    TRequestMiddlewares,
    TFunctionMiddlewares
  >,
): StartConfig<
  TSerializationAdapters,
  TDefaultSsr,
  TRequestMiddlewares,
  TFunctionMiddlewares
> => {
  return {
    serializationAdapters: options.serializationAdapters,
    defaultSsr: options.defaultSsr,
  } as StartConfig<
    TSerializationAdapters,
    TDefaultSsr,
    TRequestMiddlewares,
    TFunctionMiddlewares
  >
}

export type AnyStartConfig = StartConfig<any, any, any, any>
export type AnyStartConfigOptions = StartConfigOptions<any, any, any, any>
declare module '@tanstack/router-core' {
  interface DefaultRegister {
    configKey: 'start'
    server: {
      requestContext?: undefined
    }
  }
}
