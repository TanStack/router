import type { SSROption } from './router'
import type { DefaultSerializeConfig } from './lifecycle'
import type { AnySerializationAdapter } from './ssr/serializer/transformer'

export interface RouterConfigOptions<
  in out TSerializationAdapters,
  in out TDefaultSsr,
  in out TDefaultSerialize,
> {
  serializationAdapters?: TSerializationAdapters
  defaultSsr?: TDefaultSsr
  defaultSerialize?: TDefaultSerialize
}

export interface RouterConfig<
  in out TSerializationAdapters,
  in out TDefaultSsr,
  in out TDefaultSerialize,
> {
  '~types': RouterConfigTypes<
    TSerializationAdapters,
    TDefaultSsr,
    TDefaultSerialize
  >
  serializationAdapters: TSerializationAdapters
  defaultSsr: TDefaultSsr | undefined
  defaultSerialize: TDefaultSerialize | undefined
}

export interface RouterConfigTypes<
  in out TSerializationAdapters,
  in out TDefaultSsr,
  in out TDefaultSerialize,
> {
  serializationAdapters: TSerializationAdapters
  defaultSsr: TDefaultSsr
  defaultSerialize: TDefaultSerialize
}

export const createRouterConfig = <
  const TSerializationAdapters extends ReadonlyArray<AnySerializationAdapter> =
    [],
  TDefaultSsr extends SSROption = SSROption,
  TDefaultSerialize extends DefaultSerializeConfig = DefaultSerializeConfig,
>(
  options: RouterConfigOptions<
    TSerializationAdapters,
    TDefaultSsr,
    TDefaultSerialize
  >,
): RouterConfig<TSerializationAdapters, TDefaultSsr, TDefaultSerialize> => {
  return {
    serializationAdapters: options.serializationAdapters,
    defaultSsr: options.defaultSsr,
    defaultSerialize: options.defaultSerialize,
  } as RouterConfig<TSerializationAdapters, TDefaultSsr, TDefaultSerialize>
}

export type AnyRouterConfig = RouterConfig<any, any, any>
