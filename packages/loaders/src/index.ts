import { Store } from '@tanstack/store'
import { isPlainObject, replaceEqualDeep } from './utils'

export interface RegisterLoaderClient {
  // loaderClient: LoaderClient
}

export type RegisteredLoaderClient = RegisterLoaderClient extends {
  loaderClient: LoaderClient<infer TLoaders>
}
  ? LoaderClient<TLoaders>
  : LoaderClient

export type RegisteredLoaders = RegisterLoaderClient extends {
  loaderClient: LoaderClient<infer TLoaders>
}
  ? TLoaders
  : Loader<any, any, any, any>[]

interface LoaderClientOptions<TLoaders extends Loader<any, any, any, any>[]> {
  loaders: TLoaders
}

type LoaderClientStore = Store<{
  isFetching?: LoaderInstance<any, any, any, any>[]
}>
// A loader cache that tracks instances of loaders by unique key like react query
export class LoaderClient<
  TLoaders extends Loader<any, any, any, any>[] = Loader[],
> {
  options: LoaderClientOptions<TLoaders>
  loaders: Record<string, Loader>
  store: LoaderClientStore

  constructor(options: LoaderClientOptions<TLoaders>) {
    this.options = options
    this.store = new Store({}) as LoaderClientStore
    this.loaders = {}

    this.options.loaders.forEach((loader) => {
      loader.cache = this

      this.loaders[loader.key] = loader
    })
  }

  getLoader<TKey extends TLoaders[number]['__types']['key']>(opts: {
    key: TKey
  }): LoaderByKey<TLoaders, TKey> {
    return this.loaders[opts.key as any] as any
  }
}

export type LoaderByKey<
  TLoaders extends Loader<any, any, any, any>[],
  TKey extends TLoaders[number]['__types']['key'],
> = {
  [TLoader in TLoaders[number] as number]: TLoader extends {
    options: LoaderApiOptions<TKey, infer TVariables, infer TData, infer TError>
  }
    ? Loader<TKey, TVariables, TData, TError>
    : never
}[number]

export type LoaderInstanceByKey<
  TLoaders extends Loader<any, any, any, any>[],
  TKey extends TLoaders[number]['__types']['key'],
> = {
  [TLoader in TLoaders[number] as number]: TLoader extends {
    options: LoaderApiOptions<TKey, infer TVariables, infer TData, infer TError>
  }
    ? LoaderInstance<TKey, TVariables, TData, TError>
    : never
}[number]

export type VariablesOptions<TVariables> = unknown extends TVariables
  ? {
      variables?: TVariables
    }
  : {
      variables: TVariables
    }

