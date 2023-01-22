import { Store } from './store'
import { isPlainObject, replaceEqualDeep } from './utils'

interface LoaderCacheOptions<
  TLoaderConfigs extends LoaderConfig<any, any, any, any>[],
> {
  loaderConfigs: TLoaderConfigs
}

type LoaderCacheStore = Store<{
  isFetching?: Loader<any, any, any, any>[]
}>
// A loader cache that tracks instances of loaders by unique key like react query
export class LoaderCache<
  TLoaderConfigs extends LoaderConfig<any, any, any, any>[] = LoaderConfig[],
> {
  options: LoaderCacheOptions<TLoaderConfigs>
  #loaderApis: Record<string, LoaderApi>
  store: LoaderCacheStore

  constructor(options: LoaderCacheOptions<TLoaderConfigs>) {
    this.options = options
    this.store = new Store({}) as LoaderCacheStore
    this.#loaderApis = {}

    this.options.loaderConfigs.forEach((loaderConfig) => {
      // @ts-ignore
      const loaderApi = new LoaderApi({
        cache: this as any,
        config: loaderConfig,
      })

      this.#loaderApis[loaderApi.key] = loaderApi
    })
  }

  getLoader<TKey extends TLoaderConfigs[number]['options']['key']>(opts: {
    key: TKey
  }): LoaderApiByKey<TLoaderConfigs, TKey> {
    return this.#loaderApis[opts.key as any] as any
  }
}

export type LoaderApiByKey<
  TLoaderConfigs extends LoaderConfig<any, any, any, any>[],
  TKey extends string,
> = {
  [TLoaderConfig in TLoaderConfigs[number] as number]: TLoaderConfig extends {
    options: LoaderConfigOptions<
      TKey,
      infer TVariables,
      infer TData,
      infer TError
    >
  }
    ? LoaderApi<TKey, TVariables, TData, TError>
    : never
}[number]

export interface LoaderConfigOptions<
  TKey extends string = string,
  TVariables = unknown,
  TData = unknown,
  TError = Error,
> {
  key: TKey
  // The max age to consider loader data fresh (not-stale) for this route in milliseconds from the time of fetch
  // Defaults to 0. Only stale loader data is refetched.
  loaderMaxAge?: number
  // The max age to cache the loader data for this route in milliseconds from the time of route inactivity
  // before it is garbage collected.
  loaderGcMaxAge?: number
  loader: (
    variables: TVariables,
    Loader: Loader<TKey, TVariables, TData, TError>,
  ) => TData | Promise<TData>
  onLatestSuccess?: LoaderCallback<TData, TError>
  onEachSuccess?: LoaderCallback<TData, TError>
  onLatestError?: LoaderCallback<TData, TError>
  onEachError?: LoaderCallback<TData, TError>
  onLatestSettled?: LoaderCallback<TData, TError>
  onEachSettled?: LoaderCallback<TData, TError>
  debug?: boolean
}

export type VariablesOptions<TVariables> = unknown extends TVariables
  ? {
      variables?: TVariables
    }
  : {
      variables: TVariables
    }

type LoaderCallback<TData, TError> = (
  loaderState: LoaderStore<TData, TError>,
) => void | Promise<void>

export interface LoaderStore<TData = unknown, TError = Error> {
  status: 'idle' | 'pending' | 'success' | 'error'
  isFetching: boolean
  invalidAt: number
  invalid: boolean
  updatedAt?: number
  data: TData
  error?: TError
}

export type LoaderFn<TLoaderPayload = unknown, TLoaderResponse = unknown> = (
  submission: TLoaderPayload,
) => TLoaderResponse | Promise<TLoaderResponse>

export interface LoaderConfig<
  TKey extends string = string,
  TVariables = unknown,
  TData = unknown,
  TError = Error,
> {
  options: LoaderConfigOptions<TKey, TVariables, TData, TError>
  parentLoaderConfig?: LoaderConfig
  createLoaderConfig: CreateLoaderConfigFn
}

export type CreateLoaderConfigFn = <
  TKey extends string = string,
  TVariables = unknown,
  TData = unknown,
  TError = Error,
>(
  options: LoaderConfigOptions<TKey, TVariables, TData, TError>,
  parentLoaderConfig?: LoaderConfig,
) => LoaderConfig<TKey, TVariables, TData, TError>

