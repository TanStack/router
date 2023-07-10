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
  loaderClient: LoaderClient<infer TLoader>
}
  ? TLoader
  : Record<string, Loader>

export interface LoaderClientOptions<
  TLoader extends Record<string, AnyLoader>,
> {
  getLoaders: () => TLoader
  defaultMaxAge?: number
  defaultPreloadMaxAge?: number
  defaultGcMaxAge?: number
  defaultRefetchOnWindowFocus?: boolean
}

export type LoaderClientStore = Store<{
  isLoading: boolean
  isPreloading: boolean
}>

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

type ResolveLoaders<TLoader extends Record<string, AnyLoader>> = {
  [TKey in keyof TLoader]: TLoader[TKey] extends Loader<
    infer _,
    infer TVariables,
    infer TData,
    infer TError
  >
    ? Loader<_, TVariables, TData, TError>
    : Loader
}

// A loader client that tracks instances of loaders by unique key like react query
export class LoaderClient<
  _TLoaders extends Record<string, AnyLoader> = Record<string, Loader>,
  TLoaders extends ResolveLoaders<_TLoaders> = ResolveLoaders<_TLoaders>,
> {
  options: LoaderClientOptions<_TLoaders>
  loaders: TLoaders
  loaderInstances: Record<string, LoaderInstance> = {}
  __store: LoaderClientStore
  state: LoaderClientStore['state']

  initialized = false

  constructor(options: LoaderClientOptions<_TLoaders>) {
    this.options = options
    this.__store = new Store(
      {
        isLoading: false,
        isPreloading: false,
      },
      {
        onUpdate: () => {
          this.state = this.__store.state
        },
      },
    ) as LoaderClientStore

    this.state = this.__store.state
    this.loaders = {} as any
    this.init()
  }

  init = () => {
    if (this.initialized) return
    Object.entries(this.options.getLoaders()).forEach(
      ([key, loader]: [string, Loader]) => {
        ;(this.loaders as any)[key] = loader.init(key, this)
      },
    )
    this.initialized = true
  }

  dehydrate = (): DehydratedLoaderClient => {
    return {
      loaders: Object.values(this.loaders).reduce(
        (acc, loader: AnyLoader) => ({
          ...acc,
          [loader.key]: Object.values(loader.instances).reduce(
            (acc, instance) => ({
              ...acc,
              [instance.hashedKey]: {
                hashedKey: instance.hashedKey,
                variables: instance.variables,
                state: instance.state,
              },
            }),
            {},
          ),
        }),
        {},
      ),
    }
  }

  hydrate = (data: DehydratedLoaderClient) => {
    Object.entries(data.loaders).forEach(([loaderKey, instances]) => {
      const loader = this.loaders[loaderKey] as Loader

      Object.values(instances).forEach((dehydratedInstance) => {
        let instance = loader.instances[dehydratedInstance.hashedKey]

        if (!instance) {
          instance = loader.instances[dehydratedInstance.hashedKey] =
            loader.getInstance({
              variables: dehydratedInstance.variables,
            })
        }

        instance.__store.setState(() => dehydratedInstance.state)
      })
    })
  }
}

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
  ? LoaderInstance<_, TVariables, TData, TError>
  : never

export type LoaderCallback<TKey extends string, TVariables, TData, TError> = (
  loader: Loader<TKey, TVariables, TData, TError>,
) => void | Promise<void>

export type LoaderInstanceCallback<
  TKey extends string,
  TVariables,
  TData,
  TError,
> = (
  loader: LoaderInstance<TKey, TVariables, TData, TError>,
) => void | Promise<void>

export interface NullableLoaderStore<TData = unknown, TError = Error>
  extends Omit<LoaderStore<TData, TError>, 'data'> {
  data?: TData
}

export interface LoaderStore<TData = unknown, TError = Error> {
  status: 'idle' | 'pending' | 'success' | 'error'
  isFetching: boolean
  invalidAt: number
  preloadInvalidAt: number
  invalid: boolean
  updatedAt?: number
  data: TData
  error?: TError
  preload: boolean
}

export type LoaderFn<TVariables, TData> = (
  variables: TVariables,
) => TData | Promise<TData>

