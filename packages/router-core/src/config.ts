import type { SSROption } from './router'
import type { DefaultDehydrateConfig } from './lifecycle'
import type { AnySerializationAdapter } from './ssr/serializer/transformer'

export interface RouterConfigOptions<
  in out TSerializationAdapters,
  in out TDefaultSsr,
  in out TDefaultDehydrate,
> {
  serializationAdapters?: TSerializationAdapters
  defaultSsr?: TDefaultSsr
  defaultDehydrate?: TDefaultDehydrate
}

export interface RouterConfig<
  in out TSerializationAdapters,
  in out TDefaultSsr,
  in out TDefaultDehydrate,
> {
  '~types': RouterConfigTypes<
    TSerializationAdapters,
    TDefaultSsr,
    TDefaultDehydrate
  >
  serializationAdapters: TSerializationAdapters
  defaultSsr: TDefaultSsr | undefined
  defaultDehydrate: TDefaultDehydrate | undefined
}

export interface RouterConfigTypes<
  in out TSerializationAdapters,
  in out TDefaultSsr,
  in out TDefaultDehydrate,
> {
  serializationAdapters: TSerializationAdapters
  defaultSsr: TDefaultSsr
  defaultDehydrate: TDefaultDehydrate
}

export const createRouterConfig = <
  const TSerializationAdapters extends ReadonlyArray<AnySerializationAdapter> =
    [],
  TDefaultSsr extends SSROption = SSROption,
  TDefaultDehydrate extends DefaultDehydrateConfig = DefaultDehydrateConfig,
>(
  options: RouterConfigOptions<
    TSerializationAdapters,
    TDefaultSsr,
    TDefaultDehydrate
  >,
): RouterConfig<TSerializationAdapters, TDefaultSsr, TDefaultDehydrate> => {
  return {
    serializationAdapters: options.serializationAdapters,
    defaultSsr: options.defaultSsr,
    defaultDehydrate: options.defaultDehydrate,
  } as RouterConfig<TSerializationAdapters, TDefaultSsr, TDefaultDehydrate>
}

export type AnyRouterConfig = RouterConfig<any, any, any>
