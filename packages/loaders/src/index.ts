import { Store } from '@tanstack/store'
import invariant from 'tiny-invariant'
import { isPlainObject, replaceEqualDeep } from './utils'

export interface Register {
  // loaderClient: LoaderClient
}

export type RegisteredLoaderClient = Register extends {
  loaderClient: LoaderClient<infer TLoader>
}
  ? LoaderClient<TLoader>
  : LoaderClient

export type RegisteredLoaders = Register extends {
  loaderClient: LoaderClient<infer TLoaders>
}
  ? TLoaders
  : Loader

export type RegisteredLoadersByKey = Register extends {
  loaderClient: LoaderClient<infer TLoaders>
}
  ? LoadersToRecord<TLoaders>
  : Loader

export interface LoaderClientOptions<TLoader extends AnyLoader> {
  loaders: TLoader[]
  defaultMaxAge?: number
  defaultPreloadMaxAge?: number
  defaultGcMaxAge?: number
  defaultRefetchOnWindowFocus?: boolean
  hydrateLoaderInstanceFn?: (loader: LoaderInstance) => void
  dehydrateLoaderInstanceFn?: (loader: LoaderInstance) => void
}

export type LoaderClientStore<TLoaders> = Store<LoaderClientState<TLoaders>>

export type LoaderClientState<TLoaders> = {
  isLoading: boolean
  isPreloading: boolean
  loaders: Record<keyof TLoaders, LoaderState>
}

export type LoaderState = {
  instances: Record<string, LoaderInstance>
}

export type LoaderInstanceMeta = {
  store: Store<void>
  subscriptionCount: number
}

export interface DehydratedLoaderClient {
  loaders: Record<
    string,
    Record<
      string,
      {
        hashedKey: string
        variables: any
        state: any
      }
    >
  >
}

export type LoadersToRecord<U extends AnyLoader> = {
  [E in U as E['options']['key']]: E
}

// A loader client that tracks instances of loaders by unique key like react query
export class LoaderClient<
  _TLoader extends AnyLoader = Loader,
  TLoaders extends Record<string, AnyLoader> = LoadersToRecord<_TLoader>,