export function createLoaderConfig<
  TKey extends string = string,
  TVariables = unknown,
  TData = unknown,
  TError = Error,
>(
  options: LoaderConfigOptions<TKey, TVariables, TData, TError>,
  parentLoaderConfig?: LoaderConfig,
): LoaderConfig<TKey, TVariables, TData, TError> {
  const loaderConfig: LoaderConfig<TKey, TVariables, TData, TError> = {
    options,
    parentLoaderConfig,
    createLoaderConfig: (options) => {
      return createLoaderConfig(options, loaderConfig as any)
    },
  }

  return loaderConfig
}

interface LoaderApiOptions<
  TKey extends string = string,
  TVariables = unknown,
  TData = unknown,
  TError = Error,
> {
  cache: LoaderCache
  config: LoaderConfig<TKey, TVariables, TData, TError>
}

export function getInitialLoaderState() {
  return {
    status: 'idle',
    invalid: false,
    invalidAt: Infinity,
    isFetching: false,
    updatedAt: 0,
    data: undefined!,
  } as const
}

export class LoaderApi<
  TKey extends string = string,
  TVariables = unknown,
  TData = unknown,
  TError = Error,
> {
  options: LoaderConfigOptions<TKey, TVariables, TData, TError>
  parentLoaderConfig?: LoaderConfig<string, unknown, unknown, Error>
  key: TKey
  cache: LoaderCache
  loaders: Record<string, Loader<TKey, TVariables, TData, TError>>

  __loadPromise?: Promise<TData>

  constructor(options: LoaderApiOptions<TKey, TVariables, TData, TError>) {
    this.options = options.config.options
    this.parentLoaderConfig = options.config.parentLoaderConfig
    this.key = this.options.key
    this.cache = options.cache
    this.loaders = {}
  }

  getLoader = (
    opts: VariablesOptions<TVariables>,
  ): Loader<TKey, TVariables, TData, TError> => {
    const hashedKey = hashKey([this.key, opts.variables])
    if (this.loaders[hashedKey]) {
      return this.loaders[hashedKey] as any
    }

    const loader = new Loader<TKey, TVariables, TData, TError>({
      hashedKey,
      cache: this.cache,
      loaderApi: this,
      variables: opts.variables as any,
    })

    return (this.loaders[hashedKey] = loader)
  }

  preload = async (
    ...params: unknown extends TVariables
      ? [TVariables?, { maxAge?: number }?]
      : [TVariables, { maxAge?: number }?]
  ): Promise<TData> => {
    const [variables, opts] = params
    const loader = this.getLoader({
      variables: variables as any,
    })

    return await loader.preload(opts as any)
  }

  load = async (
    ...params: unknown extends TVariables
      ? [TVariables?, { maxAge?: number }?]
      : [TVariables, { maxAge?: number }?]
  ): Promise<TData> => {
    const [variables, opts] = params
    const loader = this.getLoader({
      variables: variables as any,
    })

    return loader.load(opts as any)
  }
}

export interface LoaderOptions<
  TKey extends string = string,
  TVariables = unknown,
  TData = unknown,
  TError = Error,
> {
  hashedKey: string
  cache: LoaderCache
  loaderApi: LoaderApi<TKey, TVariables, TData, TError>
  variables: TVariables
}

export class Loader<
  TKey extends string = string,
  TVariables = unknown,
  TData = unknown,
  TError = Error,
