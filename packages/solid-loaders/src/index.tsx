import {
  Loader,
  LoaderClient,
  LoaderClientOptions,
  LoaderClientStore,
  LoaderInstance,
  LoaderInstanceByKey,
  LoaderStore,
  RegisteredLoaders,
  StrictLoaderInstance,
  VariablesOptions,
} from '@tanstack/loaders'
import * as Solid from 'solid-js'
import * as SolidStore from 'solid-js/store'
import invariant from 'tiny-invariant'

import { useStore } from '@tanstack/solid-store'

export * from '@tanstack/loaders'

//

export type NoInfer<T> = [T][T extends any ? 0 : never]

const loaderClientContext = Solid.createContext<LoaderClient<any>>(null as any)

export function LoaderClientProvider(
  props: {
    loaderClient: LoaderClient<any>
    children: any
  } & Pick<LoaderClientOptions<any>, 'defaultGcMaxAge' | 'defaultMaxAge'>,
) {
  const [coreProps, optionProps] = Solid.splitProps(props, [
    'loaderClient',
    'children',
  ])

  const [loaderClient, setLoaderClient] = SolidStore.createStore(
    coreProps.loaderClient,
  )

  Solid.createEffect(
    Solid.on(
      () => [coreProps.loaderClient.options, optionProps],
      ([loaderOptions, optionProps]) => {
        setLoaderClient('options', (o) => ({
          ...o,
          ...loaderOptions,
          ...optionProps,
        }))
      },
    ),
  )

  return (
    <loaderClientContext.Provider value={loaderClient}>
      {coreProps.children}
    </loaderClientContext.Provider>
  )
}

type StrictLoaderInstance_<TLoaderInstance> =
  TLoaderInstance extends LoaderInstance<
    infer TKey,
    infer TVariables,
    infer TData,
    infer TError
  >
    ? StrictLoaderInstance<TKey, TVariables, TData, TError>
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
  ? TResolvedLoaderInstance
  : StrictLoaderInstance_<TResolvedLoaderInstance> {
  const allOpts = opts as any
  // opts as typeof opts & {
  //   key?: TKey
  //   loader?: Loader<any, any, any, any>
  // }
  const loaderClient = Solid.useContext(loaderClientContext)!

  invariant(
    loaderClient || allOpts.loader,
    'useLoaderInstance must be used inside a <LoaderClientProvider> component!',
  )

  const loader = allOpts.loader ?? loaderClient.getLoader({ key: allOpts.key })
  const loaderInstance = loader.getInstance({
    variables: allOpts?.variables,
  } as any)

  if (
    loaderInstance.state.status === 'error' &&
    (allOpts.throwOnError ?? true)
  ) {
    throw loaderInstance.state.error
  }

  if (allOpts?.strict ?? true) {
    invariant(
      typeof loaderInstance.state.data !== undefined,
      `useLoaderInstance:
  Loader instance { key: ${loader.key}, variables: ${allOpts.variables} }) is currently in a "${loaderInstance.state.status}" state. By default useLoaderInstance will throw an error if the loader instance is not in a "success" state. To avoid this error:
  
  - Load the loader instance before using it (e.g. via your router's onLoad or loader option)

  - Set opts.strict to false and handle the loading state in your component`,
    )
  }

  Solid.createEffect(() => {
    loaderInstance.load()
  })

  useStore(loaderInstance.store, (d) => allOpts?.track?.(d as any) ?? d, true)

  return loaderInstance
}

export function useLoaderClient(opts?: {
  track?: (loaderClientStore: LoaderClientStore) => any
}): LoaderClient<RegisteredLoaders> {
  const loaderClient = Solid.useContext(loaderClientContext)!

  if (!loaderClient)
    invariant(
      'useLoaderClient must be used inside a <LoaderClientProvider> component!',
    )

  useStore(loaderClient.store, (d) => opts?.track?.(d as any) ?? d, true)

  return loaderClient
}