> {
  options: LoaderClientOptions<_TLoader>
  loaders: TLoaders
  loaderInstanceMeta: Record<string, LoaderInstanceMeta> = {}
  loaderInstances: Record<string, LoaderInstance> = {}
  __store: LoaderClientStore<TLoaders>
  state: LoaderClientStore<TLoaders>['state']

  constructor(options: LoaderClientOptions<_TLoader>) {
    this.options = options
    this.__store = new Store(
      {
        isLoading: false,
        isPreloading: false,
        loaders: Object.values(this.options.loaders).reduce((acc, loader) => {
          return {
            ...acc,
            [loader.options.key]: {
              instances: {},
            },
          }
        }, {} as any),
      },
      {
        onUpdate: () => {
          const loaderStates = Object.values(
            this.__store.state.loaders,
          ) as LoaderState[]
          const isLoading = loaderStates.some((loaderState) => {
            return Object.values(loaderState.instances || {}).some(
              (instance) => instance.isFetching && !instance.preload,
            )
          })

          const isPreloading = loaderStates.some((loaderState) => {
            return Object.values(loaderState.instances || {}).some(
              (instance) => instance.isFetching && instance.preload,
            )
          })

          this.__store.state.isLoading = isLoading
          this.__store.state.isPreloading = isPreloading
          this.state = this.__store.state
        },
      },
    ) as LoaderClientStore<TLoaders>

    this.state = this.__store.state
    this.loaders = {} as any
    this.loaderInstanceMeta = {} as any

    Object.entries(this.options.loaders).forEach(
      ([key, loader]: [string, Loader]) => {
        ;(this.loaders as any)[loader.options.key] = loader
      },
    )
  }

  mount = () => {
    const visibilityChangeEvent = 'visibilitychange'
    const focusEvent = 'focus'

    // addEventListener does not exist in React Native, but window does
    // In the future, we might need to invert control here for more adapters
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener(
        visibilityChangeEvent,
        this.#refetchAllFromFocus,
        false,
      )
      window.addEventListener(focusEvent, this.#refetchAllFromFocus, false)
    }

    return () => {
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener(
          visibilityChangeEvent,
          this.#refetchAllFromFocus,
        )
        window.removeEventListener(focusEvent, this.#refetchAllFromFocus)
      }
    }
  }

  #refetchAllFromFocus = () => {
    return this.invalidateAll({ isFocusReload: true })
  }

  invalidateAll = (opts: { isFocusReload?: boolean } = {}) => {
    return Promise.all(
      (Object.values(this.state.loaders) as LoaderState[]).map((loader) => {
        return Promise.all(
          Object.values(loader.instances).map((instance) => {
            return this.loadIfActive({
              ...(instance as any),
              ...opts,
            })
          }),
        )
      }),
    )
  }

  dehydrate = (): Record<keyof TLoaders, LoaderState> => {
    return this.state.loaders
  }

  hydrate = (data: Record<keyof TLoaders, LoaderState>) => {
    this.__store.setState((s) => ({
      ...s,
      loaders: data,
    }))
  }

  subscribeToInstance = <
    TKey extends keyof TLoaders,
    TResolvedLoader extends AnyLoader = TLoaders[TKey],
  >(
    opts: GetInstanceOptions<TKey, TResolvedLoader>,
    callback: () => void,
  ) => {
    const { key, variables } = opts
    const hashedKey = hashKey([key, variables])

    let meta = this.loaderInstanceMeta[hashedKey]

    if (!meta) {
      meta = {
        subscriptionCount: 0,
        store: new Store<void>(undefined, {
          onSubscribe: () => {
            if (!meta!.subscriptionCount) {
              this.#stopInstanceGc(opts)
            }
            meta!.subscriptionCount++
            return () => {
              meta!.subscriptionCount--
              if (!meta!.subscriptionCount) {
                this.#startInstanceGc(opts)
              }
            }
          },
        }),
      }
      this.loaderInstanceMeta[hashedKey] = meta
    }

    const unsub = meta?.store.subscribe(callback)

    if (meta.store.listeners.size) {
      this.#stopInstanceGc(opts)
    } else {
      this.#startInstanceGc(opts)
    }

    return unsub
  }

  setInstance = <
    TKey extends keyof TLoaders,
    TResolvedLoader extends AnyLoader = TLoaders[TKey],
  >(
    opts: GetInstanceOptions<TKey, TResolvedLoader>,
    updater: (
      prev: LoaderInstance<
        TResolvedLoader['types']['data'],
        TResolvedLoader['types']['error']
      >,
    ) => LoaderInstance<
      TResolvedLoader['types']['data'],
      TResolvedLoader['types']['error']
    >,
  ) => {
    const { key, variables } = opts
    const hashedKey = hashKey([key, variables])

    this.__store.setState((s) => ({
      ...s,
      loaders: {
        ...s.loaders,
        [key]: {
          ...s.loaders[key],
          instances: {
            ...s.loaders[key].instances,
            [hashedKey]: updater(
              s.loaders[key].instances[hashedKey]! ||
                createLoaderInstance({ ...opts, hashedKey } as any),
            ),
          },
        },
      },
    }))
  }

  getInstance = <
    TKey extends keyof TLoaders,
    TResolvedLoader extends AnyLoader = TLoaders[TKey],
  >(
    opts: GetInstanceOptions<TKey, TResolvedLoader>,
  ) => {
    const { key, variables } = opts
    const hashedKey = hashKey([key, variables])

    let instance = this.state.loaders[key]?.instances[hashedKey]

    if (!instance) {
      instance = createLoaderInstance({
        key,
        hashedKey,
        variables: opts.variables as any,
      })

      setTimeout(() => {
        this.setInstance(opts, () => instance!)
      })
    }

    return instance
  }

  #getLoader = <TKey extends keyof TLoaders>(key: TKey): TLoaders[TKey] => {
    const loader = this.loaders[key]
    invariant(loader, `No loader found for key "${key as string}"`)
    return loader
  }

  #startInstanceGc = <
    TKey extends keyof TLoaders,
    TResolvedLoader = TLoaders[TKey],
  >(
    opts: GetInstanceOptions<TKey, TResolvedLoader>,
  ) => {
    const loader = this.#getLoader(opts.key)

    const gcTimeout = setTimeout(() => {
      this.setInstance(opts, (s) => {
        return {
          ...s,
          gcTimeout: undefined,
        }
      })
      this.#gc(opts)
    }, loader.options.gcMaxAge ?? this?.options.defaultGcMaxAge ?? 5 * 60 * 1000)

    this.setInstance(opts, (s) => {
      return {
        ...s,
        gcTimeout,
      }
    })
  }

  #stopInstanceGc = <
    TKey extends keyof TLoaders,
    TResolvedLoader = TLoaders[TKey],
  >(
    opts: GetInstanceOptions<TKey, TResolvedLoader>,
  ) => {
    const instance = this.getInstance(opts)

    if (instance.gcTimeout) {
      clearTimeout(instance.gcTimeout)
      this.setInstance(opts, (s) => {
        return {
          ...s,
          gcTimeout: undefined,
        }
      })
    }
  }

  #gc = <TKey extends keyof TLoaders, TResolvedLoader = TLoaders[TKey]>(
    opts: GetInstanceOptions<TKey, TResolvedLoader>,
  ) => {
    this.clearInstance(opts)
  }

  clearInstance = <
    TKey extends keyof TLoaders,
    TResolvedLoader = TLoaders[TKey],
  >(
    opts: GetInstanceOptions<TKey, TResolvedLoader>,
  ) => {
    const { key, variables } = opts
    const hashedKey = hashKey([key, variables])

    this.__store.setState((s) => {
      return {
        ...s,
        loaders: {
          ...s.loaders,
          [key]: {
            instances: {
              ...s.loaders[key].instances,
              [hashedKey]: undefined,
            },
          },
        },
      }
    })
  }

  getIsInvalid = <
    TKey extends keyof TLoaders,
    TResolvedLoader extends AnyLoader = TLoaders[TKey],
  >(
    opts: GetInstanceOptions<TKey, TResolvedLoader> & {
      preload?: boolean
    },
  ) => {
    const instance = this.getInstance(opts as any)
    const now = Date.now()

    return (
      instance.status === 'success' &&
      (instance.invalid ||
        (opts?.preload ? instance.preloadInvalidAt : instance.invalidAt) < now)
    )
  }

  invalidateLoader = async <
    TKey extends keyof TLoaders,
    TResolvedLoader extends TLoaders[TKey] = TLoaders[TKey],
  >(opts: {
    key: TKey
    variables?: TResolvedLoader['types']['variables']
  }) => {
    const loader = this.#getLoader(opts.key)

    await Promise.all(
      Object.values(this.state.loaders[opts.key].instances).map((instance) =>
        this.invalidateInstance(instance as any),
      ),
    )
    await loader.options.onInvalidate?.({
      loader: this.state.loaders[opts.key],
      client: this as unknown as any,
    })
  }

  invalidateInstance = async <
    TKey extends keyof TLoaders,
    TResolvedLoader = TLoaders[TKey],
  >(
    opts: GetInstanceOptions<TKey, TResolvedLoader>,
  ) => {
    const loader = this.#getLoader(opts.key)

    this.setInstance(opts, (s) => {
      return {
        ...s,
        invalid: true,
      }
    })

    await this.loadIfActive(opts as any)
    await loader.options.onEachInvalidate?.({
      instance: this.getInstance(opts as any),
      client: this as unknown as any,
    })
  }

  loadIfActive = async <
    TKey extends keyof TLoaders,
    TResolvedLoader = TLoaders[TKey],
  >(
    opts: GetInstanceOptions<TKey, TResolvedLoader> & {
      isFocusReload?: boolean
    },
  ) => {
    const { key, variables } = opts
    const hashedKey = hashKey([key, variables])

    if (this.loaderInstanceMeta[hashedKey]?.store.listeners.size) {
      this.load(opts as any)
      try {
        await this.getInstance(opts as any).loadPromise
      } catch (err) {
        // Ignore
      }
    }
  }

  load = async <
    TKey extends keyof TLoaders,
    TResolvedLoader extends AnyLoader = TLoaders[TKey],
  >(
    opts: GetInstanceOptions<TKey, TResolvedLoader> & {
      maxAge?: number
      preload?: boolean
      isFocusReload?: boolean
      signal?: AbortSignal
    },
  ): Promise<TResolvedLoader['types']['data']> => {
    const { key } = opts
    const loader = this.#getLoader(key)

    const getInstance = () => this.getInstance(opts as any)

    if (opts?.isFocusReload) {
      if (
        !(
          loader.options.refetchOnWindowFocus ??
          this.options.defaultRefetchOnWindowFocus ??
          true
        )
      ) {
        return getInstance().data
      }
    }

    if (
      getInstance().status === 'error' ||
      getInstance().status === 'idle' ||
      this.getIsInvalid(opts as any)
    ) {
      // Start a fetch if we need to
      if (getInstance().status !== 'pending') {
        this.fetch(opts as any).catch(() => {
          // Ignore
        })
      }
    }

    // If we already have data, always return it
    if (typeof getInstance().data !== 'undefined') {
      return getInstance().data!
    }

    // Otherwise wait for the data to be fetched
    return getInstance().loadPromise
  }

  fetch = async <
    TKey extends keyof TLoaders,
    TResolvedLoader extends AnyLoader = TLoaders[TKey],
  >(
    opts: GetInstanceOptions<TKey, TResolvedLoader> & {
      maxAge?: number
      preload?: boolean
      signal?: AbortSignal
      isFocusReload?: boolean
    },
  ): Promise<TResolvedLoader['types']['data']> => {
    const loader = this.#getLoader(opts.key)
    const instance = this.getInstance(opts as any)
    const fetchedAt = Date.now()

    this.__store.batch(() => {
      // If the match was in an error state, set it
      // to a loading state again. Otherwise, keep it
      // as loading or resolved
      if (instance.status === 'idle') {
        this.setInstance(opts as any, (s) => ({
          ...s,
          status: 'pending',
          fetchedAt,
        }))
      }

      // We started loading the route, so it's no longer invalid
      this.setInstance(opts as any, (s) => ({
        ...s,
        preload: !!opts?.preload,
        invalid: false,
        isFetching: true,
      }))
    })

    const hasNewer = () => {
      const latest = this.getInstance(opts as any)
      return latest && latest.fetchedAt !== fetchedAt
        ? latest.loadPromise
        : undefined
    }

    let newer: ReturnType<typeof hasNewer>

    const loadPromise = Promise.resolve().then(async () => {
      const after = async () => {
        this.setInstance(opts as any, (s) => ({
          ...s,
          isFetching: false,
        }))

        if ((newer = hasNewer())) {
          await loader.options.onLatestSettled?.({
            instance: this.getInstance(opts as any),
            client: this as unknown as any,
          })
          return newer
        } else {
          await loader.options.onEachSettled?.({
            instance: this.getInstance(opts as any),
            client: this as unknown as any,
          })
        }

        return
      }

      try {
        const loaderFn =
          loader.options.getFn?.(this.getInstance(opts as any)) ??
          loader.options.fn!

        const data = await loaderFn(this.getInstance(opts as any).variables)

        if ((newer = hasNewer())) return newer

        this.setInstanceData(opts as any, data)

        if ((newer = hasNewer())) {
          await loader.options.onLatestSuccess?.({
            instance: this.getInstance(opts as any),
            client: this as unknown as any,
          })
          return newer
        } else {
          await loader.options.onEachSuccess?.({
            instance: this.getInstance(opts as any),
            client: this as unknown as any,
          })
        }

        this.setInstance(opts as any, (s) => ({
          ...s,
          status: 'success',
        }))

        await after()

        return this.getInstance(opts as any).data
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.error(err)
        }

        this.setInstance(opts as any, (s) => ({
          ...s,
          error: err as any,
          updatedAt: Date.now(),
        }))

        if ((newer = hasNewer())) {
          await loader.options.onLatestError?.({
            instance: this.getInstance(opts as any),
            client: this as unknown as any,
          })
          return newer
        } else {
          await loader.options.onEachError?.({
            instance: this.getInstance(opts as any),
            client: this as unknown as any,
          })
        }

        this.setInstance(opts as any, (s) => ({
          ...s,
          status: 'error',
        }))

        await after()

        throw err
      }
    })

    this.setInstance(opts as any, (s) => ({
      ...s,
      loadPromise: loadPromise as any,
      fetchedAt,
    }))

    return loadPromise
  }

  setInstanceData = <
    TKey extends keyof TLoaders,
    TResolvedLoader extends AnyLoader = TLoaders[TKey],
  >(
    opts: GetInstanceOptions<TKey, TResolvedLoader> & {
      maxAge?: number
      updatedAt?: number
    },
    updater:
      | TResolvedLoader['types']['data']
      | ((
          prev: TResolvedLoader['types']['data'] | undefined,
        ) => TResolvedLoader['types']['data']),
  ): TResolvedLoader['types']['data'] => {
    const loader = this.#getLoader(opts.key)

    const data =
      typeof updater === 'function'
        ? (updater as any)(this.getInstance(opts as any).data)
        : updater

    invariant(
      typeof data !== 'undefined',
      'The data returned from a loader cannot be undefined.',
    )

    const updatedAt = opts?.updatedAt ?? Date.now()

    const preloadInvalidAt =
      updatedAt +
      (opts?.maxAge ??
        loader.options.preloadMaxAge ??
        this.options.defaultPreloadMaxAge ??
        10000)

    const invalidAt =
      updatedAt +
      (opts?.maxAge ??
        loader.options.maxAge ??
        this.options.defaultMaxAge ??
        1000)

    this.setInstance(opts as any, (s) => ({
      ...s,
      error: undefined,
      updatedAt,
      data: replaceEqualDeep(s.data, data),
      preloadInvalidAt: preloadInvalidAt,
      invalidAt: invalidAt,
    }))

    return this.getInstance(opts as any).data
  }

  __hydrateLoaderInstance = <
    TKey extends keyof TLoaders,
    TResolvedLoader extends AnyLoader = TLoaders[TKey],
  >(
    opts: GetInstanceOptions<TKey, TResolvedLoader> & {
      hydrate: HydrateUpdater<
        TResolvedLoader['types']['variables'],
        TResolvedLoader['types']['data'],
        TResolvedLoader['types']['error']
      >
    },
  ) => {
    if (typeof document !== 'undefined') {
      const hydrateFn = opts?.hydrate ?? this.options.hydrateLoaderInstanceFn

      const instance = this.getInstance(opts as any)

      if (hydrateFn && instance.status === 'idle') {
        // If we have a hydrate option, we need to do that first
        const hydratedData =
          typeof hydrateFn === 'function' ? hydrateFn(instance) : hydrateFn

        if (hydratedData) {
          this.state.loaders[opts.key].instances[instance.hashedKey] = {
            ...hydratedData,
            loadPromise: Promise.resolve(),
          }
        }
      }
    }
  }

  __dehydrateLoaderInstance = <
    TKey extends keyof TLoaders,
    TResolvedLoader extends AnyLoader = TLoaders[TKey],
  >(
    opts: GetInstanceOptions<TKey, TResolvedLoader> & {
      dehydrate: (
        instance: LoaderInstance<
          TResolvedLoader['types']['variables'],
          TResolvedLoader['types']['data'],
          TResolvedLoader['types']['error']
        >,
      ) => void
    },
  ) => {
    const dehydrateFn =
      opts?.dehydrate ?? this.options.dehydrateLoaderInstanceFn

    dehydrateFn?.(this.getInstance(opts as any))
  }
}

