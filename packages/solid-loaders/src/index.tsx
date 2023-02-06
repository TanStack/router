import {
  Loader,
  LoaderClient,
  LoaderClientOptions,
  LoaderClientStore,
  LoaderInstance,
  LoaderInstanceByKey,
  LoaderStore,
  NullableLoaderInstance,
  RegisteredLoaders,
  VariablesOptions,
} from '@tanstack/loaders'
import {
  createContext,
  createEffect,
  createRenderEffect,
  on,
  splitProps,
  useContext,
} from 'solid-js'
import { createStore } from 'solid-js/store'
import invariant from 'tiny-invariant'

import { useStore } from '@tanstack/solid-store'

export * from '@tanstack/loaders'

//

export type NoInfer<T> = [T][T extends any ? 0 : never]

const loaderClientContext = createContext<LoaderClient<any>>(null as any)

export function LoaderClientProvider(
  props: {
    loaderClient: LoaderClient<any>
    children: any
  } & Pick<LoaderClientOptions<any>, 'defaultGcMaxAge' | 'defaultMaxAge'>,
) {
  const [coreProps, optionProps] = splitProps(props, [
    'loaderClient',
    'children',
  ])

  const [loaderClient, setLoaderClient] = createStore(coreProps.loaderClient)

  createEffect(
    on(
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
  const allOpts = opts as any

  // opts as typeof opts & {
  //   key?: TKey
  //   loader?: Loader<any, any, any, any>
  // }

  const loaderClient = useContext(loaderClientContext)!

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

  const state = useStore(loaderInstance.store)

  const loaderInstanceCopy = { ...loaderInstance }

  createRenderEffect(() => {
    Object.assign(loaderInstanceCopy, loaderInstance, { state })
  })

  return loaderInstanceCopy as any
}

export function useLoaderClient(opts?: {
  track?: (loaderClientStore: LoaderClientStore) => any
}): LoaderClient<RegisteredLoaders> {
  const loaderClient = useContext(loaderClientContext)!

  if (!loaderClient)
    invariant(
      'useLoaderClient must be used inside a <LoaderClientProvider> component!',
    )

  const state = useStore(loaderClient.store)

  const loaderClientCopy = { ...loaderClient }

  createRenderEffect(() => {
    Object.assign(loaderClientCopy, loaderClient, { state })
  })

  return loaderClientCopy as any
}