export type LoaderOptions<
  TKey extends string = string,
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
      getFn: (ctx: {
        loaderInstance: LoaderInstance<TKey, TVariables, TData, TError>
        signal: AbortSignal | null
      }) => LoaderFn<TVariables, TData>
    }
) & {
  // The max age to consider loader data fresh (not-stale) in milliseconds from the time of fetch
  // Defaults to 1000. Only stale loader data is refetched.
  maxAge?: number
  preloadMaxAge?: number
  // The max age to client the loader data in milliseconds from the time of route inactivity
  // before it is garbage collected.
  gcMaxAge?: number
  onInvalidate?: LoaderCallback<TKey, TVariables, TData, TError>
  onEachInvalidate?: LoaderInstanceCallback<TKey, TVariables, TData, TError>
  onLatestSuccess?: LoaderInstanceCallback<TKey, TVariables, TData, TError>
  onEachSuccess?: LoaderInstanceCallback<TKey, TVariables, TData, TError>
  onLatestError?: LoaderInstanceCallback<TKey, TVariables, TData, TError>
  onEachError?: LoaderInstanceCallback<TKey, TVariables, TData, TError>
  onLatestSettled?: LoaderInstanceCallback<TKey, TVariables, TData, TError>
  onEachSettled?: LoaderInstanceCallback<TKey, TVariables, TData, TError>
  onEachOutdated?: LoaderInstanceCallback<TKey, TVariables, TData, TError>
  refetchOnWindowFocus?: boolean
  debug?: boolean
}

export function getInitialLoaderState(): LoaderStore<any, any> {
  return {
    status: 'idle',
    invalid: false,
    invalidAt: Infinity,
    preloadInvalidAt: Infinity,
    isFetching: false,
    updatedAt: 0,
    data: undefined!,
    preload: false,
  } as const
}

export type VariablesOptions<TVariables> = undefined extends TVariables
  ? {
      variables?: TVariables
    }
  : {
      variables: TVariables
    }

export type VariablesFn<
  TVariables,
  TReturn,
  TOptions = {},
> = undefined extends TVariables
  ? keyof PickRequired<TOptions> extends never
    ? {
        (opts?: VariablesOptions<TVariables> & TOptions): TReturn
      }
    : {
        (opts: VariablesOptions<TVariables> & TOptions): TReturn
      }
  : {
      (opts: VariablesOptions<TVariables> & TOptions): TReturn
    }

const visibilityChangeEvent = 'visibilitychange'

export type AnyLoader = Loader<any, any, any, any>

export class Loader<
  TKey extends string = string,
  TVariables = unknown,
  TData = unknown,
  TError = Error,
> {
  __types!: {
    key: TKey
    variables: TVariables
    data: TData
    error: TError
  }
  options: LoaderOptions<TKey, TVariables, TData, TError>
  key!: TKey
  client?: LoaderClient<any>
  instances: Record<string, LoaderInstance<TKey, TVariables, TData, TError>>

  __loadPromise?: Promise<TData>

  constructor(options: LoaderOptions<TKey, TVariables, TData, TError>) {
    this.options = options
    this.instances = {}

    // addEventListener does not exist in React Native, but window does
    // In the future, we might need to invert control here for more adapters
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener(visibilityChangeEvent, this.#reloadAll, false)
    }

    Loader.onCreateFns.forEach((cb) => cb(this))
  }

  static onCreateFns: ((loader: AnyLoader) => void)[] = []

  init = (key: TKey, client: LoaderClient) => {
    this.client = client
    this.key = key
    this.instances = {}
    return this as Loader<TKey, TVariables, TData, TError>
  }

  dispose = () => {
    if (typeof window !== 'undefined' && window.removeEventListener) {
      window.removeEventListener(visibilityChangeEvent, this.#reloadAll)
    }
  }

  #reloadAll = () => {
    Object.values(this.instances).forEach((instance) => {
      instance.loadIfActive({
        isFocusReload: true,
      })
    })
  }

  getInstance: VariablesFn<
    TVariables,
    LoaderInstance<TKey, TVariables, TData, TError>
  > = (opts: any = {}) => {
    const hashedKey = hashKey([this.key, opts.variables])
    if (this.instances[hashedKey]) {
      return this.instances[hashedKey] as any
    }

    const loader = new LoaderInstance<TKey, TVariables, TData, TError>({
      hashedKey,
      loader: this,
      variables: opts.variables as any,
    })

    return (this.instances[hashedKey] = loader)
  }

  load: VariablesFn<
    TVariables,
    Promise<TData>,
    {
      maxAge?: number
      preload?: boolean
      signal?: AbortSignal
    }
  > = async (opts: any = {}) => {
    return this.getInstance(opts).load(opts as any)
  }

  fetch: VariablesFn<
    TVariables,
    Promise<TData>,
    {
      maxAge?: number
      preload?: boolean
    }
  > = async (opts: any = {}) => {
    return this.getInstance(opts).fetch(opts as any)
  }

  invalidateInstance: VariablesFn<
    TVariables,
    Promise<void>,
    {
      maxAge?: number
    }
  > = async (opts: any = {}) => {
    await this.getInstance(opts).invalidate()
    await this.options.onInvalidate?.(this)
  }

  invalidate = async () => {
    await Promise.all(
      Object.values(this.instances).map((loader) => loader.invalidate()),
    )
  }
}