export type GetInstanceOptions<TKey, TLoader> = TLoader extends Loader<
  infer _TKey,
  infer TVariables,
  infer TData,
  infer TError
>
  ? undefined extends TVariables
    ? {
        key: TKey
        variables?: TVariables
      }
    : { key: TKey; variables: TVariables }
  : never

export type LoaderByKey<
  TLoaders extends Record<string, AnyLoader>,
  TKey extends keyof TLoaders,
> = TLoaders[TKey]

export type LoaderInstanceByKey<
  TLoaders extends Record<string, AnyLoader>,
  TKey extends keyof TLoaders,
> = TLoaders[TKey] extends Loader<
  infer _,
  infer TVariables,
  infer TData,
  infer TError
>
  ? LoaderInstance<TVariables, TData, TError>
  : never

export type LoaderStateCallback<TKey, TVariables, TData, TError> = (ctx: {
  loader: LoaderState
  client: LoaderClient
}) => void | Promise<void>

export type LoaderInstanceCallback<TVariables, TData, TError> = (ctx: {
  instance: LoaderInstance<TVariables, TData, TError>
  client: LoaderClient
}) => void | Promise<void>

export interface NullableLoaderInstance<
  TVariables = unknown,
  TData = unknown,
  TError = Error,
> extends Omit<LoaderInstance<TVariables, TData, TError>, 'data'> {
  data?: TData
}

