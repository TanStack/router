import * as React from 'react'
import invariant from 'tiny-invariant'
import {
  LoaderClient,
  RegisteredLoaders,
  LoaderInstanceByKey,
  LoaderStore,
  VariablesOptions,
} from '@tanstack/loaders'

import { useStore } from '@tanstack/react-store'

export * from '@tanstack/loaders'

const loaderClientContext = React.createContext<LoaderClient<any>>(null as any)

export function LoaderClientProvider(props: {
  loaderClient: LoaderClient<any>
  children: any
}) {
  return (
    <loaderClientContext.Provider value={props.loaderClient}>
      {props.children}
    </loaderClientContext.Provider>
  )
}

export function useLoader<
  TKey extends RegisteredLoaders[number]['__types']['key'],
  TLoaderInstance extends LoaderInstanceByKey<RegisteredLoaders, TKey>,
  TVariables extends TLoaderInstance['__types']['variables'],
  TData extends TLoaderInstance['__types']['data'],
  TError extends TLoaderInstance['__types']['error'],
>(
  opts: {
    key: TKey
    track?: (loaderStore: LoaderStore<TData, TError>) => any
  } & VariablesOptions<TVariables>,
): [TLoaderInstance['store']['state'], TLoaderInstance] {
  const loaderClient = React.useContext(loaderClientContext)

  if (!loaderClient)
    invariant(
      'useLoader must be used inside a <LoaderClientProvider> component!',
    )

  const loaderApi = loaderClient.getLoader({ key: opts.key })
  const loaderInstance = loaderApi.getLoader({
    variables: opts?.variables,
  } as any)

  React.useEffect(() => {
    loaderInstance.load()
  }, [loaderInstance])

  useStore(loaderInstance.store, (d) => opts?.track?.(d as any) ?? d, true)

  return [loaderInstance.store.state, loaderInstance as any]
}