export interface LoaderInstanceOptions<
  TKey extends string = string,
  TVariables = unknown,
  TData = unknown,
  TError = Error,
> {
  hashedKey: string
  loader: Loader<TKey, TVariables, TData, TError>
  variables: TVariables
}

export interface NullableLoaderInstance<
  TKey extends string = string,
  TVariables = unknown,
  TData = unknown,
  TError = Error,
> extends Omit<
    LoaderInstance<TKey, TVariables, TData, TError>,
    '__store' | 'state'
  > {
  __store: Store<NullableLoaderStore<TData, TError>>
  state: NullableLoaderStore<TData, TError>
}

export type AnyLoaderInstance = LoaderInstance<any, any, any, any>

export class LoaderInstance<
  TKey extends string = string,
  TVariables = unknown,
  TData = unknown,
  TError = Error,
> {
  __types!: {
    key: TKey
    variables: TVariables
    data: TData
    error: TError
  }
  hashedKey: string
  options: LoaderInstanceOptions<TKey, TVariables, TData, TError>
  loader: Loader<TKey, TVariables, TData, TError>
  __store: Store<LoaderStore<TData, TError>>
  state: LoaderStore<TData, TError>
  variables: TVariables
  __loadPromise?: Promise<TData>
  #subscriptionCount = 0

  constructor(options: LoaderInstanceOptions<TKey, TVariables, TData, TError>) {
    this.options = options
    this.loader = options.loader
    this.hashedKey = options.hashedKey
    this.variables = options.variables
    this.__store = new Store<LoaderStore<TData, TError>>(
      getInitialLoaderState(),
      {
        onSubscribe: () => {
          if (!this.#subscriptionCount) {
            this.#stopGc()
          }
          this.#subscriptionCount++
          return () => {
            this.#subscriptionCount--
            if (!this.#subscriptionCount) {
              this.#startGc()
            }
          }
        },
        onUpdate: () => {
          this.state = this.__store.state
          this.#notifyClient()
        },
      },
    )

    this.state = this.__store.state

    if (this.__store.listeners.size) {
      this.#stopGc()
    } else {
      this.#startGc()
    }

    LoaderInstance.onCreateFns.forEach((cb) => cb(this))
  }

  static onCreateFns: ((loader: AnyLoaderInstance) => void)[] = []

  #notifyClient = () => {
    const client = this.loader.client

    if (!client) return

    const isLoading = Object.values(client.loaders).some((loader) => {
      return Object.values(loader.instances).some(
        (instance) => instance.state.isFetching && !instance.state.preload,
      )
    })

    const isPreloading = Object.values(client.loaders).some((loader) => {
      return Object.values(loader.instances).some(
        (instance) => instance.state.isFetching && instance.state.preload,
      )
    })

    if (
      client.state.isLoading === isLoading &&
      client.state.isPreloading === isPreloading
    ) {
      return
    }

    client.__store.setState((s) => {
      return {
        isLoading,
        isPreloading,
      }
    })
  }

  #gcTimeout?: ReturnType<typeof setTimeout>

  #startGc = () => {
    this.#gcTimeout = setTimeout(() => {
      this.#gcTimeout = undefined
      this.#gc()
    }, this.loader.options.gcMaxAge ?? this.loader.client?.options.defaultGcMaxAge ?? 5 * 60 * 1000)
  }

  #stopGc = () => {
    if (this.#gcTimeout) {
      clearTimeout(this.#gcTimeout)
      this.#gcTimeout = undefined
    }
  }

  #gc = () => {
    this.#destroy()
  }

  #destroy = () => {
    delete this.loader.instances[this.hashedKey]
  }

  getIsInvalid = (opts?: { preload?: boolean }) => {
    const now = Date.now()

    return (
      this.state.status === 'success' &&
      (this.state.invalid ||
        (opts?.preload ? this.state.preloadInvalidAt : this.state.invalidAt) <
          now)
    )
  }

  invalidate = async () => {
    this.__store.setState((s) => ({
      ...s,
      invalid: true,
    }))

    await this.loadIfActive()

    await this.loader.options.onEachInvalidate?.(this)
  }

  loadIfActive = async (opts?: { isFocusReload?: boolean }) => {
    if (this.__store.listeners.size) {
      this.load(opts)
      try {
        await this.__loadPromise
      } catch (err) {
        // Ignore
      }
    }
  }

  load = async (opts?: {
    maxAge?: number
    preload?: boolean
    isFocusReload?: boolean
    signal?: AbortSignal
  }): Promise<TData> => {
    if (opts?.isFocusReload) {
      if (
        !(
          this.loader.options.refetchOnWindowFocus ??
          this.loader.client?.options.defaultRefetchOnWindowFocus ??
          true
        )
      ) {
        return this.state.data!
      }
    }

    if (
      this.state.status === 'error' ||
      this.state.status === 'idle' ||
      this.getIsInvalid(opts)
    ) {
      // Fetch if we need to
      if (!this.__loadPromise) {
        this.fetch(opts).catch(() => {
          // Ignore
        })
      }
    }

    // If we already have data, return it
    if (typeof this.state.data !== 'undefined') {
      return this.state.data!
    }

    // Otherwise wait for the data to be fetched
    return this.__loadPromise!
  }

  #latestId = ''

  fetch = async (opts?: {
    maxAge?: number
    preload?: boolean
    signal?: AbortSignal
  }): Promise<TData> => {
    // this.store.batch(() => {
    // If the match was in an error state, set it
    // to a loading state again. Otherwise, keep it
    // as loading or resolved
    if (this.state.status === 'idle') {
      this.__store.setState((s) => ({
        ...s,
        status: 'pending',
      }))
    }

    // We started loading the route, so it's no longer invalid
    this.__store.setState((s) => ({
      ...s,
      preload: !!opts?.preload,
      invalid: false,
      isFetching: true,
    }))
    // })

    const loadId = '' + Date.now() + Math.random()
    this.#latestId = loadId

    const hasNewer = () => {
      return loadId !== this.#latestId ? this.__loadPromise : undefined
    }

    let newer: ReturnType<typeof hasNewer>

    this.__loadPromise = Promise.resolve().then(async () => {
      const after = async () => {
        this.__store.setState((s) => ({
          ...s,
          isFetching: false,
        }))

        if ((newer = hasNewer())) {
          await this.loader.options.onLatestSettled?.(this)
          return newer
        } else {
          await this.loader.options.onEachSettled?.(this)
        }

        return
      }

      try {
        const loaderFn =
          this.loader.options.getFn?.({
            loaderInstance: this,
            signal: opts?.signal ?? null,
          }) ?? this.loader.options.fn!

        const data = await loaderFn(this.variables as any)

        invariant(
          typeof data !== 'undefined',
          'The data returned from a loader cannot be undefined.',
        )

        if ((newer = hasNewer())) return newer

        const updatedAt = Date.now()

        const preloadInvalidAt =
          updatedAt +
          (opts?.maxAge ??
            this.loader.options.preloadMaxAge ??
            this.loader.client?.options.defaultPreloadMaxAge ??
            10000)

        const invalidAt =
          updatedAt +
          (opts?.maxAge ??
            this.loader.options.maxAge ??
            this.loader.client?.options.defaultMaxAge ??
            1000)

        this.__store.setState((s) => ({
          ...s,
          error: undefined,
          updatedAt,
          data: replaceEqualDeep(s.data, data),
          preloadInvalidAt: preloadInvalidAt,
          invalidAt: invalidAt,
        }))

        if ((newer = hasNewer())) {
          await this.loader.options.onLatestSuccess?.(this)
          return newer
        } else {
          await this.loader.options.onEachSuccess?.(this)
        }

        this.__store.setState((s) => ({
          ...s,
          status: 'success',
        }))

        await after()

        return this.state.data!
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.error(err)
        }

        this.__store.setState((s) => ({
          ...s,
          error: err as TError,
          updatedAt: Date.now(),
        }))

        if ((newer = hasNewer())) {
          await this.loader.options.onLatestError?.(this)
          return newer
        } else {
          await this.loader.options.onEachError?.(this)
        }

        this.__store.setState((s) => ({
          ...s,
          status: 'error',
        }))

        await after()

        throw err
      }
    })

    this.__loadPromise
      .then(() => {
        delete this.__loadPromise
      })
      .catch(() => {})

    return this.__loadPromise
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

type PickRequired<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K]
}
