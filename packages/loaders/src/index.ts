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

export interface LoaderClientOptions<
  TLoaders extends Loader<any, any, any, any>[],
> {
  loaders: TLoaders
  defaultMaxAge?: number
  defaultGcMaxAge?: number
}

export type LoaderClientStore = Store<{
  isFetching?: { key: string; variables: unknown; hashedKey: string }[]
}>
// A loader client that tracks instances of loaders by unique key like react query
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
      loader.client = this

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
    options: LoaderOptions<TKey, infer TVariables, infer TData, infer TError>
  }
    ? Loader<TKey, TVariables, TData, TError>
    : never
}[number]

export type LoaderInstanceByKey<
  TLoaders extends Loader<any, any, any, any>[],
  TKey extends TLoaders[number]['__types']['key'],
> = {
  [TLoader in TLoaders[number] as number]: TLoader extends {
    options: LoaderOptions<TKey, infer TVariables, infer TData, infer TError>
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

export type LoaderCallback<TKey extends string, TVariables, TData, TError> = (
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
  silent: boolean
}

export type LoaderFn<TLoaderPayload = unknown, TLoaderResponse = unknown> = (
  submission: TLoaderPayload,
) => TLoaderResponse | Promise<TLoaderResponse>

interface LoaderOptions<
  TKey extends string = string,
  TVariables = unknown,
  TData = unknown,
  TError = Error,
> {
  key: TKey
  // The max age to consider loader data fresh (not-stale) in milliseconds from the time of fetch
  // Defaults to 1000. Only stale loader data is refetched.
  maxAge?: number
  // The max age to client the loader data in milliseconds from the time of route inactivity
  // before it is garbage collected.
  gcMaxAge?: number
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
    silent: false,
  } as const
}

type LoadFn<TVariables, TData, TOptions> = undefined extends TVariables
  ? {
      (opts?: VariablesOptions<TVariables> & TOptions): Promise<TData>
    }
  : {
      (opts: VariablesOptions<TVariables> & TOptions): Promise<TData>
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
  options: LoaderOptions<TKey, TVariables, TData, TError>
  parentLoader?: Loader<any, any, any, any>
  key: TKey
  client?: LoaderClient<any>
  loaders: Record<string, LoaderInstance<TKey, TVariables, TData, TError>>

  __loadPromise?: Promise<TData>

  constructor(options: LoaderOptions<TKey, TVariables, TData, TError>) {
    this.options = options
    this.key = this.options.key
    this.loaders = {}
  }

  getInstance = (
    opts: VariablesOptions<TVariables>,
  ): LoaderInstance<TKey, TVariables, TData, TError> => {
    const hashedKey = hashKey([this.key, opts.variables])
    if (this.loaders[hashedKey]) {
      return this.loaders[hashedKey] as any
    }

    const loader = new LoaderInstance<TKey, TVariables, TData, TError>({
      hashedKey,
      client: this.client,
      loader: this,
      variables: opts.variables as any,
    })

    return (this.loaders[hashedKey] = loader)
  }

  load: LoadFn<
    TVariables,
    TData,
    {
      maxAge?: number
      silent?: boolean
    }
  > = async (opts: any) => {
    return this.getInstance(opts).load(opts as any)
  }

  fetch: LoadFn<
    TVariables,
    TData,
    {
      maxAge?: number
      silent?: boolean
    }
  > = async (opts: any) => {
    return this.getInstance(opts).fetch(opts as any)
  }

  invalidate: LoadFn<
    TVariables,
    TData,
    {
      maxAge?: number
    }
  > = async (opts: any) => {
    return this.getInstance(opts).fetch(opts as any)
  }

  invalidateAll = async () => {
    await Promise.all(
      Object.values(this.loaders).map((loader) => loader.invalidate()),
    )
  }

  createLoader = <TKey extends string, TVariables, TData, TError>(
    options: LoaderOptions<TKey, TVariables, TData, TError>,
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
  client?: LoaderClient
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
  client?: LoaderClient
  loader: Loader<TKey, TVariables, TData, TError>
  store: Store<LoaderStore<TData, TError>>
  variables: TVariables
  __loadPromise?: Promise<TData>
  #subscriptionCount = 0
  #fingerPrint: {
    key: TKey
    hashedKey: string
    variables: TVariables
  }

  constructor(options: LoaderInstanceOptions<TKey, TVariables, TData, TError>) {
    this.options = options
    this.client = options.client
    this.loader = options.loader
    this.hashedKey = options.hashedKey
    this.variables = options.variables
    this.#fingerPrint = {
      key: this.loader.key,
      hashedKey: this.hashedKey,
      variables: this.variables,
    }
    this.store = new Store<LoaderStore<TData, TError>>(
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
        onUpdate: (next, prev) => {
          if (!next.silent && next.isFetching !== prev.isFetching) {
            this.client?.store.setState((s) => {
              if (next.isFetching) {
                return {
                  ...s,
                  isFetching: s.isFetching
                    ? s.isFetching.concat(this.#fingerPrint)
                    : [this.#fingerPrint],
                }
              } else {
                const isFetching = s.isFetching?.filter(
                  (l) => l !== this.#fingerPrint,
                )

                return {
                  ...s,
                  isFetching: isFetching?.length ? isFetching : undefined,
                }
              }
            })
          }
        },
      },
    )

    if (this.store.listeners.size) {
      this.#stopGc()
    } else {
      this.#startGc()
    }
  }

  #gcTimeout?: ReturnType<typeof setTimeout>

  #startGc = () => {
    this.#gcTimeout = setTimeout(() => {
      this.#gcTimeout = undefined
      this.#gc()
    }, this.loader.options.gcMaxAge ?? this.client?.options.defaultGcMaxAge ?? 5 * 60 * 1000)
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

  load = async (opts?: {
    maxAge?: number
    silent?: boolean
  }): Promise<TData> => {
    // Fetch if we need to
    if (
      this.store.state.status === 'error' ||
      this.store.state.status === 'idle' ||
      this.getIsInvalid()
    ) {
      this.fetch(opts)
    }

    // If we already have data, return it
    if (this.store.state.status === 'success') {
      return this.store.state.data
    }

    // Otherwise wait for the data to be fetched
    return this.__loadPromise!
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
    const parentPromise = this.loader.parentLoader?.invalidateAll()

    return Promise.all([promise, parentPromise])
  }

  #latestId = ''

  fetch = async (opts?: {
    maxAge?: number
    silent?: boolean
  }): Promise<TData> => {
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
      silent: !!opts?.silent,
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
        this.store.setState((s) => ({
          ...s,
          isFetching: false,
        }))

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
            (opts?.maxAge ??
              this.loader.options.maxAge ??
              this.client?.options.defaultMaxAge ??
              1000),
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