type LoaderCallback<TKey extends string, TVariables, TData, TError> = (
  loader: LoaderInstance<TKey, TVariables, TData, TError>,
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

interface LoaderApiOptions<
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
    Loader: LoaderInstance<TKey, TVariables, TData, TError>,
  ) => TData | Promise<TData>
  onLatestSuccess?: LoaderCallback<TKey, TVariables, TData, TError>
  onEachSuccess?: LoaderCallback<TKey, TVariables, TData, TError>
  onLatestError?: LoaderCallback<TKey, TVariables, TData, TError>
  onEachError?: LoaderCallback<TKey, TVariables, TData, TError>
  onLatestSettled?: LoaderCallback<TKey, TVariables, TData, TError>
  onEachSettled?: LoaderCallback<TKey, TVariables, TData, TError>
  onEachOutdated?: LoaderCallback<TKey, TVariables, TData, TError>
  debug?: boolean
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
  options: LoaderApiOptions<TKey, TVariables, TData, TError>
  parentLoader?: Loader<any, any, any, any>
  key: TKey
  cache?: LoaderClient<any>
  loaders: Record<string, LoaderInstance<TKey, TVariables, TData, TError>>

  __loadPromise?: Promise<TData>

  constructor(options: LoaderApiOptions<TKey, TVariables, TData, TError>) {
    this.options = options
    this.key = this.options.key
    this.loaders = {}
  }

  getLoader = (
    opts: VariablesOptions<TVariables>,
  ): LoaderInstance<TKey, TVariables, TData, TError> => {
    const hashedKey = hashKey([this.key, opts.variables])
    if (this.loaders[hashedKey]) {
      return this.loaders[hashedKey] as any
    }

    const loader = new LoaderInstance<TKey, TVariables, TData, TError>({
      hashedKey,
      cache: this.cache,
      loader: this,
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

  invalidate = () => {
    Object.values(this.loaders).forEach((loader) => loader.invalidate())
  }

  createLoader = <TKey extends string, TVariables, TData, TError>(
    options: LoaderApiOptions<TKey, TVariables, TData, TError>,
  ): Loader<TKey, TVariables, TData, TError> => {
    const loader = new Loader(options)
    loader.parentLoader = this
    return loader
  }
}

export interface LoaderInstanceOptions<
  TKey extends string = string,
  TVariables = unknown,
  TData = unknown,
  TError = Error,
> {
  hashedKey: string
  cache?: LoaderClient
  loader: Loader<TKey, TVariables, TData, TError>
  variables: TVariables
}

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
  cache?: LoaderClient
  loader: Loader<TKey, TVariables, TData, TError>
  store: Store<LoaderStore<TData, TError>>
  variables: TVariables
  __loadPromise?: Promise<TData>

  constructor(options: LoaderInstanceOptions<TKey, TVariables, TData, TError>) {
    this.options = options
    this.cache = options.cache
    this.loader = options.loader
    this.hashedKey = options.hashedKey
    this.variables = options.variables
    this.store = new Store<LoaderStore<TData, TError>>(getInitialLoaderState())
    this.#startGc()

    this.store.subscribe((next, prev) => {
      if (next.isFetching !== prev.isFetching) {
        this.cache?.store.setState((s) => {
          if (next.isFetching) {
            return {
              ...s,
              isFetching: s.isFetching
                ? s.isFetching.concat(this as any)
                : [this as any],
            }
          } else {
            return {
              ...s,
              isFetching:
                s.isFetching?.length === 1 && s.isFetching?.[0] === this
                  ? []
                  : s.isFetching?.filter((l) => l !== (this as any)),
            }
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
    }, this.loader.options.loaderGcMaxAge ?? 5 * 60 * 1000)
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
    delete this.loader.loaders[this.hashedKey]
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

  invalidate = async () => {
    this.store.setState((s) => ({
      ...s,
      invalid: true,
    }))

    const promise = this.store.listeners.size ? this.load() : undefined
    const parentPromise = this.loader.parentLoader?.invalidate()

    return Promise.all([promise, parentPromise])
  }

  #latestId = ''

  #fetch = async (opts?: { maxAge?: number }): Promise<TData> => {
    // this.store.batch(() => {
    // If the match was in an error state, set it
    // to a loading state again. Otherwise, keep it
    // as loading or resolved
    if (this.store.state.status === 'idle') {
      this.store.setState((s) => ({
        ...s,
        status: 'pending',
      }))
    }

    // We started loading the route, so it's no longer invalid
    this.store.setState((s) => ({
      ...s,
      invalid: true,
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
        delete this.__loadPromise

        if ((newer = hasNewer())) {
          await this.loader.options.onLatestSettled?.(this)
          return newer
        } else {
          await this.loader.options.onEachSettled?.(this)
        }

        return
      }

      try {
        const data = await this.loader.options.loader(
          this.variables as any,
          this,
        )

        if ((newer = hasNewer())) return newer

        const updatedAt = Date.now()

        this.store.setState((s) => ({
          ...s,
          error: undefined,
          updatedAt,
          data: replaceEqualDeep(s.data, data),
          invalidAt:
            updatedAt +
            (opts?.maxAge ?? this.loader.options.loaderMaxAge ?? 1000),
        }))

        if ((newer = hasNewer())) {
          await this.loader.options.onLatestSuccess?.(this)
          return newer
        } else {
          await this.loader.options.onEachSuccess?.(this)
        }

        this.store.setState((s) => ({
          ...s,
          status: 'success',
        }))

        await after()

        return this.store.state.data
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.error(err)
        }

        this.store.setState((s) => ({
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

        this.store.setState((s) => ({
          ...s,
          status: 'error',
        }))

        throw err
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