export interface LoaderInstance<
  TVariables = unknown,
  TData = unknown,
  TError = Error,
> {
  key: string
  hashedKey: string
  variables: TVariables
  status: 'idle' | 'pending' | 'success' | 'error'
  isFetching: boolean
  invalidAt: number
  preloadInvalidAt: number
  invalid: boolean
  updatedAt?: number
  data: TData
  error?: TError
  preload: boolean
  gcTimeout?: ReturnType<typeof setTimeout>
  loadPromise?: Promise<TData>
  fetchedAt: number
}

export type LoaderFn<TVariables, TData> = (
  variables: TVariables,
) => TData | Promise<TData>

export type LoaderOptions<
  TKey = string,
  TVariables = unknown,
  TData = unknown,
  TError = Error,
> = (
  | {
      fn: LoaderFn<TVariables, TData>
      getFn?: never
    }
  | {
      fn?: never
      getFn: (
        state: LoaderInstance<TVariables, TData, TError>,
      ) => LoaderFn<TVariables, TData>
    }
) & {
  key: TKey
  // The max age to consider loader data fresh (not-stale) in milliseconds from the time of fetch
  // Defaults to 1000. Only stale loader data is refetched.
  maxAge?: number
  preloadMaxAge?: number
  // The max age to client the loader data in milliseconds from the time of route inactivity
  // before it is garbage collected.
  gcMaxAge?: number
  onInvalidate?: LoaderStateCallback<TKey, TVariables, TData, TError>
  onEachInvalidate?: LoaderInstanceCallback<TVariables, TData, TError>
  onLatestSuccess?: LoaderInstanceCallback<TVariables, TData, TError>
  onEachSuccess?: LoaderInstanceCallback<TVariables, TData, TError>
  onLatestError?: LoaderInstanceCallback<TVariables, TData, TError>
  onEachError?: LoaderInstanceCallback<TVariables, TData, TError>
  onLatestSettled?: LoaderInstanceCallback<TVariables, TData, TError>
  onEachSettled?: LoaderInstanceCallback<TVariables, TData, TError>
  onEachOutdated?: LoaderInstanceCallback<TVariables, TData, TError>
  refetchOnWindowFocus?: boolean
  debug?: boolean
}

