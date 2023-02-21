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

declare module '@tanstack/loaders' {
  interface Loader<
    TKey extends string = string,
    TVariables = unknown,
    TData = unknown,
    TError = Error,
  > {
    useLoader: UseLoaderFn<TKey, TVariables, TData, TError>
  }

  interface LoaderInstance<
    TKey extends string = string,
    TVariables = unknown,
    TData = unknown,
    TError = Error,
  > {
    useInstance: <TStrict>(opts?: {
      strict?: TStrict
      track?: (loaderStore: LoaderStore<TData, TError>) => any
      throwOnError?: boolean
    }) => UseLoaderReturn<TKey, TVariables, TData, TError, TStrict>
  }
}

type UseLoaderFn<TKey extends string, TVariables, TData, TError> =
  | unknown
  | undefined extends TVariables
  ? <TStrict>(
      opts?: UseLoaderOpts<TVariables, TData, TError, TStrict>,
    ) => UseLoaderReturn<TKey, TVariables, TData, TError, TStrict>
  : <TStrict>(
      opts: UseLoaderOpts<TVariables, TData, TError, TStrict>,
    ) => UseLoaderReturn<TKey, TVariables, TData, TError, TStrict>

type UseLoaderOpts<TVariables, TData, TError, TStrict> = {
  strict?: TStrict
  track?: (loaderStore: LoaderStore<TData, TError>) => any
  throwOnError?: boolean
} & VariablesOptions<TVariables>

type UseLoaderReturn<
  TKey extends string,
  TVariables,
  TData,
  TError,
  TStrict,
> = TStrict extends false
  ? NullableLoaderInstance_<LoaderInstance<TKey, TVariables, TData, TError>>
  : LoaderInstance<TKey, TVariables, TData, TError>

Loader.onCreateFns.push((loader) => {
  loader.useLoader = (opts: any) => {
    const loaderInstance = loader.getInstance({
      variables: opts?.variables,
    })

    return loaderInstance.useInstance(opts)
  }
})

LoaderInstance.onCreateFns.push((loaderInstance) => {
  loaderInstance.useInstance = (opts: any) => {
    if (
      loaderInstance.state.status === 'error' &&
      (opts.throwOnError ?? true)
    ) {
      throw loaderInstance.state.error
    }

    if (opts?.strict ?? true) {
      invariant(
        typeof loaderInstance.state.data !== 'undefined',
        `useLoader:
  Loader instance { key: ${loaderInstance.loader.key}, variables: ${loaderInstance.variables} }) is currently in a "${loaderInstance.state.status}" state. By default useLoader will throw an error if the loader instance is not in a "success" state. To avoid this error:
  
  - Load the loader instance before using it (e.g. via your router's loader or loader option)

  - Set opts.strict to false and handle the loading state in your component`,
      )
    }

    React.useEffect(() => {
      loaderInstance.load()
    }, [loaderInstance])

    useStore(loaderInstance.__store, (d) => opts?.track?.(d as any) ?? d)

    return loaderInstance as any
  }
})

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

export function useLoader<
  TKey extends keyof RegisteredLoaders,
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
  const loaderClient = React.useContext(loaderClientContext)

  const optsKey = (opts as { key: string }).key
  const optsLoader = (opts as { loader: any }).loader

  invariant(
    loaderClient || optsLoader,
    'useLoader must be used inside a <LoaderClientProvider> component!',
  )

  const loader = optsLoader ?? loaderClient.loaders[optsKey]
  return loader.useLoader(opts)
}

export function useLoaderClient(opts?: {
  track?: (loaderClientStore: LoaderClientStore) => any
}): LoaderClient<RegisteredLoaders> {
  const loaderClient = React.useContext(loaderClientContext)

  if (!loaderClient)
    invariant(
      'useLoaderClient must be used inside a <LoaderClientProvider> component!',
    )

  useStore(loaderClient.__store, (d) => opts?.track?.(d as any) ?? d)

  return loaderClient
}
