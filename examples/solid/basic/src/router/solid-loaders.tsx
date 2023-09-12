import {
  AnyLoader,
  GetInstanceOptions,
  HydrateUpdater,
  LoaderByKey,
  LoaderClient,
  LoaderClientOptions,
  LoaderInstance,
  LoaderInstanceByKey,
  LoadersToRecord,
  NullableLoaderInstance,
  RegisteredLoaders,
  createLoaderInstance,
  hashKey,
} from '@tanstack/loaders'
import {
  createContext,
  createEffect,
  createMemo,
  on,
  onCleanup,
  onMount,
  splitProps,
  useContext,
} from 'solid-js'
import invariant from 'tiny-invariant'
import { useStore } from './store'

export * from '@tanstack/loaders'

//

export type NoInfer<T> = [T][T extends any ? 0 : never]

const loadersContext = createContext<{
  client: LoaderClient<any>
  // state: LoaderClientState<any>
}>(null as any)

export function LoaderClientProvider(
  props: {
    client: LoaderClient<any>
    children: any
  } & Omit<LoaderClientOptions<any>, 'loaders'>,
) {
  const [coreProps, optionProps] = splitProps(props, ['client', 'children'])

  createEffect(
    on(
      () => coreProps.client,
      (client) => client.mount(),
    ),
  )

  return (
    <loadersContext.Provider
      value={{
        // @ts-ignore
        client: {
          ...coreProps.client,
          options: {
            ...coreProps.client.options,
            ...optionProps,
          },
        },
      }}
    >
      {coreProps.children}
    </loadersContext.Provider>
  )
}

type NullableLoaderInstance_<TLoaderInstance> =
  TLoaderInstance extends LoaderInstance<
    infer TVariables,
    infer TData,
    infer TError
  >
    ? NullableLoaderInstance<TVariables, TData, TError>
    : never

export function useLoaderInstance<
  TLoader_ extends AnyLoader = RegisteredLoaders,
  TLoaders extends LoadersToRecord<TLoader_> = LoadersToRecord<TLoader_>,
  TKey extends keyof TLoaders = keyof TLoaders,
  TLoader extends LoaderByKey<TLoaders, TKey> = LoaderByKey<TLoaders, TKey>,
  TLoaderInstance extends LoaderInstanceByKey<
    TLoaders,
    TKey
  > = LoaderInstanceByKey<TLoaders, TKey>,
  TVariables extends TLoaderInstance['variables'] = TLoaderInstance['variables'],
  TData extends TLoaderInstance['data'] = TLoaderInstance['data'],
  TError extends TLoaderInstance['error'] = TLoaderInstance['error'],
  TStrict extends unknown = true,
  TSelected = TStrict extends false
    ? NullableLoaderInstance_<TLoaderInstance>
    : TLoaderInstance,
>(
  opts: GetInstanceOptions<TKey, TLoader> & {
    strict?: TStrict
    throwOnError?: boolean
    hydrate?: HydrateUpdater<TVariables, TData, TError>
    select?: (
      loaderStore: TStrict extends false
        ? NullableLoaderInstance_<TLoaderInstance>
        : TLoaderInstance,
    ) => TSelected
  },
): TSelected {
  const ctx = useContext(loadersContext)

  invariant(
    ctx,
    `useLoaderInstance must be used inside a <LoaderClientProvider> component or be provided one via the 'client' option!`,
  )

  const hashedKey = () => hashKey([opts.key, opts.variables])

  onMount(() => {
    ctx.client.subscribeToInstance(opts, () => {})
    ctx.client.__hydrateLoaderInstance(opts as any)

    onCleanup(() => {
      ctx.client.__dehydrateLoaderInstance(opts as any)
    })
  })

  const defaultInstance = createMemo(() =>
    createLoaderInstance({
      ...(opts as any),
      hashedKey,
    }),
  )

  const store = useStore(ctx.client.__store, (_state) => {
    return pick(
      (ctx.client.state.loaders[opts.key].instances[hashedKey()] ||
        defaultInstance())!,
      ['status', 'error', 'loadPromise'],
    )
  })

  const selected = useStore(ctx.client.__store, (_state) => {
    const instance =
      ctx.client.state.loaders[opts.key].instances[hashedKey()] ||
      defaultInstance()
    return opts.select?.(instance as any) ?? instance
  })

  createEffect(
    on(
      () => store.status,
      (status) => {
        if (store.status === 'error' && (opts?.throwOnError ?? true)) {
          throw store.error
        }

        if (opts?.strict ?? true) {
          if (store.status === 'pending') {
            // throw new Error('this should never happen')
            throw store.loadPromise
          }
        }

        if (status === 'idle') {
          throw ctx.client.load(opts)
        }
      },
    ),
  )

  createEffect(
    on(
      () => ctx.client,
      (client) => {
        client.load(opts)
      },
    ),
  )

  return selected as any
}

export function useLoaderClient(opts?: {
  // track?: (loaderClientStore: LoaderClientStore) => any
}): LoaderClient<RegisteredLoaders> {
  const ctx = useContext(loadersContext)!

  if (!ctx)
    invariant(
      'useLoaderClient must be used inside a <LoaderClientProvider> component!',
    )

  // useStore(ctx.__store, (d) => opts?.track?.(d as any) ?? d)

  return ctx.client
}

export function pick<T, K extends keyof T>(parent: T, keys: K[]): Pick<T, K> {
  return keys.reduce((obj: any, key: K) => {
    obj[key] = parent[key]
    return obj
  }, {} as any)
}
