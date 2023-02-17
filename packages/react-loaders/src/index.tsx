import * as React from 'react'
import invariant from 'tiny-invariant'
import {
  LoaderClient,
  RegisteredLoaders,
  LoaderInstanceByKey,
  LoaderStore,
  LoaderClientStore,
  LoaderClientOptions,
  VariablesOptions,
  Loader,
  LoaderInstance,
  NullableLoaderInstance,
} from '@tanstack/loaders'

import { useStore } from '@tanstack/react-store'

export * from '@tanstack/loaders'

//

export type NoInfer<T> = [T][T extends any ? 0 : never]

const loaderClientContext = React.createContext<LoaderClient<any>>(null as any)

export function LoaderClientProvider({
  loaderClient,
  children,
  ...rest
}: {
  loaderClient: LoaderClient<any>
  children: any
} & Pick<LoaderClientOptions<any>, 'defaultGcMaxAge' | 'defaultMaxAge'>) {
  loaderClient.options = {
    ...loaderClient.options,
    ...rest,
  }

  return (
    <loaderClientContext.Provider value={loaderClient}>
      {children}
    </loaderClientContext.Provider>
  )
}

type NullableLoaderInstance_<TLoaderInstance> =
  TLoaderInstance extends LoaderInstance<
    infer TKey,
    infer TVariables,
    infer TData,
    infer TError
  >
    ? NullableLoaderInstance<TKey, TVariables, TData, TError>
    : never

export function useLoaderInstance<
  TKey extends RegisteredLoaders[number]['__types']['key'],
  TLoader,
  TStrict,
  TLoaderInstanceFromKey extends LoaderInstanceByKey<RegisteredLoaders, TKey>,
  TResolvedLoaderInstance extends unknown extends TLoader
    ? TLoaderInstanceFromKey
    : TLoader extends Loader<
        infer TTKey,
        infer TTVariables,
        infer TTData,
        infer TTError
      >
    ? LoaderInstance<TTKey, TTVariables, TTData, TTError>
    : never,
  TVariables extends TResolvedLoaderInstance['__types']['variables'],
  TData extends TResolvedLoaderInstance['__types']['data'],
  TError extends TResolvedLoaderInstance['__types']['error'],
>(
  opts: (
    | {
        key: TKey
      }
    | {
        loader: TLoader
      }
  ) & {
    strict?: TStrict
    track?: (loaderStore: LoaderStore<TData, TError>) => any
    throwOnError?: boolean
  } & VariablesOptions<TVariables>,
): TStrict extends false
  ? NullableLoaderInstance_<TResolvedLoaderInstance>
  : TResolvedLoaderInstance {
  // opts as typeof opts & {
  //   key?: TKey
  //   loader?: Loader<any, any, any, any>
  // }

  const loaderClient = React.useContext(loaderClientContext)

  const optsKey = (opts as { key: string }).key
  const optsLoader = (opts as { loader: any }).loader

  invariant(
    loaderClient || optsLoader,
    'useLoaderInstance must be used inside a <LoaderClientProvider> component!',
  )

  const loader = optsLoader ?? loaderClient.loaders[optsKey]
  const loaderInstance = loader.getInstance({
    variables: opts?.variables,
  })

  if (loaderInstance.state.status === 'error' && (opts.throwOnError ?? true)) {
    throw loaderInstance.state.error
  }

  if (opts?.strict ?? true) {
    invariant(
      typeof loaderInstance.state.data !== 'undefined',
      `useLoaderInstance:
  Loader instance { key: ${loader.key}, variables: ${opts.variables} }) is currently in a "${loaderInstance.state.status}" state. By default useLoaderInstance will throw an error if the loader instance is not in a "success" state. To avoid this error:
  
  - Load the loader instance before using it (e.g. via your router's onLoad or loader option)

  - Set opts.strict to false and handle the loading state in your component`,
    )
  }

  React.useEffect(() => {
    loaderInstance.load()
  }, [loaderInstance])

  useStore(loaderInstance.__store, (d) => opts?.track?.(d as any) ?? d, true)

  return loaderInstance as any
}

export function useLoaderClient(opts?: {
  track?: (loaderClientStore: LoaderClientStore) => any
}): LoaderClient<RegisteredLoaders> {
  const loaderClient = React.useContext(loaderClientContext)

  if (!loaderClient)
    invariant(
      'useLoaderClient must be used inside a <LoaderClientProvider> component!',
    )

  useStore(loaderClient.__store, (d) => opts?.track?.(d as any) ?? d, true)

  return loaderClient
}
