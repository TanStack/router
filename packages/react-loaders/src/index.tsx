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
} from '@tanstack/loaders'

import { useStore } from '@tanstack/react-store'

export * from '@tanstack/loaders'

//

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

export function useLoaderInstance<
  TKey extends RegisteredLoaders[number]['__types']['key'],
  TLoader,
  TLoaderInstanceFromKey extends LoaderInstanceByKey<RegisteredLoaders, TKey>,
  TResolvedLoaderInstance extends unknown extends TLoader
    ? TLoaderInstanceFromKey
    : TLoader extends Loader<
        infer _,
        infer TVariables,
        infer TData,
        infer TError
      >
    ? LoaderInstance<TKey, TVariables, TData, TError>
    : never,
  TVariables extends TResolvedLoaderInstance['__types']['variables'],
  TData extends TResolvedLoaderInstance['__types']['data'],
  TError extends TResolvedLoaderInstance['__types']['error'],
>(
  opts: (
    | { key: TKey }
    | {
        loader: TLoader
      }
  ) & {
    track?: (loaderStore: LoaderStore<TData, TError>) => any
  } & VariablesOptions<TVariables>,
): TResolvedLoaderInstance {
  const allOpts = opts as typeof opts & {
    key?: TKey
    loader?: Loader<any, any, any, any>
  }
  const loaderClient = React.useContext(loaderClientContext)

  invariant(
    loaderClient || allOpts.loader,
    'useLoaderInstance must be used inside a <LoaderClientProvider> component!',
  )

  const loader = allOpts.loader ?? loaderClient.getLoader({ key: allOpts.key })
  const loaderInstance = loader.getInstance({
    variables: allOpts?.variables,
  } as any)

  React.useEffect(() => {
    loaderInstance.load()
  }, [loaderInstance])

  useStore(loaderInstance.store, (d) => allOpts?.track?.(d as any) ?? d, true)

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

  useStore(loaderClient.store, (d) => opts?.track?.(d as any) ?? d, true)

  return loaderClient
}