> {
  hashedKey: string
  options: LoaderOptions<TKey, TVariables, TData, TError>
  cache: LoaderCache
  loaderApi: LoaderApi<TKey, TVariables, TData, TError>
  store: Store<LoaderStore<TData, TError>>
  variables: TVariables
  __loadPromise?: Promise<TData>

  constructor(options: LoaderOptions<TKey, TVariables, TData, TError>) {
    this.options = options
    this.cache = options.cache
    this.loaderApi = options.loaderApi
    this.hashedKey = options.hashedKey
    this.variables = options.variables
    this.store = new Store<LoaderStore<TData, TError>>(getInitialLoaderState())
    this.#startGc()

    this.store.subscribe((next, prev) => {
      if (next.isFetching !== prev.isFetching) {
        this.cache.store.setState((s) => {
          if (next.isFetching) {
            s.isFetching = s.isFetching
              ? s.isFetching.concat(this as any)
              : [this as any]
          } else {
            s.isFetching =
              s.isFetching?.length === 1 && s.isFetching?.[0] === this
                ? []
                : s.isFetching?.filter((l) => l !== (this as any))
          }
        })
      }
    })
  }

  #gcTimeout?: ReturnType<typeof setTimeout>

  #startGc = () => {
    this.#gcTimeout = setTimeout(() => {
      this.#gcTimeout = undefined
      this.#gc()
    }, this.loaderApi.options.loaderGcMaxAge ?? 5 * 60 * 1000)
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
    delete this.loaderApi.loaders[this.hashedKey]
  }

  #subscriptionCount = 0

  subscribe = (fn: (state: LoaderStore<TData, TError>) => void) => {
    const unsub = this.store.subscribe(fn)
    this.#subscriptionCount++
    if (this.#subscriptionCount > 0) {
      this.#stopGc()
    }
    return () => {
      unsub()
      this.#subscriptionCount--
      if (!this.#subscriptionCount) {
        this.#startGc()
      }
    }
  }

  preload = async (opts?: { maxAge?: number }): Promise<TData> => {
    const promise = this.load(opts)

    if (this.store.state.status === 'success') {
      return this.store.state.data
    }

    return promise
  }

  load = async (opts?: { maxAge?: number }): Promise<TData> => {
    if (this.__loadPromise) {
      return this.__loadPromise
    }

    if (
      this.store.state.status === 'error' ||
      this.store.state.status === 'idle' ||
      this.getIsInvalid()
    ) {
      return this.#fetch(opts)
    }

    return this.store.state.data
  }

  getIsInvalid = () => {
    const now = Date.now()
    return (
      this.store.state.status === 'success' &&
      (this.store.state.invalid || this.store.state.invalidAt < now)
    )
  }

  invalidate = () => {
    this.store.setState((s) => {
      s.invalid = true
    })
    const parentLoaderConfig = this.loaderApi.parentLoaderConfig
    if (parentLoaderConfig) {
      this.cache.getLoader({ key: parentLoaderConfig.options.key })
    }
  }

  #latestId = ''

  #fetch = async (opts?: { maxAge?: number }): Promise<TData> => {
    // this.store.batch(() => {
    // If the match was in an error state, set it
    // to a loading state again. Otherwise, keep it
    // as loading or resolved
    if (this.store.state.status === 'idle') {
      this.store.setState((s) => (s.status = 'pending'))
    }

    // We started loading the route, so it's no longer invalid
    this.store.setState((s) => {
      s.invalid = false
      s.isFetching = true
    })
    // })

    const loadId = '' + Date.now() + Math.random()
    this.#latestId = loadId

    const checkLatest = () => {
      return loadId !== this.#latestId ? this.__loadPromise : undefined
    }

    let latestPromise

    this.__loadPromise = Promise.resolve().then(async () => {
      try {
        const data = await this.loaderApi.options.loader(
          this.variables as any,
          this,
        )
        if ((latestPromise = checkLatest())) return latestPromise
        this.store.setState((s) => {
          s.data = replaceEqualDeep(s.data, data)
        })

        this.store.setState((s) => {
          s.error = undefined
          s.status = 'success'
          s.updatedAt = Date.now()
          s.invalidAt =
            s.updatedAt +
            (opts?.maxAge ?? this.loaderApi.options.loaderMaxAge ?? 1000)
        })

        return this.store.state.data
      } catch (err) {
        if ((latestPromise = checkLatest())) return latestPromise

        if (process.env.NODE_ENV !== 'production') {
          console.error(err)
        }

        this.store.setState((s) => {
          s.error = err as TError
          s.status = 'error'
          s.updatedAt = Date.now()
        })

        throw err
      } finally {
        delete this.__loadPromise
      }
    })

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

export function partialDeepEqual(a: any, b: any): boolean {
  if (a === b) {
    return true
  }

  if (typeof a !== typeof b) {
    return false
  }

  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return !Object.keys(b).some((key) => !partialDeepEqual(a[key], b[key]))
  }

  return false
}