export type HydrateUpdater<TVariables, TData, TError> =
  | LoaderInstance<TVariables, TData, TError>
  | ((
      ctx: LoaderInstance<TVariables, TData, TError>,
    ) => LoaderInstance<TVariables, TData, TError>)

export type AnyLoader = Loader<any, any, any, any>

export class Loader<
  TKey extends string = string,
  TVariables = unknown,
  TData = unknown,
  TError = Error,
> {
  types!: {
    key: TKey
    variables: TVariables
    data: TData
    error: TError
  }
  constructor(public options: LoaderOptions<TKey, TVariables, TData, TError>) {}
}

export function createLoaderInstance<
  TVariables,
  TData = unknown,
  TError = unknown,
>(opts: {
  key: any
  hashedKey: string
  variables: any
}): LoaderInstance<TVariables, TData, TError> {
  return {
    key: opts.key,
    hashedKey: opts.hashedKey,
    variables: opts.variables,
    status: 'idle',
    invalid: false,
    invalidAt: Infinity,
    preloadInvalidAt: Infinity,
    isFetching: false,
    updatedAt: 0,
    data: undefined!,
    preload: false,
    fetchedAt: 0,
  }
}

export function hashKey(queryKey: any): string {
  return JSON.stringify(queryKey, (_, val) =>
    isPlainObject(val)
      ? Object.keys(val)
          .sort()
          .reduce((result, key) => {
            result[key] = val[key]
            return result
          }, {} as any)
      : val,
  )
}

export function typedClient(client: LoaderClient): RegisteredLoaderClient {
  return client
}

export function createLoaderOptions<
  TLoader extends AnyLoader = RegisteredLoaders,
  TLoaders extends Record<string, AnyLoader> = LoadersToRecord<TLoader>,
  TKey extends keyof TLoaders = keyof RegisteredLoaders,
  TResolvedLoader extends AnyLoader = TLoaders[TKey],
>(
  opts: GetInstanceOptions<TKey, TResolvedLoader> & {
    client?: LoaderClient<any, TLoaders>
  },
): {
  key: TKey
  variables: TResolvedLoader['types']['variables']
} {
  return opts as any
}
