import { GetFrameworkGeneric } from './frameworks'
import { Route } from './route'
import {
  AnyAllRouteInfo,
  AnyRouteInfo,
  DefaultAllRouteInfo,
  RouteInfo,
} from './routeInfo'
import { AnyRouter, Router } from './router'
import { batch, createStore, Store } from './store'
import { Expand } from './utils'
import { replaceEqualDeep } from './interop'

export interface RouteMatchStore<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouteInfo extends AnyRouteInfo = RouteInfo,
> {
  routeSearch: TRouteInfo['searchSchema']
  search: Expand<
    TAllRouteInfo['fullSearchSchema'] & TRouteInfo['fullSearchSchema']
  >
  status: 'idle' | 'loading' | 'success' | 'error'
  updatedAt?: number
  error?: unknown
  invalid: boolean
  loaderData: TRouteInfo['loaderData']
  routeLoaderData: TRouteInfo['routeLoaderData']
  isFetching: boolean
  invalidAt: number
}

const componentTypes = [
  'component',
  'errorComponent',
  'pendingComponent',
] as const

export class RouteMatch<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouteInfo extends AnyRouteInfo = RouteInfo,
> {
  route!: Route<TAllRouteInfo, TRouteInfo>
  router!: Router<TAllRouteInfo['routeConfig'], TAllRouteInfo>
  store!: Store<RouteMatchStore<TAllRouteInfo, TRouteInfo>>
  id!: string
  pathname!: string
  params!: TRouteInfo['allParams']

  component: GetFrameworkGeneric<'Component'>
  errorComponent: GetFrameworkGeneric<'ErrorComponent'>
  pendingComponent: GetFrameworkGeneric<'Component'>
  abortController = new AbortController()
  #latestId = ''
  #resolve = () => {}
  onLoaderDataListeners = new Set<() => void>()
  parentMatch?: RouteMatch

  __loadPromise?: Promise<void>
  __onExit?:
    | void
    | ((matchContext: {
        params: TRouteInfo['allParams']
        search: TRouteInfo['fullSearchSchema']
      }) => void)

  constructor(
    router: AnyRouter,
    route: Route<TAllRouteInfo, TRouteInfo>,
    opts: {
      matchId: string
      params: TRouteInfo['allParams']
      pathname: string
    },
  ) {
    Object.assign(this, {
      route,
      router,
      matchId: opts.matchId,
      pathname: opts.pathname,
      params: opts.params,
      store: createStore<RouteMatchStore<TAllRouteInfo, TRouteInfo>>({
        routeSearch: {},
        search: {} as any,
        status: 'idle',
        routeLoaderData: {} as TRouteInfo['routeLoaderData'],
        loaderData: {} as TRouteInfo['loaderData'],
        isFetching: false,
        invalid: false,
        invalidAt: Infinity,
      }),
    })

    if (!this.__hasLoaders()) {
      this.store.setState((s) => (s.status = 'success'))
    }
  }

  #setLoaderData = (loaderData: TRouteInfo['routeLoaderData']) => {
    batch(() => {
      this.store.setState((s) => {
        s.routeLoaderData = loaderData
      })
      this.#updateLoaderData()
    })
  }

  cancel = () => {
    this.abortController?.abort()
  }

  load = async (
    loaderOpts?:
      | { preload: true; maxAge: number; gcMaxAge: number }
      | { preload?: false; maxAge?: never; gcMaxAge?: never },
  ): Promise<void> => {
    const now = Date.now()
    const minMaxAge = loaderOpts?.preload
      ? Math.max(loaderOpts?.maxAge, loaderOpts?.gcMaxAge)
      : 0

    // If this is a preload, add it to the preload cache
    if (loaderOpts?.preload && minMaxAge > 0) {
      // If the match is currently active, don't preload it
      if (
        this.router.store.state.currentMatches.find((d) => d.id === this.id)
      ) {
        return
      }

      this.router.store.setState((s) => {
        s.matchCache[this.id] = {
          gc: now + loaderOpts.gcMaxAge,
          match: this as RouteMatch<any, any>,
        }
      })
    }

    // If the match is invalid, errored or idle, trigger it to load
    if (
      (this.store.state.status === 'success' && this.getIsInvalid()) ||
      this.store.state.status === 'error' ||
      this.store.state.status === 'idle'
    ) {
      const maxAge = loaderOpts?.preload ? loaderOpts?.maxAge : undefined
      await this.fetch({ maxAge })
    }
  }

  fetch = async (opts?: {
    maxAge?: number
  }): Promise<TRouteInfo['routeLoaderData']> => {
    this.__loadPromise = new Promise(async (resolve) => {
      const loadId = '' + Date.now() + Math.random()
      this.#latestId = loadId

      const checkLatest = () =>
        loadId !== this.#latestId
          ? this.__loadPromise?.then(() => resolve())
          : undefined

      let latestPromise

      batch(() => {
        // If the match was in an error state, set it
        // to a loading state again. Otherwise, keep it
        // as loading or resolved
        if (this.store.state.status === 'idle') {
          this.store.setState((s) => (s.status = 'loading'))
        }

        // We started loading the route, so it's no longer invalid
        this.store.setState((s) => (s.invalid = false))
      })

      // We are now fetching, even if it's in the background of a
      // resolved state
      this.store.setState((s) => (s.isFetching = true))
      this.#resolve = resolve as () => void

      const componentsPromise = (async () => {
        // then run all component and data loaders in parallel
        // For each component type, potentially load it asynchronously

        await Promise.all(
          componentTypes.map(async (type) => {
            const component = this.route.options[type]

            if (this[type]?.preload) {
              this[type] = await this.router.options.loadComponent!(component)
            }
          }),
        )
      })()

      const dataPromise = Promise.resolve().then(async () => {
        try {
          if (this.route.options.loader) {
            const data = await this.router.loadMatchData(this)
            if ((latestPromise = checkLatest())) return latestPromise

            this.#setLoaderData(data)
          }

          this.store.setState((s) => {
            s.error = undefined
            s.status = 'success'
            s.updatedAt = Date.now()
            s.invalidAt =
              s.updatedAt +
              (opts?.maxAge ??
                this.route.options.loaderMaxAge ??
                this.router.options.defaultLoaderMaxAge ??
                0)
          })

          return this.store.state.routeLoaderData
        } catch (err) {
          if ((latestPromise = checkLatest())) return latestPromise

          if (process.env.NODE_ENV !== 'production') {
            console.error(err)
          }

          this.store.setState((s) => {
            s.error = err
            s.status = 'error'
            s.updatedAt = Date.now()
          })

          throw err
        }
      })

      const after = async () => {
        if ((latestPromise = checkLatest())) return latestPromise
        this.store.setState((s) => (s.isFetching = false))
        this.#resolve()
        delete this.__loadPromise
      }

      try {
        await Promise.all([componentsPromise, dataPromise.catch(() => {})])
        after()
      } catch {
        after()
      }
    })

    return this.__loadPromise
  }
  invalidate = async () => {
    this.store.setState((s) => (s.invalid = true))
    if (this.router.store.state.currentMatches.find((d) => d.id === this.id)) {
      await this.load()
    }
  }
  __hasLoaders = () => {
    return !!(
      this.route.options.loader ||
      componentTypes.some((d) => this.route.options[d]?.preload)
    )
  }
  getIsInvalid = () => {
    const now = Date.now()
    return this.store.state.invalid || this.store.state.invalidAt < now
  }

  #updateLoaderData = () => {
    this.store.setState((s) => {
      s.loaderData = replaceEqualDeep(s.loaderData, {
        ...this.parentMatch?.store.state.loaderData,
        ...s.routeLoaderData,
      }) as TRouteInfo['loaderData']
    })
    this.onLoaderDataListeners.forEach((listener) => listener())
  }

  __setParentMatch = (parentMatch?: RouteMatch) => {
    if (!this.parentMatch && parentMatch) {
      this.parentMatch = parentMatch
      this.parentMatch.__onLoaderData(() => {
        this.#updateLoaderData()
      })
    }
  }

  __onLoaderData = (listener: () => void) => {
    this.onLoaderDataListeners.add(listener)
    // return () => this.onLoaderDataListeners.delete(listener)
  }

  __validate = () => {
    // Validate the search params and stabilize them
    const parentSearch =
      this.parentMatch?.store.state.search ??
      this.router.store.state.latestLocation.search

    try {
      const prevSearch = this.store.state.routeSearch

      const validator =
        typeof this.route.options.validateSearch === 'object'
          ? this.route.options.validateSearch.parse
          : this.route.options.validateSearch

      let nextSearch = validator?.(parentSearch) ?? {}

      batch(() => {
        // Invalidate route matches when search param stability changes
        if (prevSearch !== nextSearch) {
          this.store.setState((s) => (s.invalid = true))
        }

        this.store.setState((s) => {
          s.routeSearch = nextSearch
          s.search = {
            ...parentSearch,
            ...nextSearch,
          } as any
        })
      })

      componentTypes.map(async (type) => {
        const component = this.route.options[type]

        if (typeof this[type] !== 'function') {
          this[type] = component
        }
      })
    } catch (err: any) {
      console.error(err)
      const error = new (Error as any)('Invalid search params found', {
        cause: err,
      })
      error.code = 'INVALID_SEARCH_PARAMS'

      this.store.setState((s) => {
        s.status = 'error'
        s.error = error
      })

      // Do not proceed with loading the route
      return
    }
  }
}
